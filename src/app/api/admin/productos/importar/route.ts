import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import { parseNumeroUY } from "@/lib/comercial/stock";
import { mensajeError } from "@/lib/contabilidad/formato";

const TIENDA_ROLES = ["super_admin", "tienda"];
const UNIDADES_VALIDAS = ["un", "kg", "lt", "mt", "par", "docena"];
const MAX_FILAS = 500;
const MAX_BYTES = 10 * 1024 * 1024;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const clave = (t: string) =>
  t
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");

interface FilaProducto {
  fila: number;
  nombre: string;
  descripcion: string | null;
  descripcion_corta: string | null;
  categoria: string | null;
  precio: number;
  precio_socio: number | null;
  sku: string | null;
  stock_minimo: number;
  unidad: string;
  activo: boolean;
  activo_pos: boolean;
  destacado: boolean;
}

const VERDADERO = ["si", "s", "true", "verdadero", "1", "yes", "x", "activo", "activa"];
const FALSO = ["no", "n", "false", "falso", "0", "inactivo", "inactiva"];

function parseBooleano(val: unknown, porDefecto: boolean): boolean | null {
  if (val === undefined || val === null || val === "") return porDefecto;
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val === 1 ? true : val === 0 ? false : null;
  const v = String(val).toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (VERDADERO.includes(v)) return true;
  if (FALSO.includes(v)) return false;
  return null;
}

const vacio = (v: unknown) => v === undefined || v === null || String(v).trim() === "";

function normalizarFila(row: Record<string, unknown>, fila: number): { ok: FilaProducto } | { error: string } {
  const n: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    n[key.toLowerCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "_")] = val;
  }

  const nombre = String(n.nombre ?? "").trim();
  if (!nombre) return { error: "Falta el nombre" };
  if (nombre.length > 200) return { error: "El nombre supera 200 caracteres" };

  const precio = parseNumeroUY(n.precio);
  if (precio === null || precio <= 0) return { error: `Precio inválido: "${String(n.precio ?? "")}"` };

  let precioSocio: number | null = null;
  if (!vacio(n.precio_socio)) {
    precioSocio = parseNumeroUY(n.precio_socio);
    if (precioSocio === null || precioSocio < 0) return { error: `Precio socio inválido: "${String(n.precio_socio)}"` };
    if (precioSocio === 0) precioSocio = null;
    else if (precioSocio >= precio) return { error: "El precio socio tiene que ser menor que el precio" };
  }

  // Stock mínimo: vacío → 5; un 0 explícito es 0.
  let stockMinimo = 5;
  if (!vacio(n.stock_minimo)) {
    const m = parseNumeroUY(n.stock_minimo);
    if (m === null || m < 0 || !Number.isInteger(m)) return { error: `Stock mínimo inválido: "${String(n.stock_minimo)}"` };
    stockMinimo = m;
  }

  const unidadTxt = vacio(n.unidad) ? "un" : String(n.unidad).toLowerCase().trim();
  if (!UNIDADES_VALIDAS.includes(unidadTxt)) {
    return { error: `Unidad "${unidadTxt}" inválida (${UNIDADES_VALIDAS.join(", ")})` };
  }

  const activo = parseBooleano(n.activo, true);
  const activoPos = parseBooleano(n.activo_pos, true);
  const destacado = parseBooleano(n.destacado, false);
  if (activo === null || activoPos === null || destacado === null) {
    return { error: "Usá sí / no en activo, activo_pos y destacado" };
  }

  const sku = vacio(n.sku) ? null : String(n.sku).trim();
  if (sku && sku.length > 50) return { error: "El SKU supera 50 caracteres" };
  const corta = vacio(n.descripcion_corta) ? null : String(n.descripcion_corta).trim();
  if (corta && corta.length > 300) return { error: "La descripción corta supera 300 caracteres" };

  return {
    ok: {
      fila,
      nombre,
      descripcion: vacio(n.descripcion) ? null : String(n.descripcion).trim(),
      descripcion_corta: corta,
      categoria: vacio(n.categoria) ? null : String(n.categoria).trim(),
      precio,
      precio_socio: precioSocio,
      sku,
      stock_minimo: stockMinimo,
      unidad: unidadTxt,
      activo,
      activo_pos: activoPos,
      destacado,
    },
  };
}

/**
 * POST /api/admin/productos/importar — alta masiva del catálogo desde
 * Excel/CSV (mode=preview | import). No carga stock: el stock de arranque
 * entra por Stock → Inventario inicial (con su costo) o por compras.
 */
