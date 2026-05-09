type AnyDb = any;

type MetodoPago = "efectivo" | "transferencia" | "mercadopago" | "cheque" | "otro";

function tipoCuentaPorMetodo(metodo: MetodoPago): "caja_chica" | "bancaria" {
  return metodo === "efectivo" ? "caja_chica" : "bancaria";
}

async function getCuentaTiendaPorMetodo(db: AnyDb, metodo: MetodoPago) {
  const tipoCuenta = tipoCuentaPorMetodo(metodo);
  const { data: cuenta } = await db
    .from("cuentas_financieras")
    .select("id")
    .eq("modulo", "tienda")
    .eq("tipo", tipoCuenta)
    .eq("activa", true)
    .maybeSingle();

  if (cuenta) return cuenta as { id: number };

  const { data: fallback } = await db
    .from("cuentas_financieras")
    .select("id")
    .eq("modulo", "tienda")
    .eq("activa", true)
    .order("tipo", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (fallback as { id: number } | null) ?? null;
}

async function getCategoriaPorSlug(db: AnyDb, slug: string) {
  const { data } = await db
    .from("categorias_financieras")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  return (data as { id: number } | null) ?? null;
}

export async function registrarMovimientoVentaPedido(
  db: AnyDb,
  args: {
    pedidoId: number;
    numeroPedido: string;
    tipoPedido: "pos" | "online";
    total: number;
    metodoPago: MetodoPago;
    registradoPor?: string | null;
    // Si se pasa, registra el movimiento por este monto en lugar de `total`.
    // Caso de uso: pedidos con donación a Olla del Hogar — la donación NO
    // se considera ingreso de tienda (queda fuera de tesorería).
    montoOverride?: number;
  }
) {
  const cuenta = await getCuentaTiendaPorMetodo(db, args.metodoPago);
  if (!cuenta) return;

  const slug = args.tipoPedido === "pos" ? "ventas-pos" : "ventas-online";
  const categoria = await getCategoriaPorSlug(db, slug);
  if (!categoria) return;

  const monto = args.montoOverride ?? args.total;
  if (monto <= 0) return;

  const descripcion =
    args.metodoPago === "efectivo"
      ? `Venta POS efectivo — Pedido #${args.numeroPedido}`
      : args.metodoPago === "transferencia"
        ? `Transferencia verificada — Pedido #${args.numeroPedido}`
        : args.metodoPago === "mercadopago"
          ? `Pago MercadoPago — Pedido #${args.numeroPedido}`
          : `Venta — Pedido #${args.numeroPedido}`;

  const referenciaPrefix =
    args.metodoPago === "efectivo"
      ? "POS"
      : args.metodoPago === "transferencia"
        ? "TRANSF"
        : args.metodoPago === "mercadopago"
          ? "MP"
          : "VENTA";

  await db.from("movimientos_financieros").insert({
    cuenta_id: cuenta.id,
    tipo: "ingreso",
    categoria_id: categoria.id,
    monto,
    moneda: "UYU",
    fecha: new Date().toISOString().split("T")[0],
    descripcion,
    origen_tipo: "pedido",
    origen_id: args.pedidoId,
    referencia: `${referenciaPrefix}-${args.numeroPedido}`,
    registrado_por: args.registradoPor ?? null,
  });
}

export async function registrarMovimientoPagoProveedor(
  db: AnyDb,
  args: {
    pagoId: number;
    proveedorNombre: string;
    monto: number;
    metodoPago: MetodoPago;
    referencia?: string | null;
    compraNumero?: string | null;
    registradoPor?: string | null;
  }
) {
  const cuenta = await getCuentaTiendaPorMetodo(db, args.metodoPago);
  if (!cuenta) return;

  const subcat = await getCategoriaPorSlug(db, "mercaderia-tienda");
  const padre = await getCategoriaPorSlug(db, "compras-proveedores");
  const categoriaId = padre?.id;
  const subcategoriaId = subcat?.id;
  if (!categoriaId) return;

  const descripcion = args.compraNumero
    ? `Pago a ${args.proveedorNombre} — Compra #${args.compraNumero}`
    : `Pago a ${args.proveedorNombre}`;

  await db.from("movimientos_financieros").insert({
    cuenta_id: cuenta.id,
    tipo: "egreso",
    categoria_id: categoriaId,
    subcategoria_id: subcategoriaId ?? null,
    monto: args.monto,
    moneda: "UYU",
    fecha: new Date().toISOString().split("T")[0],
    descripcion,
    origen_tipo: "pago_proveedor",
    origen_id: args.pagoId,
    referencia: args.referencia || `PAG-${args.pagoId}`,
    registrado_por: args.registradoPor ?? null,
  });
}
