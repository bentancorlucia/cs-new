// Tipos compartidos entre los endpoints de reportes y la UI.
// Toda fecha viene del servidor en formato ISO ("YYYY-MM-DD" o ISO timestamp).

export type ReporteScope = "tienda" | "donaciones" | "promocodes";

export interface RangoFechas {
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD (inclusive)
}

// Estados de pedido considerados "venta efectiva".
export const ESTADOS_VENTA_EFECTIVA = [
  "pagado",
  "encargado",
  "preparando",
  "listo_retiro",
  "retirado",
] as const;
export type EstadoVentaEfectiva = (typeof ESTADOS_VENTA_EFECTIVA)[number];

// ---------- Tienda General ----------

export interface KpiComparado {
  valor: number;
  valorAnterior: number;
  variacionPct: number | null; // null si valorAnterior = 0
}

export interface SerieDiaria {
  fecha: string; // YYYY-MM-DD o YYYY-WW si agrupado por semana
  ventas: number;
  cogs: number;
  margen: number;
}

export interface ConteoPorClave {
  clave: string;
  cantidad: number;
  total: number;
}

export interface ProductoTop {
  producto_id: number;
  nombre: string;
  sku: string | null;
  cantidad: number;
  facturacion: number;
  cogs: number;
  margen: number;
  margenPct: number | null;
}

export interface MargenCategoria {
  categoria_id: number | null;
  nombre: string;
  facturacion: number;
  cogs: number;
  margen: number;
  margenPct: number | null;
}

export interface ReporteTienda {
  rango: RangoFechas;
  rangoAnterior: RangoFechas;
  ventas: KpiComparado;
  cogs: KpiComparado;
  margen: KpiComparado;
  margenPct: KpiComparado;
  pedidos: KpiComparado;
  ticketPromedio: KpiComparado;
  ventasSocioPct: KpiComparado;
  itemsSinCosto: number; // count de pedido_items con costo NULL en el rango
  serie: SerieDiaria[];
  porMetodoPago: ConteoPorClave[];
  onlineVsPos: { online: number; pos: number; pedidosOnline: number; pedidosPos: number };
  topProductos: ProductoTop[];
  margenPorCategoria: MargenCategoria[];
  porEstado: ConteoPorClave[];
}

// ---------- Donaciones ----------

export interface DonacionRow {
  id: number;
  pedido_id: number;
  monto: number;
  estado: string;
  created_at: string;
  numero_pedido: string | null;
}

export interface ReporteDonaciones {
  rango: RangoFechas;
  totalDonado: number;
  cantidad: number;
  promedio: number;
  pedidosPagados: number;
  tasaConversionPct: number | null;
  porEstado: ConteoPorClave[];
  serie: { fecha: string; monto: number; cantidad: number }[];
  detalle: DonacionRow[];
  configActiva: boolean;
}

// ---------- Promocodes ----------

export interface PromocodeRanking {
  promocode_id: number;
  codigo: string;
  descripcion: string | null;
  usos: number;
  descontado: number;
  facturacion: number;
  cogs: number;
  margen: number;
  margenPct: number | null;
}

export interface PromocodeEstado {
  promocode_id: number;
  codigo: string;
  descripcion: string | null;
  activo: boolean;
  vigente: boolean;
  agotado: boolean;
  sinUso: boolean;
  fecha_inicio: string;
  fecha_fin: string;
  usos_actuales: number;
  usos_max: number | null;
}

export interface ReportePromocodes {
  rango: RangoFechas;
  totalDescontado: number;
  cantidadUsos: number;
  descuentoSobreVentasPct: number | null;
  margenRestante: number;
  margenRestantePct: number | null;
  ticketConCodigo: number;
  ticketSinCodigo: number;
  ranking: PromocodeRanking[];
  acumulacionPrecioSocio: { conPrecioSocio: number; soloDescuento: number };
  contadoresEstado: {
    vigentes: number;
    vencidos: number;
    agotados: number;
    sinUso: number;
  };
  detalleEstados: PromocodeEstado[];
}
