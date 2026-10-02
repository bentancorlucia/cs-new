import * as XLSX from "xlsx";
import { formatFecha } from "@/lib/contabilidad/formato";
import { uruguayDateKey } from "@/lib/timezone";
import {
  NOMBRE_CANAL,
  NOMBRE_ESTADO_DONACION,
  NOMBRE_SCOPE,
  etiquetaBucket,
  nombreMetodo,
} from "@/lib/reportes/etiquetas";
import type {
  ControlContable,
  KpiComparado,
  KpiPctComparado,
  ReporteDonaciones,
  ReportePromocodes,
  ReporteScope,
  ReporteTienda,
} from "@/types/reportes";

/**
 * Excel de los reportes de tienda, armado en el servidor con el reporte
 * recién calculado (mismos números que la pantalla, el PDF y el MCP).
 */

type Celda = string | number | null;
type Tipo = "texto" | "importe" | "pct" | "entero";

interface Hoja {
  nombre: string;
  titulo: string;
  columnas: { titulo: string; tipo?: Tipo; ancho?: number }[];
  filas: Celda[][];
}

const FORMATO: Record<Tipo, string | null> = {
  texto: null,
  importe: "#,##0.00;-#,##0.00",
  pct: "0.0",
  entero: "0",
};

function libro(hojas: Hoja[], subtitulo: string): Buffer {
  const wb = XLSX.utils.book_new();
  for (const h of hojas) {
    const encabezado = 5;
    const ws = XLSX.utils.aoa_to_sheet([
      ["Club Seminario — Tienda"],
      [h.titulo],
      [subtitulo],
      [],
      h.columnas.map((c) => c.titulo),
      ...h.filas,
    ]);
    ws["!cols"] = h.columnas.map((c) => ({ wch: c.ancho ?? (c.tipo && c.tipo !== "texto" ? 16 : 30) }));
    h.columnas.forEach((c, ci) => {
      const z = FORMATO[c.tipo ?? "texto"];
      if (!z) return;
      for (let r = 0; r < h.filas.length; r++) {
        const celda = ws[XLSX.utils.encode_cell({ r: r + encabezado, c: ci })];
        if (celda && celda.t === "n") celda.z = z;
      }
    });
    XLSX.utils.book_append_sheet(wb, ws, h.nombre.slice(0, 31));
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const rangoTexto = (r: { desde: string; hasta: string }) => `${formatFecha(r.desde)} al ${formatFecha(r.hasta)}`;
const pctNum = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);

const filaKpi = (nombre: string, k: KpiComparado): Celda[] => [nombre, k.valor, k.valorAnterior, pctNum(k.variacionPct)];
const filaKpiPct = (nombre: string, k: KpiPctComparado): Celda[] => [
  nombre,
  pctNum(k.valor),
  pctNum(k.valorAnterior),
  k.diferenciaPp == null ? null : `${k.diferenciaPp >= 0 ? "+" : ""}${k.diferenciaPp.toFixed(1)} pp`,
];

function filasControl(c: ControlContable): Celda[][] {
  return [
    ...c.porCuenta.map((f): Celda[] => [f.codigo, f.nombre, f.reporte, f.contabilidad, Math.round((f.contabilidad - f.reporte) * 100) / 100]),
    [],
    ["", "Saldo de las cuentas en el período", null, c.saldoCuentas, null],
    ["", "− Ventas anuladas en otro período", null, c.anulacionesCruzadas, null],
    ["", "− Asientos de otro origen", null, c.otrosAsientos, null],
    ["", `${c.concepto} según el reporte`, c.reporte, null, null],
    ["", c.cuadra ? "Cuadra con la contabilidad" : "NO cuadra: diferencia", null, null, c.diferencia],
  ];
}

const COLUMNAS_CONTROL: Hoja["columnas"] = [
  { titulo: "Cuenta", ancho: 12 },
  { titulo: "Nombre", ancho: 40 },
  { titulo: "Reporte", tipo: "importe" },
  { titulo: "Contabilidad", tipo: "importe" },
  { titulo: "Diferencia", tipo: "importe" },
];

function hojasTienda(r: ReporteTienda): Hoja[] {
  return [
    {
      nombre: "Resumen",
      titulo: `Ventas de la tienda — comparado con ${rangoTexto(r.rangoAnterior)}`,
      columnas: [
        { titulo: "Indicador", ancho: 44 },
        { titulo: "Período", tipo: "importe" },
        { titulo: "Período anterior", tipo: "importe" },
        { titulo: "Variación %", tipo: "pct" },
      ],
      filas: [
        filaKpi("Ventas netas", r.ventas),
        filaKpi("Costo de lo vendido (kardex)", r.costo),
        filaKpi("Margen bruto", r.margen),
        filaKpiPct("Margen %", r.margenPct),
        filaKpi("Pedidos vendidos", r.pedidos),
        filaKpi("Ticket promedio (cobrado sin donación)", r.ticketPromedio),
        filaKpiPct("% de ventas minoristas a socios", r.ventasSocioPct),
        [],
        ["Ventas de los pedidos del período", r.composicion.ventasPedidos, null, null],
        ["+ Encargues entregados", r.composicion.encarguesEntregados, null, null],
        ["− Devoluciones", r.composicion.devoluciones, null, null],
        ["+ Cambios (lo nuevo entregado)", r.composicion.cambios, null, null],
        ["= Ventas netas", r.composicion.ventasNetas, null, null],
        [],
        [`Encargues cobrados pendientes de entrega (${r.encarguesPendientes.pedidos} pedidos, seña)`, r.encarguesPendientes.importe, null, null],
        [`Donaciones cobradas (${r.donaciones.pedidos} pedidos, no son venta)`, r.donaciones.importe, null, null],
        [`Ventas anuladas (${r.anuladas.pedidos} pedidos, no cuentan)`, r.anuladas.importe, null, null],
        ["Unidades vendidas sin costo en el kardex", r.unidadesSinCosto, null, null],
      ],
    },
    {
      nombre: "Control contable",
      titulo: `Control contra la contabilidad — ${r.control.concepto} y ${r.controlCosto.concepto.toLowerCase()}`,
      columnas: COLUMNAS_CONTROL,
      filas: [...filasControl(r.control), [], [], ...filasControl(r.controlCosto)],
    },
    {
      nombre: "Por canal y cuenta",
      titulo: "Ventas netas por canal, por cuenta contable y por método de pago",
      columnas: [
        { titulo: "Concepto", ancho: 40 },
        { titulo: "Ventas netas", tipo: "importe" },
        { titulo: "Costo", tipo: "importe" },
        { titulo: "Margen", tipo: "importe" },
        { titulo: "Pedidos", tipo: "entero" },
      ],
      filas: [
        ["POR CANAL", null, null, null, null],
        ...r.porCanal.map((c): Celda[] => [NOMBRE_CANAL[c.canal], c.ventas, c.costo, c.margen, c.pedidos]),
        [],
        ["POR CUENTA CONTABLE", null, null, null, null],
        ...r.porCuenta.map((c): Celda[] => [`${c.codigo} ${c.nombre}`, c.ventas, null, null, null]),
        [],
        ["POR MÉTODO DE PAGO", null, null, null, null],
        ...r.porMetodoPago.map((m): Celda[] => [nombreMetodo(m.clave), m.ventas, null, null, m.pedidos]),
      ],
    },
    {
      nombre: "Serie",
      titulo: "Evolución de las ventas netas",
      columnas: [
        { titulo: "Período", ancho: 14 },
        { titulo: "Ventas netas", tipo: "importe" },
        { titulo: "Costo", tipo: "importe" },
        { titulo: "Margen", tipo: "importe" },
        { titulo: "Pedidos", tipo: "entero" },
        { titulo: "Online", tipo: "importe" },
        { titulo: "POS", tipo: "importe" },
        { titulo: "Disciplinas", tipo: "importe" },
        { titulo: "Promocodes vigentes", ancho: 30 },
      ],
      filas: r.serie.map((s) => [
        s.fecha.includes("W") ? s.fecha : formatFecha(s.fecha),
        s.ventas,
        s.costo,
        s.margen,
        s.pedidos,
        s.online,
        s.pos,
        s.disciplina,
        s.promocodesActivos.join(", "),
      ]),
    },
    {
      nombre: "Top productos",
      titulo: "Productos más vendidos (descuento prorrateado; devoluciones restadas)",
      columnas: [
        { titulo: "Producto", ancho: 36 },
        { titulo: "SKU", ancho: 14 },
        { titulo: "Categoría", ancho: 20 },
        { titulo: "Unidades", tipo: "entero" },
        { titulo: "Facturación", tipo: "importe" },
        { titulo: "Costo", tipo: "importe" },
        { titulo: "Margen", tipo: "importe" },
        { titulo: "Margen %", tipo: "pct" },
      ],
      filas: r.topProductos.map((p) => [p.nombre, p.sku, p.categoria, p.unidades, p.facturacion, p.costo, p.margen, pctNum(p.margenPct)]),
    },
    {
      nombre: "Por categoría",
      titulo: "Margen por categoría",
      columnas: [
        { titulo: "Categoría", ancho: 30 },
        { titulo: "Unidades", tipo: "entero" },
        { titulo: "Facturación", tipo: "importe" },
        { titulo: "Costo", tipo: "importe" },
        { titulo: "Margen", tipo: "importe" },
        { titulo: "Margen %", tipo: "pct" },
      ],
      filas: r.margenPorCategoria.map((c) => [c.nombre, c.unidades, c.facturacion, c.costo, c.margen, pctNum(c.margenPct)]),
    },
  ];
}

function hojasDonaciones(r: ReporteDonaciones): Hoja[] {
  return [
    {
      nombre: "Resumen",
      titulo: "Donaciones para la Olla del Hogar (cobradas con las ventas del período)",
      columnas: [
        { titulo: "Indicador", ancho: 44 },
        { titulo: "Valor", tipo: "importe" },
      ],
      filas: [
        ["Total donado", r.totalDonado],
        ["Pedidos con donación", r.cantidad],
        ["Donación promedio", r.promedio],
        ["Pedidos online vendidos", r.pedidosOnline],
        ["Tasa de donación sobre pedidos online (%)", pctNum(r.tasaConversionPct)],
        [`Hoy pendientes de cobro (${r.pendientesDeCobro.cantidad} pedidos sin aprobar)`, r.pendientesDeCobro.total],
        ["Donaciones en el checkout", r.configActiva ? "Activas" : "Desactivadas"],
        [],
        ...r.porEstado.map((e): Celda[] => [`${NOMBRE_ESTADO_DONACION[e.estado] ?? e.estado} (${e.cantidad})`, e.total]),
      ],
    },
    {
      nombre: "Control contable",
      titulo: "Control contra la contabilidad — Donaciones a transferir",
      columnas: COLUMNAS_CONTROL,
      filas: filasControl(r.control),
    },
    {
      nombre: "Serie",
      titulo: "Donaciones por período",
      columnas: [
        { titulo: "Período", ancho: 14 },
        { titulo: "Monto", tipo: "importe" },
        { titulo: "Cantidad", tipo: "entero" },
      ],
      filas: r.serie.map((s) => [s.fecha.includes("W") ? etiquetaBucket(s.fecha) : formatFecha(s.fecha), s.monto, s.cantidad]),
    },
    {
      nombre: "Detalle",
      titulo: "Donaciones del período",
      columnas: [
        { titulo: "Fecha", ancho: 12 },
        { titulo: "Pedido", ancho: 20 },
        { titulo: "Canal", ancho: 12 },
        { titulo: "Monto", tipo: "importe" },
        { titulo: "Estado", ancho: 26 },
      ],
      filas: r.detalle.map((d) => [
        formatFecha(d.fecha),
        d.numero_pedido ?? `#${d.pedido_id}`,
        NOMBRE_CANAL[d.canal],
        d.monto,
        NOMBRE_ESTADO_DONACION[d.estado] ?? d.estado,
      ]),
    },
  ];
}

function hojasPromocodes(r: ReportePromocodes): Hoja[] {
  return [
    {
      nombre: "Resumen",
      titulo: "Promocodes en las ventas del período",
      columnas: [
        { titulo: "Indicador", ancho: 44 },
        { titulo: "Valor", tipo: "importe" },
      ],
      filas: [
        ["Total descontado", r.totalDescontado],
        ["Pedidos con código", r.cantidadUsos],
        ["Descuento sobre ventas (%)", pctNum(r.descuentoSobreVentasPct)],
        ["Facturación con código", r.facturacionConCodigo],
        ["Margen con código", r.margenConCodigo],
        ["Margen con código (%)", pctNum(r.margenConCodigoPct)],
        ["Ticket con código", r.ticketConCodigo],
        ["Ticket sin código", r.ticketSinCodigo],
        ["Con precio socio además del código", r.acumulacionPrecioSocio.conPrecioSocio],
        ["Solo el código", r.acumulacionPrecioSocio.soloDescuento],
      ],
    },
    {
      nombre: "Ranking",
      titulo: "Uso por código",
      columnas: [
        { titulo: "Código", ancho: 18 },
        { titulo: "Descripción", ancho: 30 },
        { titulo: "Usos", tipo: "entero" },
        { titulo: "Descontado", tipo: "importe" },
        { titulo: "Facturación", tipo: "importe" },
        { titulo: "Costo", tipo: "importe" },
        { titulo: "Margen", tipo: "importe" },
        { titulo: "Margen %", tipo: "pct" },
      ],
      filas: r.ranking.map((x) => [x.codigo, x.descripcion, x.usos, x.descontado, x.facturacion, x.costo, x.margen, pctNum(x.margenPct)]),
    },
    {
      nombre: "Estado de códigos",
      titulo: "Estado de todos los códigos (hoy)",
      columnas: [
        { titulo: "Código", ancho: 18 },
        { titulo: "Estado", ancho: 14 },
        { titulo: "Desde", ancho: 12 },
        { titulo: "Hasta", ancho: 12 },
        { titulo: "Usos", tipo: "entero" },
        { titulo: "Máximo", tipo: "entero" },
      ],
      filas: r.detalleEstados.map((e) => [
        e.codigo,
        e.vigente ? "Vigente" : e.agotado ? "Agotado" : e.vencido ? "Vencido" : e.activo ? "Programado" : "Inactivo",
        formatFecha(uruguayDateKey(e.fecha_inicio)),
        formatFecha(uruguayDateKey(e.fecha_fin)),
        e.usos_actuales,
        e.usos_max,
      ]),
    },
  ];
}

export function generarReporteExcel(
  scope: ReporteScope,
  reporte: ReporteTienda | ReporteDonaciones | ReportePromocodes
): Buffer {
  const sub = `${NOMBRE_SCOPE[scope]} · ${rangoTexto(reporte.rango)} · Importes en pesos uruguayos`;
  const hojas =
    scope === "tienda"
      ? hojasTienda(reporte as ReporteTienda)
      : scope === "donaciones"
        ? hojasDonaciones(reporte as ReporteDonaciones)
        : hojasPromocodes(reporte as ReportePromocodes);
  return libro(hojas, sub);
}
