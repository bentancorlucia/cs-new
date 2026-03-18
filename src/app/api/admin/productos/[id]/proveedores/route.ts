import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import { z } from "zod";

const TIENDA_ROLES = ["super_admin", "tienda"];

const proveedorItemSchema = z.object({
  proveedor_id: z.number().positive(),
  costo: z.number().min(0).nullable().optional(),
  codigo_proveedor: z.string().max(50).optional().nullable(),
  es_principal: z.boolean().default(false),
});

const bulkSchema = z.object({
  proveedores: z.array(proveedorItemSchema),
});

// PUT /api/admin/productos/[id]/proveedores — bulk upsert proveedores del producto
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const productoId = parseInt(id);
    const supabase = await createServerClient();

    const body = await request.json();
    const { proveedores } = bulkSchema.parse(body);

    // Delete existing associations
    await supabase
      .from("producto_proveedores")
      .delete()
      .eq("producto_id", productoId);

    // Insert new ones
    if (proveedores.length > 0) {
      const rows = proveedores.map((p) => ({
        producto_id: productoId,
        proveedor_id: p.proveedor_id,
        costo: p.costo ?? null,
        codigo_proveedor: p.codigo_proveedor || null,
        es_principal: p.es_principal,
      }));

      const { error } = await supabase
        .from("producto_proveedores")
        .insert(rows as any);

      if (error) throw error;
    }

    // Fetch updated list
    const { data, error } = await supabase
      .from("producto_proveedores")
      .select("id, proveedor_id, costo, codigo_proveedor, es_principal, proveedores(id, nombre)")
      .eq("producto_id", productoId);

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
