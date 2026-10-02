// Tipos compartidos entre los reportes de tienda (servidor, exportaciones,
// MCP) y la UI. Importes en UYU. Fechas "YYYY-MM-DD" (calendario de Uruguay).
//
// Criterio único (dashboard, reportes, export y MCP):
//   venta      = pedido con fila en comercial.ventas no anulada, a su fecha contable
//   importe    = monto_ventas (+ encargues recién cuando se entregan)
//                − devoluciones + lo nuevo de los cambios
//   costo      = costo real del kardex (comercial.ventas.costo / devolucion_items.costo)
//   donaciones = aparte, nunca son venta

export type ReporteScope = "tienda" | "donaciones" | "promocodes";
export type FormatoExport = "pdf" | "excel";

export interface RangoFechas {
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD (inclusive)
}

export type Canal = "online" | "pos" | "disciplina";

/** Rol de la cuenta de ingreso en contabilidad.parametros_cuentas (proceso tienda). */
export type RolCuentaVenta = "ventas_socios" | "ventas_no_socios" | "ventas_disciplinas" | "devoluciones";

export interface KpiComparado {
  valor: number;
  valorAnterior: number;
  variacionPct: number | null; // null si el anterior es 0 y el actual no
}

export interface KpiPctComparado {
  valor: number | null; // null si no hay base (p. ej. sin ventas)
  valorAnterior: number | null;
  /** Diferencia en puntos porcentuales. */
  diferenciaPp: number | null;
}

// ---------- Control contra la contabilidad ----------

export interface FilaControlCuenta {
  rol: string;
  codigo: string;
  nombre: string;
  /** Según el reporte. */
  reporte: number;
  /** Asientos de la tienda (ventas, entregas, devoluciones) vigentes. */
  contabilidad: number;
}

export interface ControlContable {
  /** Qué se controla (ventas, costo, donaciones). */
  concepto: string;
  /** Total del reporte. */
  reporte: number;
  /** Saldo del período en las cuentas controladas (todas las líneas). */
  saldoCuentas: number;
  /** Ventas anuladas: asiento original y su reversión caen en períodos distintos. */
  anulacionesCruzadas: number;
  /** Asientos de otro origen en esas cuentas (manuales, transferencias, compras…). */
  otrosAsientos: number;
  /** saldoCuentas − anulacionesCruzadas − otrosAsientos − reporte. Debe ser 0. */
  diferencia: number;
  cuadra: boolean;
  porCuenta: FilaControlCuenta[];
}

// ---------- Reporte general ----------

export interface SerieVentas {
  /** YYYY-MM-DD o YYYY-Www si el rango supera 60 días. */
  fecha: string;
  ventas: number;
  costo: number;
  margen: number;
  pedidos: number;
  online: number;
  pos: number;
  disciplina: number;
  promocodesActivos: string[];
}

export interface FilaCanal {
  canal: Canal;
  ventas: number;
  costo: number;
  margen: number;
  pedidos: number;
}

export interface FilaCuentaVenta {
  rol: RolCuentaVenta;
  codigo: string;
  nombre: string;
  ventas: number;
}

export interface FilaMetodoPago {
  clave: string; // transferencia, efectivo, mixto, cuenta_corriente, … o "devoluciones"
  ventas: number;
  pedidos: number;
}

export interface ProductoTop {
  producto_id: number;
  nombre: string;
  sku: string | null;
  categoria_id: number | null;
  categoria: string;
  unidades: number;
  facturacion: number;
  costo: number;
  margen: number;
  margenPct: number | null;
}

export interface MargenCategoria {
  categoria_id: number | null;
  nombre: string;
  unidades: number;
  facturacion: number;
  costo: number;
  margen: number;
  margenPct: number | null;
}

