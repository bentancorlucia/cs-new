import React from "react";
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { uruguayDateKey } from "@/lib/timezone";
import {
  NOMBRE_CANAL,
  NOMBRE_ESTADO_DONACION,
  formatPct,
  nombreMetodo,
} from "@/lib/reportes/etiquetas";
import type {
  ControlContable,
  KpiComparado,
  KpiPctComparado,
  RangoFechas,
  ReporteDonaciones,
  ReportePromocodes,
  ReporteScope,
  ReporteTienda,
} from "@/types/reportes";

/**
 * PDF de los reportes de tienda. Se arma en el servidor con el reporte
 * recién calculado: nunca con datos que manda el navegador.
 */

const COLORS = {
  bordo: "#730d32",
  bordoOscuro: "#5a0a27",
  dorado: "#f7b643",
  doradoClaro: "#fdf3e0",
  fondoClaro: "#faf8f5",
  texto: "#1f1f1f",
  textoSecundario: "#6b7280",
  blanco: "#ffffff",
  grisClaro: "#f0eded",
  verde: "#0d7377",
  rojo: "#9f1239",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.blanco,
    fontFamily: "Helvetica",
    paddingBottom: 36,
  },
  header: {
    backgroundColor: COLORS.bordo,
    paddingTop: 32,
    paddingBottom: 26,
    paddingHorizontal: 40,
  },
  headerEyebrow: {
    fontSize: 9,
    color: COLORS.dorado,
    letterSpacing: 3,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 24,
    color: COLORS.blanco,
    fontFamily: "Helvetica-Bold",
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 10,
    color: "#f5d7a3",
    marginTop: 6,
  },
  accentBar: { height: 3, backgroundColor: COLORS.dorado },
  section: { paddingHorizontal: 40, paddingTop: 22 },
  sectionTitle: {
    fontSize: 9,
    color: COLORS.bordo,
    letterSpacing: 2,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    marginBottom: 10,
  },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpiCard: {
    backgroundColor: COLORS.fondoClaro,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minWidth: 150,
    flexGrow: 1,
    flexBasis: "30%",
  },
  kpiLabel: {
    fontSize: 7,
    color: COLORS.textoSecundario,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 14,
    color: COLORS.texto,
    fontFamily: "Helvetica-Bold",
  },
  kpiDelta: {
    fontSize: 8,
    marginTop: 3,
    color: COLORS.textoSecundario,
  },
  table: {
    borderTopWidth: 1,
    borderColor: COLORS.grisClaro,
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: COLORS.grisClaro,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  th: {
    flexDirection: "row",
    backgroundColor: COLORS.fondoClaro,
    paddingVertical: 7,
    paddingHorizontal: 4,
  },
  cell: {
    fontSize: 8.5,
    color: COLORS.texto,
    paddingHorizontal: 2,
  },
  cellHead: {
    fontSize: 7.5,
    color: COLORS.bordo,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    paddingHorizontal: 2,
  },
  footer: {
    marginTop: 24,
    paddingHorizontal: 40,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: COLORS.grisClaro,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 8,
    color: COLORS.textoSecundario,
  },
  notice: {
    backgroundColor: COLORS.doradoClaro,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 9,
    color: COLORS.texto,
    marginTop: 8,
  },
});

const fmt = (v: number) => formatImporte(v, "UYU");

function variacion(k: KpiComparado): string {
  if (k.variacionPct == null) return `anterior ${fmt(k.valorAnterior)}`;
  return `${k.variacionPct >= 0 ? "+" : ""}${k.variacionPct.toFixed(1)}% vs anterior`;
}

function variacionPp(k: KpiPctComparado): string {
  if (k.diferenciaPp == null) return `anterior ${formatPct(k.valorAnterior)}`;
  return `${k.diferenciaPp >= 0 ? "+" : ""}${k.diferenciaPp.toFixed(1)} pp vs anterior`;
}

