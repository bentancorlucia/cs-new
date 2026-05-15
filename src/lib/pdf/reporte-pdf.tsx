import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type {
  RangoFechas,
  ReporteDonaciones,
  ReportePromocodes,
  ReporteScope,
  ReporteTienda,
} from "@/types/reportes";

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

function fmtMoneda(v: number): string {
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "UYU",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function fmtPct(v: number | null): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

function Header({ title, rango }: { title: string; rango: RangoFechas }) {
  return (
    <>
      <View style={styles.header}>
        <Text style={styles.headerEyebrow}>Club Seminario · Reportes</Text>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerSubtitle}>
          Rango: {rango.desde} → {rango.hasta} · Emitido{" "}
          {new Date().toLocaleDateString("es-UY")}
        </Text>
      </View>
      <View style={styles.accentBar} />
    </>
  );
}

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>Club Seminario</Text>
      <Text
        style={styles.footerText}
        render={({ pageNumber, totalPages }) =>
          `Página ${pageNumber} / ${totalPages}`
        }
      />
    </View>
  );
}

function Kpi({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: string;
}) {
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
      {delta && <Text style={styles.kpiDelta}>{delta}</Text>}
    </View>
  );
}

function Table({
  headers,
  rows,
  widths,
}: {
  headers: string[];
  rows: (string | number)[][];
  widths: number[];
}) {
  return (
    <View style={styles.table}>
      <View style={styles.th}>
        {headers.map((h, i) => (
          <Text
            key={i}
            style={[
              styles.cellHead,
              {
                width: `${widths[i]}%`,
                textAlign: i === 0 ? "left" : "right",
              },
            ]}
          >
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
          <View key={ri} style={styles.tr}>
            {row.map((cell, ci) => (
              <Text
                key={ci}
                style={[
                  styles.cell,
                  {
                    width: `${widths[ci]}%`,
                    textAlign: ci === 0 ? "left" : "right",
                    fontFamily: ci === 0 ? "Helvetica" : "Helvetica",
                  },
                ]}
              >
                {String(cell)}
              </Text>
            ))}
          </View>
        ))
      )}
    </View>
  );
}

// ============ Document por scope ============

