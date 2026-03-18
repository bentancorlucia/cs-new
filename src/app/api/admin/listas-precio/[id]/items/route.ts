import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import { z } from "zod";

const TIENDA_ROLES = ["super_admin", "tienda"];

const itemSchema = z.object({
  producto_id: z.number().positive(),
  variante_id: z.number().positive().optional().nullable(),
  precio: z.number().min(0),
});

const bulkSchema = z.object({
  items: z.array(itemSchema),
});

// PUT /api/admin/listas-precio/[id]/items — bulk sync items
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const listaId = parseInt(id);
    const supabase = await createServerClient();

    const body = await request.json();
    const { items } = bulkSchema.parse(body);

    // Delete all existing items for this list
    await supabase
      .from("lista_precio_items")
      .delete()
      .eq("lista_precio_id", listaId);

    // Insert new items
    if (items.length > 0) {
      const rows = items.map((item) => ({
        lista_precio_id: listaId,
        producto_id: item.producto_id,
        variante_id: item.variante_id || null,
        precio: item.precio,
      }));

      const { error } = await supabase
        .from("lista_precio_items")
        .insert(rows as any);

      if (error) throw error;
    }

    // Fetch updated
    const { data, error } = await supabase
      .from("lista_precio_items")
      .select("id, producto_id, variante_id, precio, productos(id, nombre, sku, precio), producto_variantes(id, nombre)")
      .eq("lista_precio_id", listaId);

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
