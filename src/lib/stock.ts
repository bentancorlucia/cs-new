import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Retorna el stock disponible descontando cantidades reservadas
 * en pedidos con estado 'pendiente_verificacion'.
 */
export async function getStockDisponible(
  db: SupabaseClient,
  productoId: number,
  varianteId?: number
): Promise<number> {
  // 1. Stock actual
  let stockActual = 0;

  if (varianteId) {
    const { data } = await db
      .from("producto_variantes")
      .select("stock_actual")
      .eq("id", varianteId)
      .eq("producto_id", productoId)
      .single();
    stockActual = data?.stock_actual ?? 0;
  } else {
    const { data } = await db
      .from("productos")
      .select("stock_actual")
      .eq("id", productoId)
      .single();
    stockActual = data?.stock_actual ?? 0;
  }

  // 2. Cantidades reservadas en pedidos pendiente_verificacion
  let query = db
    .from("pedido_items")
    .select("cantidad, pedidos!inner(estado)")
    .eq("producto_id", productoId)
    .eq("pedidos.estado", "pendiente_verificacion");

  if (varianteId) {
    query = query.eq("variante_id", varianteId);
  } else {
    query = query.is("variante_id", null);
  }

  const { data: reservados } = await query;

  let cantidadReservada = 0;
  if (reservados) {
    for (const item of reservados) {
      cantidadReservada += item.cantidad;
    }
  }

  return Math.max(0, stockActual - cantidadReservada);
}
