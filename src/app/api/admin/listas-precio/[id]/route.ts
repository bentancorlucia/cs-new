import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import { z } from "zod";

const TIENDA_ROLES = ["super_admin", "tienda"];

const updateSchema = z.object({
  nombre: z.string().min(1).max(200).optional(),
  descripcion: z.string().optional().nullable(),
  activa: z.boolean().optional(),
});

// GET /api/admin/listas-precio/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("listas_precio")
      .select(`
        *,
        lista_precio_items(id, producto_id, variante_id, precio, productos(id, nombre, sku, precio), producto_variantes(id, nombre)),
        lista_precio_disciplinas(id, disciplina_id, disciplinas(id, nombre))
      `)
      .eq("id", parseInt(id))
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT /api/admin/listas-precio/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const supabase = await createServerClient();
    const body = await request.json();
    const parsed = updateSchema.parse(body);

    const { data, error } = await (supabase as any)
      .from("listas_precio")
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

// DELETE /api/admin/listas-precio/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const supabase = await createServerClient();

    const { error } = await supabase
      .from("listas_precio")
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
