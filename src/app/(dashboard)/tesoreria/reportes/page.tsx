"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Download,
  Loader2,
  BarChart3,
  TrendingUp,
  Wallet,
  Target,
  Lock,
  ChevronLeft,
  ChevronRight,
  Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { staggerContainer, fadeInUp, springSmooth } from "@/lib/motion";
import { formatMonto, nombreMes } from "@/lib/tesoreria/format";
import { toast } from "sonner";
import {
  pdf,
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

// ============================================
// Tipos de reporte
// ============================================

type TipoReporte =
  | "estado-resultados"
  | "flujo-caja"
  | "balance-cuentas"
  | "presupuesto-real"
  | "cierre-mensual";

interface ReporteConfig {
  id: TipoReporte;
  nombre: string;
  descripcion: string;
  icon: React.ComponentType<any>;
  color: string;
}

const REPORTES: ReporteConfig[] = [
  {
    id: "estado-resultados",
    nombre: "Estado de Resultados",
    descripcion: "Ingresos y egresos por categoría. Resultado neto y comparación con período anterior.",
    icon: BarChart3,
    color: "bg-blue-100 text-blue-600",
  },
  {
    id: "flujo-caja",
    nombre: "Flujo de Caja",
    descripcion: "Evolución mensual de ingresos, egresos y saldo acumulado.",
    icon: TrendingUp,
    color: "bg-green-100 text-green-600",
  },
  {
    id: "balance-cuentas",
    nombre: "Balance por Cuenta",
    descripcion: "Saldo y movimientos de cada cuenta del club.",
    icon: Wallet,
    color: "bg-purple-100 text-purple-600",
  },
  {
    id: "presupuesto-real",
    nombre: "Presupuesto vs Real",
    descripcion: "Comparación del presupuesto planificado contra la ejecución real.",
    icon: Target,
    color: "bg-amber-100 text-amber-600",
  },
  {
    id: "cierre-mensual",
    nombre: "Cierre Mensual",
    descripcion: "Resumen completo del mes: resultados, saldos y movimientos destacados.",
    icon: Lock,
    color: "bg-bordo-100 text-bordo-600",
  },
];

// ============================================
// PDF Styles
// ============================================

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1f1f1f",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: "#730d32",
  },
  clubName: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#730d32",
    letterSpacing: 1,
  },
  reportTitle: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#1f1f1f",
    marginTop: 2,
  },
  reportPeriod: {
    fontSize: 10,
    color: "#6b7280",
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#730d32",
    marginTop: 16,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  rowAlt: {
    backgroundColor: "#faf8f5",
  },
  rowLabel: {
    fontSize: 10,
    flex: 1,
  },
  rowValue: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    textAlign: "right" as const,
    width: 100,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginTop: 4,
    borderTopWidth: 2,
    borderTopColor: "#730d32",
  },
  totalLabel: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
  },
  totalValue: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    textAlign: "right" as const,
    width: 100,
  },
  resultadoBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#faf8f5",
    borderWidth: 1,
    borderColor: "#730d32",
    borderRadius: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  resultadoLabel: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
  },
  resultadoValue: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: "#730d32",
  },
  footer: {
    position: "absolute" as const,
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 8,
    fontSize: 8,
    color: "#6b7280",
  },
  statGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    padding: 10,
    backgroundColor: "#faf8f5",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  statLabel: {
    fontSize: 8,
    color: "#6b7280",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    marginTop: 2,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#730d32",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 2,
  },
  tableHeaderCell: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
  },
  comparacionAnterior: {
    marginTop: 16,
    padding: 10,
    backgroundColor: "#f0f9ff",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  // Bar chart simulation
  barContainer: {
    marginTop: 12,
    marginBottom: 8,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  barLabel: {
    width: 120,
    fontSize: 8,
    marginRight: 8,
  },
  bar: {
    height: 12,
    borderRadius: 2,
  },
  barValue: {
    fontSize: 8,
    marginLeft: 6,
    color: "#6b7280",
  },
});

// ============================================
// PDF Document Components
// ============================================