export async function POST(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const db = await createServerClient();

    const formData = await request.formData();
    const file = formData.get("file");
    const mode = formData.get("mode") === "import" ? "import" : "preview";
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No se proporcionó archivo" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "El archivo supera 10 MB" }, { status: 400 });
    }

    // Como texto: si no, SheetJS convierte "1.500" de un CSV en 1,5.
    // Los CSV se decodifican como UTF-8 (tildes) y se leen como texto.
    const esCsv = file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
    const buffer = await file.arrayBuffer();
    const workbook = esCsv
      ? XLSX.read(new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, ""), { type: "string", raw: true })
      : XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return NextResponse.json({ error: "El archivo no tiene hojas" }, { status: 400 });

    const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
    if (rawRows.length === 0) return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 });
    if (rawRows.length > MAX_FILAS) {
      return NextResponse.json({ error: `Máximo ${MAX_FILAS} productos por importación` }, { status: 400 });
    }

    const avisos: string[] = [];
    const encabezados = Object.keys(rawRows[0] ?? {}).map((k) => clave(k).replace(/\s/g, "_"));
    if (encabezados.some((h) => h === "stock" || h === "stock_actual")) {
      avisos.push(
        "La columna de stock se ignora: el stock de arranque se carga en Stock → Inventario inicial (con su costo) o entra con las compras."
      );
    }

    const parsed: FilaProducto[] = [];
    const errors: { fila: number; error: string }[] = [];
    const skusArchivo = new Map<string, number>();
    rawRows.forEach((row, i) => {
      const fila = i + 2; // fila 1 = encabezados
      const r = normalizarFila(row, fila);
      if ("error" in r) {
        errors.push({ fila, error: r.error });
        return;
      }
      if (r.ok.sku) {
        const k = r.ok.sku.toLowerCase();
        const previa = skusArchivo.get(k);
        if (previa) {
          errors.push({ fila, error: `SKU ${r.ok.sku} repetido (ya está en la fila ${previa})` });
          return;
        }
        skusArchivo.set(k, fila);
      }
      parsed.push(r.ok);
    });

    if (mode === "preview") {
      return NextResponse.json({ preview: parsed, errors, avisos, total: rawRows.length, validos: parsed.length });
    }

    // Categorías: se comparan sin mayúsculas ni tildes; se crean las que faltan.
    const { data: cats, error: errCats } = await db.from("categorias_producto").select("id, nombre, slug");
    if (errCats) throw errCats;
    const categoriaPorClave = new Map<string, number>();
    const slugsCat = new Set<string>();
    for (const c of cats ?? []) {
      categoriaPorClave.set(clave(c.nombre), c.id);
      slugsCat.add(c.slug);
    }
    const faltantes = new Map<string, string>();
    for (const p of parsed) {
      if (p.categoria && !categoriaPorClave.has(clave(p.categoria)) && !faltantes.has(clave(p.categoria))) {
        faltantes.set(clave(p.categoria), p.categoria);
      }
    }
    const creadas: string[] = [];
    for (const [k, nombre] of faltantes) {
      let slug = slugify(nombre) || "categoria";
      for (let n = 2; slugsCat.has(slug); n++) slug = `${slugify(nombre) || "categoria"}-${n}`;
      const { data: nueva, error } = await db
        .from("categorias_producto")
        .insert({ nombre, slug, activa: true })
        .select("id")
        .single();
      if (error) {
        return NextResponse.json({ error: `No se pudo crear la categoría "${nombre}": ${mensajeError(error)}` }, { status: 409 });
      }
      slugsCat.add(slug);
      categoriaPorClave.set(k, nueva.id);
      creadas.push(nombre);
    }

    // Slugs y SKUs existentes
    const { data: existentes, error: errProd } = await db.from("productos").select("slug, sku");
    if (errProd) throw errProd;
    const { data: skusVar } = await db.from("producto_variantes").select("sku").not("sku", "is", null);
    const slugs = new Set((existentes ?? []).map((p) => p.slug));
    const skusExistentes = new Set(
      [...(existentes ?? []).map((p) => p.sku), ...(skusVar ?? []).map((v) => v.sku)]
        .filter((s): s is string => !!s)
        .map((s) => s.toLowerCase())
    );

    const toInsert = [];
    const skipped: { fila: number; nombre: string; razon: string }[] = [];
    for (const p of parsed) {
      if (p.sku && skusExistentes.has(p.sku.toLowerCase())) {
        skipped.push({ fila: p.fila, nombre: p.nombre, razon: `SKU ${p.sku} ya existe en el catálogo` });
        continue;
      }
      const base = slugify(p.nombre) || "producto";
      let slug = base;
      for (let n = 1; slugs.has(slug); n++) slug = `${base}-${n}`;
      slugs.add(slug);

      toInsert.push({
        nombre: p.nombre,
        slug,
        descripcion: p.descripcion,
        descripcion_corta: p.descripcion_corta,
        categoria_id: p.categoria ? categoriaPorClave.get(clave(p.categoria)) ?? null : null,
        precio: p.precio,
        precio_socio: p.precio_socio,
        sku: p.sku,
        stock_minimo: p.stock_minimo,
        unidad: p.unidad,
        activo: p.activo,
        activo_pos: p.activo_pos,
        destacado: p.destacado,
      });
    }

    if (toInsert.length === 0) {
      return NextResponse.json({ importados: 0, skipped, errors, avisos, message: "No hay productos válidos para importar" });
    }

    // Un solo INSERT: o entran todos o ninguno.
    const { data: inserted, error: insertError } = await db.from("productos").insert(toInsert).select("id");
    if (insertError) {
      return NextResponse.json({ error: `No se importó nada: ${mensajeError(insertError)}` }, { status: 409 });
    }
    if (creadas.length) avisos.push(`Categorías nuevas: ${creadas.join(", ")}`);

    return NextResponse.json({
      importados: inserted?.length ?? 0,
      skipped,
      errors,
      avisos,
      message: `Se importaron ${inserted?.length ?? 0} productos (sin stock: cargalo en Stock → Inventario inicial)`,
    });
  } catch (error) {
    const e = error as { message?: string; code?: string };
    if (e?.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: mensajeError(e) || "Error al importar" }, { status: 500 });
  }
}
