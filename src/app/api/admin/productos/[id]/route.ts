import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import { z } from "zod";
import { mtoCamposSchema } from "@/lib/mto/schema";

const TIENDA_ROLES = ["super_admin", "tienda"];

const productoUpdateSchema = z.object({
  nombre: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(200).optional(),
  descripcion: z.string().optional().nullable(),
  descripcion_corta: z.string().max(300).optional().nullable(),
  categoria_id: z.number().positive().optional().nullable(),
  precio: z.number().positive().optional(),
  precio_socio: z.number().positive().optional().nullable(),
  sku: z.string().max(50).optional().nullable(),
  stock_actual: z.number().int().min(0).optional(),
  stock_minimo: z.number().int().min(0).optional(),
  activo: z.boolean().optional(),
  destacado: z.boolean().optional(),
  unidad: z.enum(["un", "kg", "lt", "mt", "par", "docena"]).optional(),
  mto_disponible: z.boolean().optional(),
  mto_solo: z.boolean().optional(),
  mto_tiempo_fabricacion_dias: z.number().int().positive().optional().nullable(),
  mto_campos: mtoCamposSchema.optional(),
});

// GET /api/admin/productos/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
      .eq("id", parseInt(id))
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT /api/admin/productos/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const supabase = await createServerClient();
    const body = await request.json();
    const parsed = productoUpdateSchema.parse(body);

    const { data, error } = await (supabase as any)
      .from("productos")
      .update({ ...parsed, updated_at: new Date().toISOString() })
      .eq("id", parseInt(id))
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/admin/productos/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const supabase = await createServerClient();

    const { error } = await supabase
      .from("productos")
      .delete()
      .eq("id", parseInt(id));

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
