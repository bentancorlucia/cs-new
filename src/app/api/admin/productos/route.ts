import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import { mtoCamposSchema } from "@/lib/mto/schema";
import { textoBusqueda } from "@/lib/comercial/stock";
import { mensajeError } from "@/lib/contabilidad/formato";
import type { Json } from "@/types/database";

const TIENDA_ROLES = ["super_admin", "tienda"];

// Sin stock_actual: el producto nace sin stock (entra por inventario inicial, compras o ajustes).
const productoSchema = z.object({
  nombre: z.string().trim().min(1, "Nombre requerido").max(200),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "El slug solo lleva minúsculas, números y guiones"),
  descripcion: z.string().optional().nullable(),
  descripcion_corta: z.string().max(300).optional().nullable(),
  categoria_id: z.number().positive().optional().nullable(),
  precio: z.number().positive("Precio debe ser mayor a 0"),
  precio_socio: z.number().positive().optional().nullable(),
  sku: z.string().trim().max(50).optional().nullable(),
  stock_minimo: z.number().int().min(0).default(5),
  activo: z.boolean().default(true),
  activo_pos: z.boolean().default(true),
  destacado: z.boolean().default(false),
  unidad: z.enum(["un", "kg", "lt", "mt", "par", "docena"]).default("un"),
  mto_disponible: z.boolean().default(false),
  mto_solo: z.boolean().default(false),
  mto_tiempo_fabricacion_dias: z.number().int().positive().optional().nullable(),
  mto_campos: mtoCamposSchema.default([]),
});

function errorRespuesta(error: unknown, porDefecto: string) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message ?? "Datos inválidos", details: error.issues }, { status: 400 });
  }
  const e = error as { message?: string; code?: string };
  if (e?.message === "No autorizado") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  if (e?.code === "23505") {
    return NextResponse.json({ error: "Ya existe un producto con ese slug o SKU" }, { status: 409 });
  }
  return NextResponse.json({ error: e?.message ? mensajeError(e) : porDefecto }, { status: e?.code === "P0001" ? 409 : 500 });
}

type FilaListado = {
  id: number;
  stock_actual: number;
  stock_minimo: number | null;
  producto_variantes: { id: number; stock_actual: number; activo: boolean | null }[] | null;
  [k: string]: unknown;
};

// GET /api/admin/productos — listado del admin
export async function GET(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = await createServerClient();

    const { searchParams } = new URL(request.url);
    const termino = textoBusqueda(searchParams.get("search") || "");
    const categoria = Number(searchParams.get("categoria") || 0);
    const estado = searchParams.get("estado") || "";
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 20));
    const offset = (page - 1) * limit;

    let query = supabase
      .from("productos")
      .select(
        `
        *,
        categorias_producto(id, nombre, slug),
        producto_imagenes(id, url, alt_text, orden, es_principal, focal_point),
        producto_variantes(id, stock_actual, activo)
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (termino) query = query.or(`nombre.ilike.%${termino}%,sku.ilike.%${termino}%`);
    if (categoria > 0) query = query.eq("categoria_id", categoria);
    if (estado === "activo") query = query.eq("activo", true);
    if (estado === "inactivo") query = query.eq("activo", false);
    if (estado === "inactivo_pos") query = query.eq("activo_pos", false);
    if (estado === "agotado") query = query.eq("stock_actual", 0);

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) throw error;
    const filas = (data ?? []) as unknown as FilaListado[];

    // Reservado: mismo criterio que la base (pedidos por verificar con
    // stock reservado, sin encargues).
    const ids = filas.map((p) => p.id);
    const reservadoPorProducto = new Map<number, number>();
    if (ids.length > 0) {
      const { data: reservados } = await supabase
        .from("pedido_items")
        .select("producto_id, cantidad, pedidos!inner(estado, stock_reservado)")
        .in("producto_id", ids)
        .eq("es_encargue", false)
        .eq("pedidos.estado", "pendiente_verificacion")
        .eq("pedidos.stock_reservado", true);
      for (const r of reservados ?? []) {
        reservadoPorProducto.set(r.producto_id, (reservadoPorProducto.get(r.producto_id) ?? 0) + r.cantidad);
      }
    }

    let resultado = filas.map(({ producto_variantes, ...p }) => {
      const activas = (producto_variantes ?? []).filter((v) => v.activo !== false);
      return {
        ...p,
        stock_actual: activas.length > 0 ? activas.reduce((s, v) => s + v.stock_actual, 0) : p.stock_actual,
        stock_reservado: reservadoPorProducto.get(p.id) ?? 0,
      };
    });
    if (estado === "stock_bajo") {
      resultado = resultado.filter((p) => p.stock_actual > 0 && p.stock_actual <= (p.stock_minimo ?? 0));
    }

    return NextResponse.json({
      data: resultado,
      pagination: { page, limit, total: count ?? 0, totalPages: Math.ceil((count ?? 0) / limit) },
    });
  } catch (error) {
    return errorRespuesta(error, "Error al listar productos");
  }
}

// POST /api/admin/productos — alta (sin stock)
export async function POST(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = await createServerClient();
    const parsed = productoSchema.parse(await request.json());
    if (parsed.precio_socio != null && parsed.precio_socio >= parsed.precio) {
      return NextResponse.json({ error: "El precio socio tiene que ser menor que el precio" }, { status: 400 });
    }

    const { mto_campos, ...resto } = parsed;
    const { data, error } = await supabase
      .from("productos")
      .insert({ ...resto, mto_campos: mto_campos as unknown as NonNullable<Json> })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return errorRespuesta(error, "Error al crear producto");
  }
}
