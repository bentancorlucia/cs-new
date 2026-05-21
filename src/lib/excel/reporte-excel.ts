import * as XLSX from "xlsx";
import type {
  RangoFechas,
  ReporteDonaciones,
  ReportePromocodes,
  ReporteScope,
  ReporteTienda,
} from "@/types/reportes";

export async function exportarReporteExcel(
  scope: ReporteScope,
  data: ReporteTienda | ReporteDonaciones | ReportePromocodes,
  rango: RangoFechas
) {
  const wb = XLSX.utils.book_new();

  if (scope === "tienda") {
    const r = data as ReporteTienda;
    addSheet(wb, "Resumen", [
      ["Reporte tienda — General"],
      ["Rango", `${rango.desde} → ${rango.hasta}`],
      [],
      ["KPI", "Valor", "Período anterior", "% variación"],
      ["Ventas totales (UYU)", r.ventas.valor, r.ventas.valorAnterior, fmtPct(r.ventas.variacionPct)],
      ["COGS", r.cogs.valor, r.cogs.valorAnterior, fmtPct(r.cogs.variacionPct)],
      ["Margen bruto", r.margen.valor, r.margen.valorAnterior, fmtPct(r.margen.variacionPct)],
      ["Margen %", r.margenPct.valor, r.margenPct.valorAnterior, fmtPct(r.margenPct.variacionPct)],
      ["Cantidad pedidos", r.pedidos.valor, r.pedidos.valorAnterior, fmtPct(r.pedidos.variacionPct)],
      ["Ticket promedio", r.ticketPromedio.valor, r.ticketPromedio.valorAnterior, fmtPct(r.ticketPromedio.variacionPct)],
      ["% ventas socios", r.ventasSocioPct.valor, r.ventasSocioPct.valorAnterior, fmtPct(r.ventasSocioPct.variacionPct)],
      ["Items sin costo", r.itemsSinCosto, "", ""],
      [],
      ["Online vs POS"],
      ["Online", r.onlineVsPos.online, "pedidos", r.onlineVsPos.pedidosOnline],
      ["POS", r.onlineVsPos.pos, "pedidos", r.onlineVsPos.pedidosPos],
    ]);

    addSheet(wb, "Serie temporal", [
      ["Fecha", "Ventas", "COGS", "Margen", "Pedidos", "Promocodes activos"],
      ...r.serie.map((s) => [
        s.fecha,
        s.ventas,
        s.cogs,
        s.margen,
        s.cantidad,
        s.promocodesActivos.join(", "),
      ]),
    ]);

    addSheet(wb, "Top productos", [
      ["Producto", "SKU", "Cantidad", "Facturación", "COGS", "Margen", "Margen %"],
      ...r.topProductos.map((p) => [
        p.nombre,
        p.sku || "",
        p.cantidad,
        p.facturacion,
        p.cogs,
        p.margen,
        p.margenPct == null ? "" : Number(p.margenPct.toFixed(2)),
      ]),
    ]);

    addSheet(wb, "Por categoría", [
      ["Categoría", "Facturación", "COGS", "Margen", "Margen %"],
      ...r.margenPorCategoria.map((c) => [
        c.nombre,
        c.facturacion,
        c.cogs,
        c.margen,
        c.margenPct == null ? "" : Number(c.margenPct.toFixed(2)),
      ]),
    ]);

    addSheet(wb, "Por estado", [
      ["Estado", "Cantidad", "Total"],
      ...r.porEstado.map((e) => [e.clave, e.cantidad, e.total]),
    ]);

    addSheet(wb, "Método de pago", [
      ["Método", "Cantidad", "Total"],
      ...r.porMetodoPago.map((e) => [e.clave, e.cantidad, e.total]),
    ]);
  } else if (scope === "donaciones") {
    const r = data as ReporteDonaciones;
    addSheet(wb, "Resumen", [
      ["Reporte donaciones"],
      ["Rango", `${rango.desde} → ${rango.hasta}`],
      ["Config activa", r.configActiva ? "Sí" : "No"],
      [],
      ["KPI", "Valor"],
      ["Total donado", r.totalDonado],
      ["Cantidad", r.cantidad],
      ["Donación promedio", r.promedio],
      ["Pedidos pagados", r.pedidosPagados],
      ["Tasa conversión %", r.tasaConversionPct == null ? "—" : Number(r.tasaConversionPct.toFixed(2))],
    ]);
    addSheet(wb, "Por estado", [
      ["Estado", "Cantidad", "Total"],
      ...r.porEstado.map((e) => [e.clave, e.cantidad, e.total]),
    ]);
    addSheet(wb, "Serie temporal", [
      ["Fecha", "Monto", "Cantidad"],
      ...r.serie.map((s) => [s.fecha, s.monto, s.cantidad]),
    ]);
    addSheet(wb, "Detalle", [
      ["Pedido", "Fecha", "Estado", "Monto"],
      ...r.detalle.map((d) => [
        d.numero_pedido || `#${d.pedido_id}`,
        d.created_at,
        d.estado,
        d.monto,
      ]),
    ]);
  } else if (scope === "promocodes") {
    const r = data as ReportePromocodes;
    addSheet(wb, "Resumen", [
      ["Reporte promocodes"],
      ["Rango", `${rango.desde} → ${rango.hasta}`],
      [],
      ["KPI", "Valor"],
      ["Total descontado", r.totalDescontado],
      ["Cantidad usos", r.cantidadUsos],
      ["Descuento sobre ventas %", r.descuentoSobreVentasPct == null ? "—" : Number(r.descuentoSobreVentasPct.toFixed(2))],
      ["Margen restante", r.margenRestante],
      ["Margen restante %", r.margenRestantePct == null ? "—" : Number(r.margenRestantePct.toFixed(2))],
      ["Ticket promedio con código", r.ticketConCodigo],
      ["Ticket promedio sin código", r.ticketSinCodigo],
      [],
      ["Estado", "Cantidad"],
      ["Vigentes", r.contadoresEstado.vigentes],
      ["Vencidos", r.contadoresEstado.vencidos],
      ["Agotados", r.contadoresEstado.agotados],
      ["Sin uso", r.contadoresEstado.sinUso],
    ]);
    addSheet(wb, "Ranking", [
      ["Código", "Descripción", "Usos", "Descontado", "Facturación", "COGS", "Margen", "Margen %"],
      ...r.ranking.map((c) => [
        c.codigo,
        c.descripcion || "",
        c.usos,
        c.descontado,
        c.facturacion,
        c.cogs,
        c.margen,
        c.margenPct == null ? "" : Number(c.margenPct.toFixed(2)),
      ]),
    ]);
    addSheet(wb, "Estado códigos", [
      ["Código", "Descripción", "Inicio", "Fin", "Usos", "Usos máx", "Activo"],
      ...r.detalleEstados.map((c) => [
        c.codigo,
        c.descripcion || "",
        c.fecha_inicio,
        c.fecha_fin,
        c.usos_actuales,
        c.usos_max ?? "",
        c.activo ? "Sí" : "No",
      ]),
    ]);
  }

  XLSX.writeFile(wb, `reporte-${scope}-${rango.desde}_${rango.hasta}.xlsx`);
}

function addSheet(wb: XLSX.WorkBook, name: string, aoa: (string | number)[][]) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, name);
}

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}
