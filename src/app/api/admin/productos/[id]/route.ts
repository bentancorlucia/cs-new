import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import { mtoCamposSchema } from "@/lib/mto/schema";
import { mensajeError } from "@/lib/contabilidad/formato";
import type { Json } from "@/types/database";

const TIENDA_ROLES = ["super_admin", "tienda"];

// stock_actual no se acepta: lo mantiene el motor de stock (z.object descarta claves extra).
const productoUpdateSchema = z.object({
  nombre: z.string().trim().min(1).max(200).optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "El slug solo lleva minúsculas, números y guiones")
    .optional(),
  descripcion: z.string().optional().nullable(),
  descripcion_corta: z.string().max(300).optional().nullable(),
  categoria_id: z.number().positive().optional().nullable(),
  precio: z.number().positive().optional(),
  precio_socio: z.number().positive().optional().nullable(),
  sku: z.string().trim().max(50).optional().nullable(),
  stock_minimo: z.number().int().min(0).optional(),
  activo: z.boolean().optional(),
  activo_pos: z.boolean().optional(),
  destacado: z.boolean().optional(),
  unidad: z.enum(["un", "kg", "lt", "mt", "par", "docena"]).optional(),
  mto_disponible: z.boolean().optional(),
  mto_solo: z.boolean().optional(),
  mto_tiempo_fabricacion_dias: z.number().int().positive().optional().nullable(),
  mto_campos: mtoCamposSchema.optional(),
});

function errorRespuesta(error: unknown) {
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
  return NextResponse.json({ error: mensajeError(e) }, { status: e?.code === "P0001" ? 409 : 500 });
}

// GET /api/admin/productos/[id]
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("productos")
      .select(
        `
        *,
        categorias_producto(id, nombre, slug),
        producto_imagenes(id, url, alt_text, orden, es_principal, focal_point),
        producto_variantes(id, nombre, sku, precio_override, stock_actual, atributos, activo),
        producto_proveedores(id, proveedor_id, costo, codigo_proveedor, es_principal, proveedores(id, nombre))
      `
      )
      .eq("id", Number(id))
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json({ data });
  } catch (error) {
    return errorRespuesta(error);
  }
}

// PUT /api/admin/productos/[id] — ficha del producto (nunca el stock)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const supabase = await createServerClient();
    const parsed = productoUpdateSchema.parse(await request.json());
    if (parsed.precio_socio != null && parsed.precio != null && parsed.precio_socio >= parsed.precio) {
      return NextResponse.json({ error: "El precio socio tiene que ser menor que el precio" }, { status: 400 });
    }

    const { mto_campos, ...resto } = parsed;
    const { data, error } = await supabase
      .from("productos")
      .update({
        ...resto,
        ...(mto_campos !== undefined ? { mto_campos: mto_campos as unknown as NonNullable<Json> } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", Number(id))
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error) {
    return errorRespuesta(error);
  }
}

// DELETE /api/admin/productos/[id]
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const supabase = await createServerClient();

    const { error } = await supabase.from("productos").delete().eq("id", Number(id));

    if (error?.code === "23503") {
      return NextResponse.json(
        {
          error:
            "El producto tiene historial (ventas, stock, compras o listas de precio): desactivalo en web y POS en vez de borrarlo.",
        },
        { status: 409 }
      );
    }
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorRespuesta(error);
  }
}
