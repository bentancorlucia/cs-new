import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";

const TIENDA_ROLES = ["super_admin", "tienda"];

// POST /api/admin/compras/[id]/recibir — recibir mercadería
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const user = await getCurrentUser();
    const supabase = await createServerClient();
    const db = supabase as any;

    // Obtener compra con items
    const { data: compra, error: compraError } = await db
      .from("compras_proveedor")
      .select("*, compra_items(*)")
      .eq("id", parseInt(id))
      .single();

    if (compraError || !compra) {
      return NextResponse.json(
        { error: "Compra no encontrada" },
        { status: 404 }
      );
    }

    if (compra.estado !== "confirmada") {
      return NextResponse.json(
        { error: "Solo se pueden recibir compras confirmadas" },
        { status: 400 }
      );
    }

    // Para cada item, actualizar stock
    for (const item of compra.compra_items) {
      const tabla = item.variante_id ? "producto_variantes" : "productos";
      const itemId = item.variante_id || item.producto_id;

      // Obtener stock actual
      const { data: producto } = await db
        .from(tabla)
        .select("stock_actual")
        .eq("id", itemId)
        .single();

      if (!producto) continue;

      const nuevoStock = producto.stock_actual + item.cantidad;

      // Actualizar stock
      await db
        .from(tabla)
        .update({ stock_actual: nuevoStock })
        .eq("id", itemId);

      // Registrar movimiento de stock
      await db.from("stock_movimientos").insert({
        producto_id: item.producto_id,
        variante_id: item.variante_id || null,
        tipo: "entrada",
        cantidad: item.cantidad,
        stock_anterior: producto.stock_actual,
        stock_nuevo: nuevoStock,
        referencia_tipo: "compra",
        referencia_id: compra.id,
        motivo: `Recepción compra #${compra.numero_compra}`,
        registrado_por: user?.id,
      });

      // Actualizar cantidad recibida en el item
      await db
        .from("compra_items")
        .update({ cantidad_recibida: item.cantidad })
        .eq("id", item.id);
    }

    // Marcar compra como recibida
    const { data, error } = await db
      .from("compras_proveedor")
      .update({
        estado: "recibida",
        fecha_recepcion: new Date().toISOString().split("T")[0],
        updated_at: new Date().toISOString(),
      })
      .eq("id", parseInt(id))
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