function Header({ title, rango }: { title: string; rango: RangoFechas }) {
  return (
    <>
      <View style={styles.header}>
        <Text style={styles.headerEyebrow}>Club Seminario · Tienda</Text>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerSubtitle}>
          Del {formatFecha(rango.desde)} al {formatFecha(rango.hasta)} · Emitido {formatFecha(uruguayDateKey(new Date()))} ·
          Importes en pesos uruguayos
        </Text>
      </View>
      <View style={styles.accentBar} />
    </>
  );
}

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>Club Seminario — ventas a fecha contable, sin donaciones</Text>
      <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Página ${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function Kpi({ label, value, delta }: { label: string; value: string; delta?: string }) {
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
      {delta && <Text style={styles.kpiDelta}>{delta}</Text>}
    </View>
  );
}

function Table({ headers, rows, widths }: { headers: string[]; rows: (string | number)[][]; widths: number[] }) {
  return (
    <View style={styles.table}>
      <View style={styles.th}>
        {headers.map((h, i) => (
          <Text key={i} style={[styles.cellHead, { width: `${widths[i]}%`, textAlign: i === 0 ? "left" : "right" }]}>
            {h}
          </Text>
        ))}
      </View>
      {rows.length === 0 ? (
        <View style={styles.tr}>
          <Text style={[styles.cell, { textAlign: "center", width: "100%", color: COLORS.textoSecundario }]}>
            Sin datos en el rango
          </Text>
        </View>
      ) : (
        rows.map((row, ri) => (
          <View key={ri} style={styles.tr} wrap={false}>
            {row.map((cell, ci) => (
              <Text key={ci} style={[styles.cell, { width: `${widths[ci]}%`, textAlign: ci === 0 ? "left" : "right" }]}>
                {String(cell)}
              </Text>
            ))}
          </View>
        ))
      )}
    </View>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionTitle}>{titulo}</Text>
      {children}
    </View>
  );
}

function Control({ c }: { c: ControlContable }) {
  return (
    <Seccion titulo={`Control contable — ${c.concepto}`}>
      <Table
        headers={["Cuenta", "Reporte", "Contabilidad", "Diferencia"]}
        widths={[46, 18, 18, 18]}
        rows={[
          ...c.porCuenta.map((f) => [`${f.codigo} ${f.nombre}`, fmt(f.reporte), fmt(f.contabilidad), fmt(f.contabilidad - f.reporte)]),
          ["Saldo de las cuentas en el período", "", fmt(c.saldoCuentas), ""],
          ["− Ventas anuladas en otro período", "", fmt(c.anulacionesCruzadas), ""],
          ["− Asientos de otro origen", "", fmt(c.otrosAsientos), ""],
        ]}
      />
      <Text style={[styles.notice, { backgroundColor: c.cuadra ? "#e7f5ef" : COLORS.doradoClaro }]}>
        {c.cuadra
          ? `Cuadra con la contabilidad: ${fmt(c.reporte)}.`
          : `No cuadra con la contabilidad: diferencia ${fmt(c.diferencia)}. Revisá los asientos del período.`}
      </Text>
    </Seccion>
  );
}

// ============ Documentos ============