function PDFHeader({ title, periodo }: { title: string; periodo: string }) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.clubName}>CLUB SEMINARIO</Text>
        <Text style={styles.reportTitle}>{title}</Text>
        <Text style={styles.reportPeriod}>{periodo}</Text>
      </View>
      <View style={{ alignItems: "flex-end" as const }}>
        <Text style={{ fontSize: 8, color: "#6b7280" }}>Club deportivo, social y cultural</Text>
        <Text style={{ fontSize: 8, color: "#6b7280" }}>Montevideo, Uruguay</Text>
      </View>
    </View>
  );
}

function PDFFooter() {
  const now = new Date();
  return (
    <View style={styles.footer} fixed>
      <Text>Club Seminario — Tesorería</Text>
      <Text>
        Generado: {now.toLocaleDateString("es-UY")} {now.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}
      </Text>
    </View>
  );
}

function fmtMonto(n: number, sign = false): string {
  const s = sign ? (n >= 0 ? "+" : "") : "";
  return `${s}$${Math.abs(n).toLocaleString("es-UY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// --- Estado de Resultados PDF ---
function EstadoResultadosPDF({ data }: { data: any }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PDFHeader
          title="Estado de Resultados"
          periodo={`${nombreMes(data.mes)} ${data.anio}`}
        />

        <View style={styles.statGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Ingresos</Text>
            <Text style={[styles.statValue, { color: "#16a34a" }]}>
              {fmtMonto(data.totalIngresos)}
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Egresos</Text>
            <Text style={[styles.statValue, { color: "#dc2626" }]}>
              {fmtMonto(data.totalEgresos)}
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Resultado</Text>
            <Text
              style={[
                styles.statValue,
                { color: data.resultado >= 0 ? "#16a34a" : "#dc2626" },
              ]}
            >
              {fmtMonto(data.resultado, true)}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>INGRESOS</Text>
        {data.ingresos.map((cat: any, idx: number) => (
          <View key={idx} style={[styles.row, idx % 2 === 1 ? styles.rowAlt : {}]}>
            <Text style={styles.rowLabel}>{cat.nombre}</Text>
            <Text style={styles.rowValue}>{fmtMonto(cat.total)}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>TOTAL INGRESOS</Text>
          <Text style={[styles.totalValue, { color: "#16a34a" }]}>
            {fmtMonto(data.totalIngresos)}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>EGRESOS</Text>
        {data.egresos.map((cat: any, idx: number) => (
          <View key={idx} style={[styles.row, idx % 2 === 1 ? styles.rowAlt : {}]}>
            <Text style={styles.rowLabel}>{cat.nombre}</Text>
            <Text style={styles.rowValue}>{fmtMonto(cat.total)}</Text>
          </View>
        ))}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>TOTAL EGRESOS</Text>
          <Text style={[styles.totalValue, { color: "#dc2626" }]}>
            {fmtMonto(data.totalEgresos)}
          </Text>
        </View>

        <View style={styles.resultadoBox}>
          <Text style={styles.resultadoLabel}>RESULTADO NETO</Text>
          <Text style={styles.resultadoValue}>{fmtMonto(data.resultado, true)}</Text>
        </View>

        {/* Gráfico de barras simulado */}
        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
          DISTRIBUCIÓN POR CATEGORÍA
        </Text>
        <View style={styles.barContainer}>
          {[...data.ingresos, ...data.egresos]
            .sort((a: any, b: any) => b.total - a.total)
            .slice(0, 8)
            .map((cat: any, idx: number) => {
              const maxTotal = Math.max(
                ...data.ingresos.map((c: any) => c.total),
                ...data.egresos.map((c: any) => c.total)
              );
              const width = maxTotal > 0 ? Math.max((cat.total / maxTotal) * 300, 8) : 8;
              const isIngreso = data.ingresos.some(
                (i: any) => i.nombre === cat.nombre
              );
              return (
                <View key={idx} style={styles.barRow}>
                  <Text style={styles.barLabel}>{cat.nombre}</Text>
                  <View
                    style={[
                      styles.bar,
                      {
                        width,
                        backgroundColor: isIngreso ? "#16a34a" : "#dc2626",
                      },
                    ]}
                  />
                  <Text style={styles.barValue}>{fmtMonto(cat.total)}</Text>
                </View>
              );
            })}
        </View>

        {/* Comparación con período anterior */}
        {data.periodoAnterior && (
          <View style={styles.comparacionAnterior}>
            <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 6 }}>
              Comparación con mes anterior
            </Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Ingresos anterior</Text>
              <Text style={styles.rowValue}>{fmtMonto(data.periodoAnterior.totalIngresos)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Egresos anterior</Text>
              <Text style={styles.rowValue}>{fmtMonto(data.periodoAnterior.totalEgresos)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Resultado anterior</Text>
              <Text style={styles.rowValue}>
                {fmtMonto(data.periodoAnterior.resultado, true)}
              </Text>
            </View>
          </View>
        )}

        <PDFFooter />
      </Page>
    </Document>
  );
}

// --- Flujo de Caja PDF ---
function FlujoCajaPDF({ data }: { data: any }) {
  let saldoAcum = 0;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PDFHeader title="Flujo de Caja" periodo="Últimos 12 meses" />

        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, { width: 80 }]}>Mes</Text>
          <Text style={[styles.tableHeaderCell, { width: 90, textAlign: "right" as const }]}>Ingresos</Text>
          <Text style={[styles.tableHeaderCell, { width: 90, textAlign: "right" as const }]}>Egresos</Text>
          <Text style={[styles.tableHeaderCell, { width: 90, textAlign: "right" as const }]}>Neto</Text>
          <Text style={[styles.tableHeaderCell, { width: 90, textAlign: "right" as const }]}>Acumulado</Text>
        </View>
        {data.flujo.map((m: any, idx: number) => {
          saldoAcum += m.neto;
          return (
            <View key={idx} style={[styles.tableRow, idx % 2 === 1 ? styles.rowAlt : {}]}>
              <Text style={{ width: 80, fontSize: 9 }}>
                {nombreMes(m.mes).slice(0, 3)} {m.anio}
              </Text>
              <Text style={{ width: 90, fontSize: 9, textAlign: "right" as const, color: "#16a34a" }}>
                {fmtMonto(m.ingresos)}
              </Text>
              <Text style={{ width: 90, fontSize: 9, textAlign: "right" as const, color: "#dc2626" }}>
                {fmtMonto(m.egresos)}
              </Text>
              <Text
                style={{
                  width: 90,
                  fontSize: 9,
                  textAlign: "right" as const,
                  fontFamily: "Helvetica-Bold",
                  color: m.neto >= 0 ? "#16a34a" : "#dc2626",
                }}
              >
                {fmtMonto(m.neto, true)}
              </Text>
              <Text style={{ width: 90, fontSize: 9, textAlign: "right" as const }}>
                {fmtMonto(saldoAcum)}
              </Text>
            </View>
          );
        })}

        {/* Waterfall chart simulation */}
        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
          EVOLUCIÓN MENSUAL
        </Text>
        <View style={styles.barContainer}>
          {data.flujo.map((m: any, idx: number) => {
            const maxVal = Math.max(...data.flujo.map((x: any) => Math.max(x.ingresos, x.egresos)));
            const ingW = maxVal > 0 ? (m.ingresos / maxVal) * 200 : 0;
            const egW = maxVal > 0 ? (m.egresos / maxVal) * 200 : 0;
            return (
              <View key={idx} style={{ flexDirection: "row", alignItems: "center", marginBottom: 3 }}>
                <Text style={{ width: 40, fontSize: 7 }}>{nombreMes(m.mes).slice(0, 3)}</Text>
                <View style={{ height: 8, width: ingW, backgroundColor: "#16a34a", borderRadius: 1 }} />
                <View style={{ height: 8, width: egW, backgroundColor: "#dc2626", borderRadius: 1, marginLeft: 2 }} />
                <Text style={{ fontSize: 7, marginLeft: 4, color: "#6b7280" }}>
                  {fmtMonto(m.neto, true)}
                </Text>
              </View>
            );
          })}
        </View>

        <PDFFooter />
      </Page>
    </Document>
  );
}

// --- Balance por Cuenta PDF ---
function BalanceCuentasPDF({ data }: { data: any }) {
  const totalUYU = data.cuentas
    .filter((c: any) => c.moneda === "UYU")
    .reduce((s: number, c: any) => s + c.saldo_actual, 0);
  const totalUSD = data.cuentas
    .filter((c: any) => c.moneda === "USD")
    .reduce((s: number, c: any) => s + c.saldo_actual, 0);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PDFHeader
          title="Balance por Cuenta"
          periodo={`${nombreMes(data.mes)} ${data.anio}`}
        />

        <View style={styles.statGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Total UYU</Text>
            <Text style={styles.statValue}>{fmtMonto(totalUYU)}</Text>
          </View>
          {totalUSD > 0 && (
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Total USD</Text>
              <Text style={styles.statValue}>U${totalUSD.toLocaleString("es-UY")}</Text>
            </View>
          )}
        </View>

        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Cuenta</Text>
          <Text style={[styles.tableHeaderCell, { width: 50 }]}>Moneda</Text>
          <Text style={[styles.tableHeaderCell, { width: 80, textAlign: "right" as const }]}>Saldo</Text>
          <Text style={[styles.tableHeaderCell, { width: 80, textAlign: "right" as const }]}>Ingresos</Text>
          <Text style={[styles.tableHeaderCell, { width: 80, textAlign: "right" as const }]}>Egresos</Text>
        </View>
        {data.cuentas.map((c: any, idx: number) => (
          <View key={idx} style={[styles.tableRow, idx % 2 === 1 ? styles.rowAlt : {}]}>
            <Text style={{ flex: 1, fontSize: 9 }}>{c.nombre}</Text>
            <Text style={{ width: 50, fontSize: 9 }}>{c.moneda}</Text>
            <Text style={{ width: 80, fontSize: 9, textAlign: "right" as const, fontFamily: "Helvetica-Bold" }}>
              {c.moneda === "USD" ? `U$${c.saldo_actual.toLocaleString("es-UY")}` : fmtMonto(c.saldo_actual)}
            </Text>
            <Text style={{ width: 80, fontSize: 9, textAlign: "right" as const, color: "#16a34a" }}>
              {fmtMonto(c.movimientos_periodo?.ingresos || 0)}
            </Text>
            <Text style={{ width: 80, fontSize: 9, textAlign: "right" as const, color: "#dc2626" }}>
              {fmtMonto(c.movimientos_periodo?.egresos || 0)}
            </Text>
          </View>
        ))}

        {/* Distribución visual */}
        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
          DISTRIBUCIÓN DE SALDOS
        </Text>
        <View style={styles.barContainer}>
          {data.cuentas
            .filter((c: any) => c.saldo_actual > 0)
            .sort((a: any, b: any) => b.saldo_actual - a.saldo_actual)
            .map((c: any, idx: number) => {
              const maxSaldo = Math.max(...data.cuentas.map((x: any) => x.saldo_actual));
              const w = maxSaldo > 0 ? (c.saldo_actual / maxSaldo) * 300 : 0;
              const colors = ["#730d32", "#f7b643", "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b"];
              return (
                <View key={idx} style={styles.barRow}>
                  <Text style={styles.barLabel}>{c.nombre}</Text>
                  <View style={[styles.bar, { width: w, backgroundColor: colors[idx % colors.length] }]} />
                  <Text style={styles.barValue}>
                    {c.moneda === "USD" ? `U$${c.saldo_actual.toLocaleString("es-UY")}` : fmtMonto(c.saldo_actual)}
                  </Text>
                </View>
              );
            })}
        </View>

        <PDFFooter />
      </Page>
    </Document>
  );
}

// --- Presupuesto vs Real PDF ---
function PresupuestoRealPDF({ data }: { data: any }) {
  const ingresos = data.comparativo.filter((c: any) => c.tipo === "ingreso");
  const egresos = data.comparativo.filter((c: any) => c.tipo === "egreso");

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PDFHeader
          title="Presupuesto vs Real"
          periodo={`${nombreMes(data.mes)} ${data.anio}`}
        />

        {[
          { titulo: "INGRESOS", items: ingresos },
          { titulo: "EGRESOS", items: egresos },
        ].map((seccion) => (
          <View key={seccion.titulo}>
            <Text style={styles.sectionTitle}>{seccion.titulo}</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Categoría</Text>
              <Text style={[styles.tableHeaderCell, { width: 80, textAlign: "right" as const }]}>Presup.</Text>
              <Text style={[styles.tableHeaderCell, { width: 80, textAlign: "right" as const }]}>Real</Text>
              <Text style={[styles.tableHeaderCell, { width: 70, textAlign: "right" as const }]}>Dif.</Text>
              <Text style={[styles.tableHeaderCell, { width: 40, textAlign: "right" as const }]}>%</Text>
            </View>
            {seccion.items.map((c: any, idx: number) => (
              <View key={idx} style={[styles.tableRow, idx % 2 === 1 ? styles.rowAlt : {}]}>
                <Text style={{ flex: 1, fontSize: 9 }}>{c.categoria}</Text>
                <Text style={{ width: 80, fontSize: 9, textAlign: "right" as const }}>{fmtMonto(c.presupuestado)}</Text>
                <Text style={{ width: 80, fontSize: 9, textAlign: "right" as const, fontFamily: "Helvetica-Bold" }}>
                  {fmtMonto(c.real)}
                </Text>
                <Text
                  style={{
                    width: 70,
                    fontSize: 9,
                    textAlign: "right" as const,
                    color: c.diferencia >= 0 ? "#16a34a" : "#dc2626",
                  }}
                >
                  {fmtMonto(c.diferencia, true)}
                </Text>
                <Text style={{ width: 40, fontSize: 9, textAlign: "right" as const }}>{c.porcentaje}%</Text>
              </View>
            ))}
          </View>
        ))}

        {/* Barras comparativas */}
        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>COMPARATIVO VISUAL</Text>
        <View style={styles.barContainer}>
          {data.comparativo.slice(0, 10).map((c: any, idx: number) => {
            const maxVal = Math.max(...data.comparativo.map((x: any) => Math.max(x.presupuestado, x.real)));
            const pW = maxVal > 0 ? (c.presupuestado / maxVal) * 200 : 0;
            const rW = maxVal > 0 ? (c.real / maxVal) * 200 : 0;
            return (
              <View key={idx} style={{ marginBottom: 6 }}>
                <Text style={{ fontSize: 8, marginBottom: 2 }}>{c.categoria}</Text>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{ height: 6, width: pW, backgroundColor: "#d1d5db", borderRadius: 1 }} />
                  <Text style={{ fontSize: 6, marginLeft: 2, color: "#9ca3af" }}>Presup.</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 1 }}>
                  <View
                    style={{
                      height: 6,
                      width: rW,
                      backgroundColor: c.tipo === "ingreso" ? "#16a34a" : "#dc2626",
                      borderRadius: 1,
                    }}
                  />
                  <Text style={{ fontSize: 6, marginLeft: 2, color: "#6b7280" }}>Real ({c.porcentaje}%)</Text>
                </View>
              </View>
            );
          })}
        </View>

        <PDFFooter />
      </Page>
    </Document>
  );
}

// --- Cierre Mensual PDF ---
function CierreMensualPDF({ data }: { data: any }) {
  const cierre = data.cierre;
  const saldos = cierre.saldos_snapshot || {};
  const categorias = cierre.categorias_snapshot || {};

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <PDFHeader
          title="Cierre Mensual"
          periodo={`${nombreMes(cierre.mes)} ${cierre.anio}`}
        />

        <View style={styles.statGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Ingresos</Text>
            <Text style={[styles.statValue, { color: "#16a34a" }]}>{fmtMonto(cierre.total_ingresos)}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Egresos</Text>
            <Text style={[styles.statValue, { color: "#dc2626" }]}>{fmtMonto(cierre.total_egresos)}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Resultado</Text>
            <Text style={[styles.statValue, { color: cierre.resultado >= 0 ? "#16a34a" : "#dc2626" }]}>
              {fmtMonto(cierre.resultado, true)}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>SALDOS AL CIERRE</Text>
        {Object.entries(saldos).map(([id, cuenta]: [string, any], idx) => (
          <View key={id} style={[styles.row, idx % 2 === 1 ? styles.rowAlt : {}]}>
            <Text style={styles.rowLabel}>{cuenta.nombre} ({cuenta.moneda})</Text>
            <Text style={styles.rowValue}>
              {cuenta.moneda === "USD" ? `U$${cuenta.saldo?.toLocaleString("es-UY")}` : fmtMonto(cuenta.saldo || 0)}
            </Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>DETALLE POR CATEGORÍA</Text>
        {Object.entries(categorias)
          .sort(([, a]: [string, any], [, b]: [string, any]) => b.total - a.total)
          .map(([id, cat]: [string, any], idx) => (
            <View key={id} style={[styles.row, idx % 2 === 1 ? styles.rowAlt : {}]}>
              <Text style={styles.rowLabel}>{cat.nombre}</Text>
              <Text style={styles.rowValue}>{fmtMonto(cat.total)}</Text>
            </View>
          ))}

        {cierre.notas && (
          <View style={{ marginTop: 16, padding: 10, backgroundColor: "#faf8f5", borderRadius: 4 }}>
            <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 4 }}>Notas:</Text>
            <Text style={{ fontSize: 9 }}>{cierre.notas}</Text>
          </View>
        )}

        <View style={{ marginTop: 16 }}>
          <Text style={{ fontSize: 8, color: "#6b7280" }}>
            Cerrado: {cierre.cerrado_at ? new Date(cierre.cerrado_at).toLocaleString("es-UY") : "—"}
          </Text>
        </View>

        <PDFFooter />
      </Page>
    </Document>
  );
}

// ============================================
// Main Page Component
// ============================================

export default function ReportesPage() {
  const [selectedTipo, setSelectedTipo] = useState<TipoReporte | null>(null);
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [reporteData, setReporteData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const fetchReporteData = async (tipo: TipoReporte) => {
    setLoading(true);
    setReporteData(null);
    try {
      const res = await fetch(
        `/api/tesoreria/reportes?tipo=${tipo}&anio=${anio}&mes=${mes}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReporteData(data.data);
    } catch (err: any) {
      toast.error(err.message || "Error al obtener datos del reporte");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTipo = (tipo: TipoReporte) => {
    setSelectedTipo(tipo);
    fetchReporteData(tipo);
  };

  const handleGenerarPDF = async () => {
    if (!reporteData) return;
    setGenerating(true);
    try {
      let doc;
      switch (reporteData.tipo) {
        case "estado-resultados":
          doc = <EstadoResultadosPDF data={reporteData} />;
          break;
        case "flujo-caja":
          doc = <FlujoCajaPDF data={reporteData} />;
          break;
        case "balance-cuentas":
          doc = <BalanceCuentasPDF data={reporteData} />;
          break;
        case "presupuesto-real":
          doc = <PresupuestoRealPDF data={reporteData} />;
          break;
        case "cierre-mensual":
          doc = <CierreMensualPDF data={reporteData} />;
          break;
        default:
          throw new Error("Tipo no soportado");
      }

      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${reporteData.tipo}_${nombreMes(mes).toLowerCase()}_${anio}.pdf`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("PDF generado correctamente");
    } catch (err: any) {
      toast.error("Error al generar PDF");
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const cambiarMes = (delta: number) => {
    let newMes = mes + delta;
    let newAnio = anio;
    if (newMes > 12) {
      newMes = 1;
      newAnio++;
    } else if (newMes < 1) {
      newMes = 12;
      newAnio--;
    }
    setMes(newMes);
    setAnio(newAnio);
    if (selectedTipo) {
      // Refetch with new period
      setTimeout(() => fetchReporteData(selectedTipo), 0);
    }
  };

  const reporteConfig = REPORTES.find((r) => r.id === selectedTipo);

  // Vista de detalle/preview
  if (selectedTipo && reporteConfig) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 lg:p-8 space-y-6"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedTipo(null);
                setReporteData(null);
              }}
              className="mb-2 -ml-2 text-muted-foreground"
            >
              &larr; Volver a reportes
            </Button>
            <h1 className="text-2xl font-display font-bold text-foreground">
              {reporteConfig.nombre}
            </h1>
            <p className="text-muted-foreground text-sm">
              {reporteConfig.descripcion}
            </p>
          </div>
          <Button
            onClick={handleGenerarPDF}
            disabled={generating || !reporteData}
            className="bg-bordo-800 hover:bg-bordo-900"
          >
            {generating ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Download className="size-4 mr-2" />
                Descargar PDF
              </>
            )}
          </Button>
        </div>

        {/* Selector de período */}
        <Card>
          <CardContent className="py-3 flex items-center justify-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => cambiarMes(-1)}
              className="size-8"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="font-medium text-sm min-w-[150px] text-center">
              {nombreMes(mes)} {anio}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => cambiarMes(1)}
              className="size-8"
            >
              <ChevronRight className="size-4" />
            </Button>
          </CardContent>
        </Card>

        {/* Preview del reporte */}
        {loading ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Loader2 className="size-8 animate-spin text-bordo-800 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Cargando datos...</p>
            </CardContent>
          </Card>
        ) : reporteData ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Eye className="size-4 text-muted-foreground" />
                  <CardTitle className="text-sm text-muted-foreground">
                    Vista previa
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {/* Preview content based on type */}
                {reporteData.tipo === "estado-resultados" && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center p-3 bg-green-50 rounded-lg">
                        <p className="text-xs text-muted-foreground">Ingresos</p>
                        <p className="text-lg font-bold text-green-600">
                          {formatMonto(reporteData.totalIngresos)}
                        </p>
                      </div>
                      <div className="text-center p-3 bg-red-50 rounded-lg">
                        <p className="text-xs text-muted-foreground">Egresos</p>
                        <p className="text-lg font-bold text-red-600">
                          {formatMonto(reporteData.totalEgresos)}
                        </p>
                      </div>
                      <div className="text-center p-3 bg-bordo-50 rounded-lg">
                        <p className="text-xs text-muted-foreground">Resultado</p>
                        <p className={`text-lg font-bold ${reporteData.resultado >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatMonto(reporteData.resultado, "UYU", true)}
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">Ingresos</h4>
                        {reporteData.ingresos.map((c: any, i: number) => (
                          <motion.div
                            key={c.nombre}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="flex justify-between py-1 text-sm"
                          >
                            <span>{c.nombre}</span>
                            <span className="font-mono text-green-600">{formatMonto(c.total)}</span>
                          </motion.div>
                        ))}
                      </div>
                      <div>
                        <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">Egresos</h4>
                        {reporteData.egresos.map((c: any, i: number) => (
                          <motion.div
                            key={c.nombre}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="flex justify-between py-1 text-sm"
                          >
                            <span>{c.nombre}</span>
                            <span className="font-mono text-red-600">{formatMonto(c.total)}</span>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {reporteData.tipo === "flujo-caja" && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Mes</TableHead>
                          <TableHead className="text-right">Ingresos</TableHead>
                          <TableHead className="text-right">Egresos</TableHead>
                          <TableHead className="text-right">Neto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reporteData.flujo.map((m: any, idx: number) => (
                          <motion.tr
                            key={idx}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: idx * 0.03 }}
                            className="border-b"
                          >
                            <TableCell className="text-sm">
                              {nombreMes(m.mes).slice(0, 3)} {m.anio}
                            </TableCell>
                            <TableCell className="text-right text-sm font-mono text-green-600">
                              {formatMonto(m.ingresos)}
                            </TableCell>
                            <TableCell className="text-right text-sm font-mono text-red-600">
                              {formatMonto(m.egresos)}
                            </TableCell>
                            <TableCell className={`text-right text-sm font-mono font-bold ${m.neto >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {formatMonto(m.neto, "UYU", true)}
                            </TableCell>
                          </motion.tr>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {reporteData.tipo === "balance-cuentas" && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cuenta</TableHead>
                          <TableHead>Moneda</TableHead>
                          <TableHead className="text-right">Saldo</TableHead>
                          <TableHead className="text-right">Ingresos</TableHead>
                          <TableHead className="text-right">Egresos</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reporteData.cuentas.map((c: any, idx: number) => (
                          <motion.tr
                            key={c.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: idx * 0.05 }}
                            className="border-b"
                          >
                            <TableCell className="font-medium text-sm">{c.nombre}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{c.moneda}</Badge></TableCell>
                            <TableCell className="text-right font-mono text-sm font-bold">
                              {formatMonto(c.saldo_actual, c.moneda)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-green-600">
                              {formatMonto(c.movimientos_periodo?.ingresos || 0)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-red-600">
                              {formatMonto(c.movimientos_periodo?.egresos || 0)}
                            </TableCell>
                          </motion.tr>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {reporteData.tipo === "presupuesto-real" && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Categoría</TableHead>
                          <TableHead className="text-right">Presup.</TableHead>
                          <TableHead className="text-right">Real</TableHead>
                          <TableHead className="text-right">Dif.</TableHead>
                          <TableHead className="text-right">%</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reporteData.comparativo.map((c: any, idx: number) => (
                          <motion.tr
                            key={idx}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: idx * 0.03 }}
                            className="border-b"
                          >
                            <TableCell className="text-sm">{c.categoria}</TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {formatMonto(c.presupuestado)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm font-bold">
                              {formatMonto(c.real)}
                            </TableCell>
                            <TableCell className={`text-right font-mono text-sm ${c.diferencia >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {formatMonto(c.diferencia, "UYU", true)}
                            </TableCell>
                            <TableCell className="text-right text-sm">{c.porcentaje}%</TableCell>
                          </motion.tr>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {reporteData.tipo === "cierre-mensual" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center p-3 bg-green-50 rounded-lg">
                        <p className="text-xs text-muted-foreground">Ingresos</p>
                        <p className="text-lg font-bold text-green-600">
                          {formatMonto(reporteData.cierre.total_ingresos)}
                        </p>
                      </div>
                      <div className="text-center p-3 bg-red-50 rounded-lg">
                        <p className="text-xs text-muted-foreground">Egresos</p>
                        <p className="text-lg font-bold text-red-600">
                          {formatMonto(reporteData.cierre.total_egresos)}
                        </p>
                      </div>
                      <div className="text-center p-3 bg-bordo-50 rounded-lg">
                        <p className="text-xs text-muted-foreground">Resultado</p>
                        <p className={`text-lg font-bold ${reporteData.cierre.resultado >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatMonto(reporteData.cierre.resultado, "UYU", true)}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      Cerrado: {reporteData.cierre.cerrado_at
                        ? new Date(reporteData.cierre.cerrado_at).toLocaleString("es-UY")
                        : "—"}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                No hay datos disponibles para este período
              </p>
            </CardContent>
          </Card>
        )}
      </motion.div>
    );
  }

  // Lista de reportes
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 lg:p-8 space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">
          Reportes PDF
        </h1>
        <p className="text-muted-foreground text-sm">
          Generá reportes profesionales con branding del club
        </p>
      </div>

      {/* Selector de período */}
      <Card>
        <CardContent className="py-3 flex items-center justify-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => cambiarMes(-1)}
            className="size-8"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="font-medium text-sm min-w-[150px] text-center">
            {nombreMes(mes)} {anio}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => cambiarMes(1)}
            className="size-8"
          >
            <ChevronRight className="size-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Grid de tipos de reporte */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {REPORTES.map((reporte) => {
          const Icon = reporte.icon;
          return (
            <motion.div key={reporte.id} variants={fadeInUp}>
              <Card
                className="cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 h-full"
                onClick={() => handleSelectTipo(reporte.id)}
              >
                <CardContent className="pt-5 pb-5 flex flex-col h-full">
                  <div className={`size-10 rounded-lg flex items-center justify-center mb-3 ${reporte.color}`}>
                    <Icon className="size-5" />
                  </div>
                  <h3 className="font-medium text-sm mb-1">{reporte.nombre}</h3>
                  <p className="text-xs text-muted-foreground flex-1">
                    {reporte.descripcion}
                  </p>
                  <div className="mt-3 flex items-center text-xs text-bordo-600 font-medium">
                    <FileText className="size-3.5 mr-1" />
                    Generar reporte
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>
    </motion.div>
  );
}
