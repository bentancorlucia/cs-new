import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import { z } from "zod";

const TIENDA_ROLES = ["super_admin", "tienda"];

const proveedorUpdateSchema = z.object({
  nombre: z.string().min(1, "Nombre requerido").max(200),
  rut: z.string().max(20).optional().nullable(),
  razon_social: z.string().max(200).optional().nullable(),
  contacto_nombre: z.string().max(100).optional().nullable(),
  contacto_telefono: z.string().max(20).optional().nullable(),
  contacto_email: z
    .string()
    .email("Email inválido")
    .optional()
    .nullable()
    .or(z.literal("")),
  direccion: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
  activo: z.boolean().optional(),
});

// GET /api/admin/proveedores/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("proveedores")
      .select("*")
      .eq("id", parseInt(id))
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT /api/admin/proveedores/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const supabase = await createServerClient();
    const body = await request.json();
    const parsed = proveedorUpdateSchema.parse(body);

    const updateData = {
      ...parsed,
      contacto_email:
        parsed.contacto_email === "" ? null : parsed.contacto_email,
      updated_at: new Date().toISOString(),
    };

    const db = supabase as any;
    const { data, error } = await db
      .from("proveedores")
      .update(updateData)
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

// DELETE /api/admin/proveedores/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const supabase = await createServerClient();

    // Verificar que no tenga compras activas
    const { count } = await supabase
      .from("compras_proveedor")
      .select("id", { count: "exact", head: true })
      .eq("proveedor_id", parseInt(id))
      .in("estado", ["borrador", "confirmada"]);

    if (count && count > 0) {
      return NextResponse.json(
        {
          error:
            "No se puede eliminar: el proveedor tiene compras activas",
        },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("proveedores")
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