function TiendaDoc({ data }: { data: ReporteTienda }) {
  const c = data.composicion;
  return (
    <Document title={`Reporte de tienda ${data.rango.desde} a ${data.rango.hasta}`}>
      <Page size="A4" style={styles.page}>
        <Header title="Reporte de ventas" rango={data.rango} />

        <Seccion titulo="Indicadores">
          <View style={styles.kpiGrid}>
            <Kpi label="Ventas netas" value={fmt(data.ventas.valor)} delta={variacion(data.ventas)} />
            <Kpi label="Costo (kardex)" value={fmt(data.costo.valor)} delta={variacion(data.costo)} />
            <Kpi label="Margen bruto" value={fmt(data.margen.valor)} delta={variacion(data.margen)} />
            <Kpi label="Margen %" value={formatPct(data.margenPct.valor)} delta={variacionPp(data.margenPct)} />
            <Kpi label="Pedidos" value={data.pedidos.valor.toLocaleString("es-UY")} delta={variacion(data.pedidos)} />
            <Kpi label="Ticket promedio" value={fmt(data.ticketPromedio.valor)} delta={variacion(data.ticketPromedio)} />
            <Kpi label="% a socios" value={formatPct(data.ventasSocioPct.valor)} delta={variacionPp(data.ventasSocioPct)} />
            <Kpi label="Donaciones (aparte)" value={fmt(data.donaciones.importe)} delta={`${data.donaciones.pedidos} pedidos`} />
            <Kpi label="Encargues sin entregar" value={fmt(data.encarguesPendientes.importe)} delta={`${data.encarguesPendientes.pedidos} pedidos · seña`} />
          </View>
          {data.unidadesSinCosto > 0 && (
            <Text style={styles.notice}>
              {data.unidadesSinCosto} unidades vendidas no tienen costo en el kardex (o son encargues): cuentan a costo 0 y el
              margen queda sobreestimado.
            </Text>
          )}
        </Seccion>

        <Seccion titulo="Composición de las ventas netas">
          <Table
            headers={["Concepto", "Importe"]}
            widths={[70, 30]}
            rows={[
              ["Ventas de los pedidos del período", fmt(c.ventasPedidos)],
              ["+ Encargues entregados", fmt(c.encarguesEntregados)],
              ["− Devoluciones", fmt(c.devoluciones)],
              ["+ Cambios (lo nuevo entregado)", fmt(c.cambios)],
              ["= Ventas netas", fmt(c.ventasNetas)],
            ]}
          />
        </Seccion>

        <Control c={data.control} />
        <Control c={data.controlCosto} />

        <Seccion titulo="Por canal">
          <Table
            headers={["Canal", "Ventas", "Costo", "Margen", "Pedidos"]}
            widths={[28, 20, 18, 20, 14]}
            rows={data.porCanal.map((x) => [NOMBRE_CANAL[x.canal], fmt(x.ventas), fmt(x.costo), fmt(x.margen), x.pedidos])}
          />
        </Seccion>

        <Seccion titulo="Por cuenta contable">
          <Table
            headers={["Cuenta", "Ventas"]}
            widths={[70, 30]}
            rows={data.porCuenta.map((x) => [`${x.codigo} ${x.nombre}`, fmt(x.ventas)])}
          />
        </Seccion>

        <Seccion titulo="Por método de pago">
          <Table
            headers={["Método", "Ventas", "Pedidos"]}
            widths={[50, 30, 20]}
            rows={data.porMetodoPago.map((x) => [nombreMetodo(x.clave), fmt(x.ventas), x.pedidos])}
          />
        </Seccion>

        <Seccion titulo="Top productos">
          <Table
            headers={["Producto", "Unid.", "Facturación", "Costo", "Margen", "Margen %"]}
            widths={[34, 8, 16, 14, 16, 12]}
            rows={data.topProductos.map((p) => [p.nombre, p.unidades, fmt(p.facturacion), fmt(p.costo), fmt(p.margen), formatPct(p.margenPct)])}
          />
        </Seccion>

        <Seccion titulo="Margen por categoría">
          <Table
            headers={["Categoría", "Unid.", "Facturación", "Costo", "Margen", "Margen %"]}
            widths={[30, 10, 16, 14, 16, 14]}
            rows={data.margenPorCategoria.map((x) => [x.nombre, x.unidades, fmt(x.facturacion), fmt(x.costo), fmt(x.margen), formatPct(x.margenPct)])}
          />
        </Seccion>

        <Footer />
      </Page>
    </Document>
  );
}