export interface ReporteTienda {
  rango: RangoFechas;
  rangoAnterior: RangoFechas;
  generado: string; // ISO
  ventas: KpiComparado;
  costo: KpiComparado;
  margen: KpiComparado;
  margenPct: KpiPctComparado;
  pedidos: KpiComparado;
  ticketPromedio: KpiComparado;
  /** % de las ventas minoristas (socios + no socios) hechas a socios, por importe. */
  ventasSocioPct: KpiPctComparado;
  composicion: {
    ventasPedidos: number; // monto_ventas de los pedidos del período
    encarguesEntregados: number; // encargues reconocidos al retirarse
    devoluciones: number; // negativo
    cambios: number; // lo nuevo entregado en cambios
    ventasNetas: number;
  };
  /** Cobrado por encargues de pedidos del período que todavía no se retiraron (seña, no es venta). */
  encarguesPendientes: { pedidos: number; importe: number };
  /** Donaciones cobradas con los pedidos del período (no son venta). */
  donaciones: { pedidos: number; importe: number };
  /** Pedidos del período cuya venta se anuló (no cuentan). */
  anuladas: { pedidos: number; importe: number };
  /** Unidades vendidas sin costo en el kardex (cuentan a costo 0: el margen queda sobreestimado). */
  unidadesSinCosto: number;
  porCanal: FilaCanal[];
  porCuenta: FilaCuentaVenta[];
  porMetodoPago: FilaMetodoPago[];
  topProductos: ProductoTop[];
  margenPorCategoria: MargenCategoria[];
  serie: SerieVentas[];
  control: ControlContable;
  controlCosto: ControlContable;
}

// ---------- Donaciones ----------

export interface DonacionDetalle {
  pedido_id: number;
  numero_pedido: string | null;
  fecha: string;
  canal: Canal;
  monto: number;
  estado: string; // cobrada / transferida / …
}

export interface ReporteDonaciones {
  rango: RangoFechas;
  generado: string;
  totalDonado: number;
  cantidad: number;
  promedio: number;
  /** Pedidos online vendidos en el período (denominador de la tasa). */
  pedidosOnline: number;
  tasaConversionPct: number | null;
  porEstado: { estado: string; cantidad: number; total: number }[];
  /** Hoy: donaciones de pedidos todavía sin cobrar (no son ni venta ni pasivo). */
  pendientesDeCobro: { cantidad: number; total: number };
  serie: { fecha: string; monto: number; cantidad: number }[];
  detalle: DonacionDetalle[];
  configActiva: boolean;
  control: ControlContable;
}

// ---------- Promocodes ----------

export interface PromocodeRanking {
  promocode_id: number;
  codigo: string;
  descripcion: string | null;
  usos: number;
  descontado: number;
  facturacion: number;
  costo: number;
  margen: number;
  margenPct: number | null;
}

export interface PromocodeEstado {
  promocode_id: number;
  codigo: string;
  descripcion: string | null;
  activo: boolean;
  vigente: boolean;
  vencido: boolean;
  agotado: boolean;
  sinUso: boolean;
  fecha_inicio: string;
  fecha_fin: string;
  usos_actuales: number;
  usos_max: number | null;
}

export interface ReportePromocodes {
  rango: RangoFechas;
  generado: string;
  totalDescontado: number;
  cantidadUsos: number;
  /** Descontado / (cobrado del período + descontado). */
  descuentoSobreVentasPct: number | null;
  facturacionConCodigo: number;
  margenConCodigo: number;
  margenConCodigoPct: number | null;
  ticketConCodigo: number;
  ticketSinCodigo: number;
  ranking: PromocodeRanking[];
  acumulacionPrecioSocio: { conPrecioSocio: number; soloDescuento: number };
  contadoresEstado: { vigentes: number; vencidos: number; agotados: number; sinUso: number };
  detalleEstados: PromocodeEstado[];
}

// ---------- Dashboard ----------

export interface ResumenVentas {
  ventas: number;
  costo: number;
  margen: number;
  pedidos: number;
}

export interface DashboardTienda {
  hoy: string;
  generado: string;
  ventas: { hoy: ResumenVentas; semana: ResumenVentas; mes: ResumenVentas };
  /** Pedidos abiertos hoy, por etapa (cantidades exactas). */
  pendientes: { verificacion: number; preparar: number; encargados: number; retirar: number };
  /** Encargues cobrados (señas) que todavía no se retiraron: todos, no solo del mes. */
  encarguesPendientes: { pedidos: number; importe: number };
  productosActivos: number;
  stock: {
    bajo: number;
    agotados: number;
    alertas: { id: number; nombre: string; sku: string | null; stock: number; stockMinimo: number }[];
  };
  pedidosRecientes: {
    id: number;
    numero_pedido: string | null;
    tipo: Canal;
    estado: string;
    /** Total sin la donación. */
    importe: number;
    cliente: string | null;
    created_at: string;
  }[];
  topProductosMes: ProductoTop[];
  /** Ventas netas por día y canal, último año (incluye hoy). */
  serie: { fecha: string; online: number; pos: number; disciplina: number }[];
  /** Control del mes contra la contabilidad. */
  controlMes: Pick<ControlContable, "reporte" | "saldoCuentas" | "diferencia" | "cuadra">;
}
