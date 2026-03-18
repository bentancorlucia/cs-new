import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/supabase/roles";
import * as XLSX from "xlsx";

const TIENDA_ROLES = ["super_admin", "tienda"];

const UNIDADES_VALIDAS = ["un", "kg", "lt", "mt", "par", "docena"];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface FilaProducto {
  nombre: string;
  descripcion?: string | null;
  descripcion_corta?: string | null;
  categoria?: string | null;
  precio: number;
  precio_socio?: number | null;
  sku?: string | null;
  stock_actual?: number;
  stock_minimo?: number;
  unidad?: string;
  activo?: boolean;
  destacado?: boolean;
}

function parseBoolean(val: unknown): boolean {
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val === 1;
  if (typeof val === "string") {
    const v = val.toLowerCase().trim();
    return v === "si" || v === "sí" || v === "true" || v === "1" || v === "yes";
  }
  return false;
}

function normalizeRow(row: Record<string, unknown>): FilaProducto | null {
  // Normalize keys: lowercase, trim, remove accents
  const normalized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    const k = key
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_");
    normalized[k] = val;
  }

  const nombre = String(normalized.nombre || "").trim();
  if (!nombre) return null;

  const precio = Number(normalized.precio);
  if (!precio || precio <= 0) return null;

  const precioSocio = normalized.precio_socio
    ? Number(normalized.precio_socio)
    : null;

  const unidad = String(normalized.unidad || "un")
    .toLowerCase()
    .trim();

  return {
    nombre,
    descripcion: normalized.descripcion
      ? String(normalized.descripcion).trim()
      : null,
    descripcion_corta: normalized.descripcion_corta
      ? String(normalized.descripcion_corta).trim()
      : null,
    categoria: normalized.categoria
      ? String(normalized.categoria).trim()
      : null,
    precio,
    precio_socio: precioSocio && precioSocio > 0 ? precioSocio : null,
    sku: normalized.sku ? String(normalized.sku).trim() : null,
    stock_actual: Math.max(0, Math.floor(Number(normalized.stock_actual || normalized.stock || 0))),
    stock_minimo: Math.max(0, Math.floor(Number(normalized.stock_minimo || 5))),
    unidad: UNIDADES_VALIDAS.includes(unidad) ? unidad : "un",
    activo: normalized.activo !== undefined ? parseBoolean(normalized.activo) : true,
    destacado: normalized.destacado !== undefined
      ? parseBoolean(normalized.destacado)
      : false,
  };
}