function TiendaDoc({ data, rango }: { data: ReporteTienda; rango: RangoFechas }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header title="Reporte de tienda" rango={rango} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Indicadores</Text>
          <View style={styles.kpiGrid}>
            <Kpi
              label="Ventas totales"
              value={fmtMoneda(data.ventas.valor)}
              delta={`vs anterior ${fmtPct(data.ventas.variacionPct)}`}
            />
            <Kpi
              label="COGS"
              value={fmtMoneda(data.cogs.valor)}
              delta={`vs anterior ${fmtPct(data.cogs.variacionPct)}`}
            />
            <Kpi
              label="Margen bruto"
              value={fmtMoneda(data.margen.valor)}
              delta={`vs anterior ${fmtPct(data.margen.variacionPct)}`}
            />
            <Kpi
              label="Margen %"
              value={data.ventas.valor > 0 ? `${data.margenPct.valor.toFixed(1)}%` : "—"}
            />
            <Kpi label="Pedidos" value={String(data.pedidos.valor)} />
            <Kpi label="Ticket promedio" value={fmtMoneda(data.ticketPromedio.valor)} />
            <Kpi label="% socios" value={`${data.ventasSocioPct.valor.toFixed(1)}%`} />
            <Kpi
              label="Items sin costo"
              value={String(data.itemsSinCosto)}
              delta="excluidos del COGS"
            />
          </View>
          {data.itemsSinCosto > 0 && (
            <Text style={styles.notice}>
              {data.itemsSinCosto} items en el rango no tienen datos de PPP. Se
              excluyen del cálculo de COGS y margen.
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top productos</Text>
          <Table
            headers={["Producto", "Cant.", "Facturación", "COGS", "Margen", "%"]}
            widths={[40, 8, 16, 14, 14, 8]}
            rows={data.topProductos.map((p) => [
              p.nombre.slice(0, 36),
              p.cantidad,
              fmtMoneda(p.facturacion),
              fmtMoneda(p.cogs),
              fmtMoneda(p.margen),
              p.margenPct == null ? "—" : `${p.margenPct.toFixed(1)}%`,
            ])}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Margen por categoría</Text>
          <Table
            headers={["Categoría", "Facturación", "COGS", "Margen", "%"]}
            widths={[40, 18, 18, 16, 8]}
            rows={data.margenPorCategoria.map((c) => [
              c.nombre.slice(0, 36),
              fmtMoneda(c.facturacion),
              fmtMoneda(c.cogs),
              fmtMoneda(c.margen),
              c.margenPct == null ? "—" : `${c.margenPct.toFixed(1)}%`,
            ])}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pedidos por estado</Text>
          <Table
            headers={["Estado", "Cantidad", "Total"]}
            widths={[50, 20, 30]}
            rows={data.porEstado.map((e) => [e.clave, e.cantidad, fmtMoneda(e.total)])}
          />
        </View>

        <Footer />
      </Page>
    </Document>
  );
}

function DonacionesDoc({ data, rango }: { data: ReporteDonaciones; rango: RangoFechas }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header title="Reporte de donaciones" rango={rango} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Indicadores</Text>
          <View style={styles.kpiGrid}>
            <Kpi label="Total donado" value={fmtMoneda(data.totalDonado)} />
            <Kpi label="Cantidad" value={String(data.cantidad)} />
            <Kpi label="Promedio" value={fmtMoneda(data.promedio)} />
            <Kpi
              label="Tasa conversión"
              value={data.tasaConversionPct == null ? "—" : `${data.tasaConversionPct.toFixed(1)}%`}
              delta={`${data.cantidad} / ${data.pedidosPagados} pagados`}
            />
          </View>
          {!data.configActiva && (
            <Text style={styles.notice}>
              Atención: el prompt de donación en checkout está desactivado.
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Desglose por estado</Text>
          <Table
            headers={["Estado", "Cantidad", "Total"]}
            widths={[50, 20, 30]}
            rows={data.porEstado.map((e) => [e.clave, e.cantidad, fmtMoneda(e.total)])}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Detalle</Text>
          <Table
            headers={["Pedido", "Fecha", "Estado", "Monto"]}
            widths={[28, 25, 22, 25]}
            rows={data.detalle.map((d) => [
              d.numero_pedido || `#${d.pedido_id}`,
              new Date(d.created_at).toLocaleDateString("es-UY"),
              d.estado,
              fmtMoneda(d.monto),
            ])}
          />
        </View>

        <Footer />
      </Page>
    </Document>
  );
}

function PromocodesDoc({ data, rango }: { data: ReportePromocodes; rango: RangoFechas }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header title="Reporte de promocodes" rango={rango} />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Indicadores</Text>
          <View style={styles.kpiGrid}>
            <Kpi label="Total descontado" value={fmtMoneda(data.totalDescontado)} />
            <Kpi label="Cantidad usos" value={String(data.cantidadUsos)} />
            <Kpi
              label="Descuento / ventas"
              value={data.descuentoSobreVentasPct == null ? "—" : `${data.descuentoSobreVentasPct.toFixed(1)}%`}
            />
            <Kpi
              label="Margen restante"
              value={fmtMoneda(data.margenRestante)}
              delta={data.margenRestantePct == null ? undefined : `${data.margenRestantePct.toFixed(1)}%`}
            />
            <Kpi label="Ticket con código" value={fmtMoneda(data.ticketConCodigo)} />
            <Kpi label="Ticket sin código" value={fmtMoneda(data.ticketSinCodigo)} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ranking de códigos</Text>
          <Table
            headers={["Código", "Usos", "Descontado", "Facturación", "Margen", "%"]}
            widths={[28, 8, 18, 18, 18, 10]}
            rows={data.ranking.map((r) => [
              r.codigo,
              r.usos,
              fmtMoneda(r.descontado),
              fmtMoneda(r.facturacion),
              fmtMoneda(r.margen),
              r.margenPct == null ? "—" : `${r.margenPct.toFixed(1)}%`,
            ])}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Estado de códigos</Text>
          <View style={styles.kpiGrid}>
            <Kpi label="Vigentes" value={String(data.contadoresEstado.vigentes)} />
            <Kpi label="Vencidos" value={String(data.contadoresEstado.vencidos)} />
            <Kpi label="Agotados" value={String(data.contadoresEstado.agotados)} />
            <Kpi label="Sin uso" value={String(data.contadoresEstado.sinUso)} />
          </View>
        </View>

        <Footer />
      </Page>
    </Document>
  );
}

export async function renderReportePdf(
  scope: ReporteScope,
  data: ReporteTienda | ReporteDonaciones | ReportePromocodes,
  rango: RangoFechas
): Promise<Buffer> {
  const doc =
    scope === "tienda" ? (
      <TiendaDoc data={data as ReporteTienda} rango={rango} />
    ) : scope === "donaciones" ? (
      <DonacionesDoc data={data as ReporteDonaciones} rango={rango} />
    ) : (
      <PromocodesDoc data={data as ReportePromocodes} rango={rango} />
    );
  return await renderToBuffer(doc);
}