function DonacionesDoc({ data }: { data: ReporteDonaciones }) {
  return (
    <Document title={`Donaciones ${data.rango.desde} a ${data.rango.hasta}`}>
      <Page size="A4" style={styles.page}>
        <Header title="Donaciones a la Olla del Hogar" rango={data.rango} />
        <Seccion titulo="Indicadores">
          <View style={styles.kpiGrid}>
            <Kpi label="Total donado" value={fmt(data.totalDonado)} />
            <Kpi label="Pedidos con donación" value={String(data.cantidad)} />
            <Kpi label="Promedio" value={fmt(data.promedio)} />
            <Kpi label="Tasa sobre pedidos online" value={formatPct(data.tasaConversionPct)} delta={`${data.pedidosOnline} pedidos online`} />
            <Kpi label="Pendientes de cobro (hoy)" value={fmt(data.pendientesDeCobro.total)} delta={`${data.pendientesDeCobro.cantidad} pedidos sin aprobar`} />
          </View>
          {!data.configActiva && <Text style={styles.notice}>Las donaciones están desactivadas en el checkout.</Text>}
        </Seccion>
        <Control c={data.control} />
        <Seccion titulo="Por estado">
          <Table
            headers={["Estado", "Cantidad", "Total"]}
            widths={[50, 20, 30]}
            rows={data.porEstado.map((e) => [NOMBRE_ESTADO_DONACION[e.estado] ?? e.estado, e.cantidad, fmt(e.total)])}
          />
        </Seccion>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detalle</Text>
          <Table
            headers={["Fecha", "Pedido", "Canal", "Monto", "Estado"]}
            widths={[16, 24, 14, 18, 28]}
            rows={data.detalle.map((d) => [
              formatFecha(d.fecha),
              d.numero_pedido ?? `#${d.pedido_id}`,
              NOMBRE_CANAL[d.canal],
              fmt(d.monto),
              NOMBRE_ESTADO_DONACION[d.estado] ?? d.estado,
            ])}
          />
        </View>
        <Footer />
      </Page>
    </Document>
  );
}

function PromocodesDoc({ data }: { data: ReportePromocodes }) {
  return (
    <Document title={`Promocodes ${data.rango.desde} a ${data.rango.hasta}`}>
      <Page size="A4" style={styles.page}>
        <Header title="Promocodes" rango={data.rango} />
        <Seccion titulo="Indicadores">
          <View style={styles.kpiGrid}>
            <Kpi label="Total descontado" value={fmt(data.totalDescontado)} />
            <Kpi label="Pedidos con código" value={String(data.cantidadUsos)} />
            <Kpi label="Descuento sobre ventas" value={formatPct(data.descuentoSobreVentasPct)} />
            <Kpi label="Margen con código" value={fmt(data.margenConCodigo)} delta={formatPct(data.margenConCodigoPct)} />
            <Kpi label="Ticket con código" value={fmt(data.ticketConCodigo)} />
            <Kpi label="Ticket sin código" value={fmt(data.ticketSinCodigo)} />
          </View>
        </Seccion>
        <Seccion titulo="Ranking">
          <Table
            headers={["Código", "Usos", "Descontado", "Facturación", "Margen", "Margen %"]}
            widths={[24, 10, 18, 18, 16, 14]}
            rows={data.ranking.map((r) => [r.codigo, r.usos, fmt(r.descontado), fmt(r.facturacion), fmt(r.margen), formatPct(r.margenPct)])}
          />
        </Seccion>
        <Seccion titulo="Estado de los códigos (hoy)">
          <Table
            headers={["Vigentes", "Vencidos", "Agotados", "Sin uso"]}
            widths={[25, 25, 25, 25]}
            rows={[
              [
                String(data.contadoresEstado.vigentes),
                data.contadoresEstado.vencidos,
                data.contadoresEstado.agotados,
                data.contadoresEstado.sinUso,
              ],
            ]}
          />
        </Seccion>
        <Footer />
      </Page>
    </Document>
  );
}

export async function renderReportePdf(
  scope: ReporteScope,
  data: ReporteTienda | ReporteDonaciones | ReportePromocodes
): Promise<Buffer> {
  const doc =
    scope === "tienda" ? (
      <TiendaDoc data={data as ReporteTienda} />
    ) : scope === "donaciones" ? (
      <DonacionesDoc data={data as ReporteDonaciones} />
    ) : (
      <PromocodesDoc data={data as ReportePromocodes} />
    );
  return await renderToBuffer(doc);
}
