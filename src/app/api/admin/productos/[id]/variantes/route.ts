import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import { z } from "zod";

const TIENDA_ROLES = ["super_admin", "tienda"];

const varianteSchema = z.object({
  id: z.number().optional(), // existing variant id for update
  nombre: z.string().min(1).max(100),
  sku: z.string().max(50).optional().nullable(),
  precio_override: z.number().positive().optional().nullable(),
  stock_actual: z.number().int().min(0).default(0),
  atributos: z.record(z.string()), // e.g. { talle: "M", color: "Rojo" }
  activo: z.boolean().default(true),
});

const bulkSchema = z.object({
  variantes: z.array(varianteSchema),
});

// PUT /api/admin/productos/[id]/variantes — bulk sync variantes
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
    const { variantes } = bulkSchema.parse(body);

    // Get existing variant IDs
    const { data: existing } = await supabase
      .from("producto_variantes")
      .select("id")
      .eq("producto_id", productoId);

    const existingIds = new Set((existing || []).map((v) => v.id));
    const submittedIds = new Set(variantes.filter((v) => v.id).map((v) => v.id!));

    // Delete removed variants
    const toDelete = [...existingIds].filter((id) => !submittedIds.has(id));
    if (toDelete.length > 0) {
      await supabase
        .from("producto_variantes")
        .delete()
        .in("id", toDelete);
    }

    // Upsert variants
    for (const v of variantes) {
      if (v.id && existingIds.has(v.id)) {
        // Update
        await supabase
          .from("producto_variantes")
          .update({
            nombre: v.nombre,
            sku: v.sku || null,
            precio_override: v.precio_override ?? null,
            stock_actual: v.stock_actual,
            atributos: v.atributos,
            activo: v.activo,
          } as any)
          .eq("id", v.id);
      } else {
        // Insert
        await supabase
          .from("producto_variantes")
          .insert({
            producto_id: productoId,
            nombre: v.nombre,
            sku: v.sku || null,
            precio_override: v.precio_override ?? null,
            stock_actual: v.stock_actual,
            atributos: v.atributos,
            activo: v.activo,
          } as any);
      }
    }

    // Recalculate product stock_actual as sum of variant stocks
    const { data: updatedVariants } = await supabase
      .from("producto_variantes")
      .select("id, nombre, sku, precio_override, stock_actual, atributos, activo")
      .eq("producto_id", productoId)
      .order("id");

    const totalStock = (updatedVariants || []).reduce(
      (sum, v) => sum + (v.activo ? v.stock_actual : 0),
      0
    );

    await (supabase as any)
      .from("productos")
      .update({ stock_actual: totalStock, updated_at: new Date().toISOString() })
      .eq("id", productoId);

    return NextResponse.json({ data: updatedVariants, stock_total: totalStock });
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
