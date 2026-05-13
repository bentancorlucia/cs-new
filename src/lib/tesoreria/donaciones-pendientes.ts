type AnyDb = any;

// Donaciones cobradas pero aún no transferidas a Olla del Hogar.
// El dinero está físicamente en la cuenta donde se cobró el pedido,
// pero no se sumó al saldo del sistema (el movimiento se registra por
// el monto neto, sin la donación).
export async function getDonacionesPendientesPorCuenta(
  db: AnyDb,
  cuentaIds?: number[]
): Promise<Map<number, number>> {
  const result = new Map<number, number>();

  const { data: donaciones } = await db
    .from("donaciones")
    .select("monto, pedido_id")
    .eq("estado", "cobrada");

  const lista = (donaciones ?? []) as Array<{
    monto: number | string;
    pedido_id: number;
  }>;
  if (lista.length === 0) return result;

  const pedidoIds = lista.map((d) => d.pedido_id);
  let query = db
    .from("movimientos_financieros")
    .select("origen_id, cuenta_id")
    .eq("origen_tipo", "pedido")
    .in("origen_id", pedidoIds);
  if (cuentaIds && cuentaIds.length > 0) {
    query = query.in("cuenta_id", cuentaIds);
  }
  const { data: movs } = await query;

  const cuentaPorPedido = new Map<number, number>();
  for (const m of (movs ?? []) as Array<{ origen_id: number; cuenta_id: number }>) {
    cuentaPorPedido.set(m.origen_id, m.cuenta_id);
  }
  for (const d of lista) {
    const cuentaId = cuentaPorPedido.get(d.pedido_id);
    if (cuentaId == null) continue;
    result.set(cuentaId, (result.get(cuentaId) ?? 0) + Number(d.monto));
  }
  return result;
}