// POST /api/admin/productos/importar
export async function POST(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = createAdminClient();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const mode = (formData.get("mode") as string) || "preview";

    if (!file) {
      return NextResponse.json(
        { error: "No se proporcionó archivo" },
        { status: 400 }
      );
    }

    // Parse Excel
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json(
        { error: "El archivo no tiene hojas" },
        { status: 400 }
      );
    }

    const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(
      workbook.Sheets[sheetName]
    );

    if (rawRows.length === 0) {
      return NextResponse.json(
        { error: "El archivo está vacío" },
        { status: 400 }
      );
    }

    if (rawRows.length > 500) {
      return NextResponse.json(
        { error: "Máximo 500 productos por importación" },
        { status: 400 }
      );
    }

    // Parse and validate rows
    const parsed: FilaProducto[] = [];
    const errors: { fila: number; error: string }[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const row = normalizeRow(rawRows[i]);
      if (!row) {
        errors.push({
          fila: i + 2, // +2 because row 1 is header, array is 0-indexed
          error: "Falta nombre o precio válido",
        });
        continue;
      }
      parsed.push(row);
    }

    // Preview mode — return parsed data without inserting
    if (mode === "preview") {
      return NextResponse.json({
        preview: parsed,
        errors,
        total: rawRows.length,
        validos: parsed.length,
      });
    }

    // Import mode — insert into database
    // First, resolve categories
    const uniqueCategories = [
      ...new Set(parsed.map((p) => p.categoria).filter(Boolean)),
    ] as string[];

    const categoryMap = new Map<string, number>();

    if (uniqueCategories.length > 0) {
      // Get existing categories
      const { data: existingCats } = await supabase
        .from("categorias_producto")
        .select("id, nombre")
        .in("nombre", uniqueCategories);

      for (const cat of existingCats || []) {
        categoryMap.set(cat.nombre.toLowerCase(), cat.id);
      }

      // Create missing categories
      const missing = uniqueCategories.filter(
        (c) => !categoryMap.has(c.toLowerCase())
      );
      if (missing.length > 0) {
        const { data: newCats } = await supabase
          .from("categorias_producto")
          .insert(
            missing.map((nombre) => ({
              nombre,
              slug: slugify(nombre),
              activa: true,
            }))
          )
          .select("id, nombre");

        for (const cat of newCats || []) {
          categoryMap.set(cat.nombre.toLowerCase(), cat.id);
        }
      }
    }

    // Check for existing slugs to avoid conflicts
    const slugs = parsed.map((p) => slugify(p.nombre));
    const { data: existingSlugs } = await supabase
      .from("productos")
      .select("slug")
      .in("slug", slugs);

    const existingSlugSet = new Set(
      (existingSlugs || []).map((s: { slug: string }) => s.slug)
    );

    // Check for existing SKUs
    const skus = parsed.map((p) => p.sku).filter(Boolean) as string[];
    const existingSkuSet = new Set<string>();
    if (skus.length > 0) {
      const { data: existingSkus } = await supabase
        .from("productos")
        .select("sku")
        .in("sku", skus);
      for (const s of existingSkus || []) {
        if (s.sku) existingSkuSet.add(s.sku);
      }
    }

    // Build insert data
    const toInsert: Record<string, unknown>[] = [];
    const skipped: { fila: number; nombre: string; razon: string }[] = [];
    const usedSlugs = new Set<string>();

    for (let i = 0; i < parsed.length; i++) {
      const p = parsed[i];
      let slug = slugify(p.nombre);

      // Make slug unique
      let attempt = 0;
      let candidateSlug = slug;
      while (
        existingSlugSet.has(candidateSlug) ||
        usedSlugs.has(candidateSlug)
      ) {
        attempt++;
        candidateSlug = `${slug}-${attempt}`;
      }
      slug = candidateSlug;
      usedSlugs.add(slug);

      // Skip if SKU already exists
      if (p.sku && existingSkuSet.has(p.sku)) {
        skipped.push({
          fila: i + 2,
          nombre: p.nombre,
          razon: `SKU duplicado: ${p.sku}`,
        });
        continue;
      }

      toInsert.push({
        nombre: p.nombre,
        slug,
        descripcion: p.descripcion,
        descripcion_corta: p.descripcion_corta,
        categoria_id: p.categoria
          ? categoryMap.get(p.categoria.toLowerCase()) || null
          : null,
        precio: p.precio,
        precio_socio: p.precio_socio,
        sku: p.sku,
        stock_actual: p.stock_actual ?? 0,
        stock_minimo: p.stock_minimo ?? 5,
        unidad: p.unidad || "un",
        activo: p.activo ?? true,
        destacado: p.destacado ?? false,
      });
    }

    if (toInsert.length === 0) {
      return NextResponse.json({
        importados: 0,
        skipped,
        errors,
        message: "No hay productos válidos para importar",
      });
    }

    // Batch insert (Supabase supports bulk insert)
    const { data: inserted, error: insertError } = await supabase
      .from("productos")
      .insert(toInsert as any)
      .select("id, nombre, slug");

    if (insertError) {
      return NextResponse.json(
        { error: `Error al insertar: ${insertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      importados: inserted?.length || 0,
      skipped,
      errors,
      message: `Se importaron ${inserted?.length || 0} productos exitosamente`,
    });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json(
      { error: error.message || "Error al importar" },
      { status: 500 }
    );
  }
}
