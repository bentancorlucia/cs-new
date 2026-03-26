"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit3,
  Save,
  X,
  TrendingUp,
  TrendingDown,
  Target,
  BarChart3,
  Droplets,
  Wallet,
  DollarSign,
  ArrowRightLeft,
  ChevronDown,
  Eye,
  EyeOff,
  Settings2,
  Activity,
  RotateCcw,
  Download,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  staggerContainer,
  staggerContainerFast,
  fadeInUp,
  springSmooth,
} from "@/lib/motion";
import { nombreMes, formatMonto } from "@/lib/tesoreria/format";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  ComposedChart,
  Line,
  Area,
  PieChart,
  Pie,
  Cell as PieCell,
} from "recharts";
import { Slider } from "@/components/ui/slider";
import {
  pdf,
  Document,
  Page as PDFPage,
  Text as PDFText,
  View as PDFView,
  StyleSheet as PDFStyleSheet,
} from "@react-pdf/renderer";
import { useDocumentTitle } from "@/hooks/use-document-title";

// ── Types ────────────────────────────────────────────────────────────────

interface CategoriaFinanciera {
  id: number;
  nombre: string;
  slug: string;
  tipo: "ingreso" | "egreso";
  color: string | null;
  icono: string | null;
  padre_id: number | null;
  orden: number;
}

interface PresupuestoItem {
  id?: number;
  anio: number;
  mes: number;
  categoria_id: number;
  monto_presupuestado: number;
  moneda: "UYU" | "USD";
  notas: string | null;
}

interface CuentaFinanciera {
  id: number;
  nombre: string;
  saldo_actual: number;
  moneda: "UYU" | "USD";
  tipo: string;
  color: string | null;
  activa: boolean;
}

interface MesData {
  ingresosUYU: number;
  egresosUYU: number;
  ingresosUSD: number;
  egresosUSD: number;
}

interface DistribucionItem {
  nombre: string;
  monto: number;
  color: string;
}

type MonedaDisplay = "UYU" | "USD" | "ambas";
type TabActiva = "presupuesto" | "flujo" | "proyeccion";

// ── Helpers ──────────────────────────────────────────────────────────────

function AnimatedCounter({
  value,
  moneda = "UYU",
}: {
  value: number;
  moneda?: "UYU" | "USD";
}) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const absVal = Math.abs(value);
    if (absVal === 0) {
      setDisplay(0);
      return;
    }
    const duration = 800;
    const steps = 30;
    const increment = absVal / steps;
    let current = 0;
    let step = 0;
    const interval = setInterval(() => {
      step++;
      current = Math.min(Math.round(increment * step), absVal);
      setDisplay(current);
      if (step >= steps) clearInterval(interval);
    }, duration / steps);
    return () => clearInterval(interval);
  }, [value]);
  const prefix = moneda === "USD" ? "U$" : "$";
  const sign = value < 0 ? "-" : "";
  return (
    <span className="tabular-nums">
      {sign}
      {prefix}
      {display.toLocaleString("es-UY")}
    </span>
  );
}

function ProgressBar({
  porcentaje,
  tipo,
}: {
  porcentaje: number;
  tipo: "ingreso" | "egreso";
}) {
  const clamped = Math.min(porcentaje, 150);
  const overBudget = tipo === "egreso" ? porcentaje > 100 : false;
  const underBudget = tipo === "ingreso" ? porcentaje < 80 : false;

  let barColor = "bg-emerald-500";
  if (tipo === "egreso") {
    barColor = overBudget ? "bg-red-500" : "bg-blue-500";
  } else {
    barColor = underBudget ? "bg-amber-500" : "bg-emerald-500";
  }

  return (
    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(clamped, 100)}%` }}
        transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
        className={`h-full rounded-full ${barColor}`}
      />
    </div>
  );
}

function SemaforoBadge({ value }: { value: number }) {
  if (value > 0)
    return (
      <Badge
        variant="outline"
        className="text-[10px] px-1.5 py-0 border-emerald-200 bg-emerald-50 text-emerald-700"
      >
        +
      </Badge>
    );
  if (value < 0)
    return (
      <Badge
        variant="outline"
        className="text-[10px] px-1.5 py-0 border-red-200 bg-red-50 text-red-700"
      >
        -
      </Badge>
    );
  return null;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-linea rounded-lg shadow-card p-3 max-w-[220px]">
      <p className="font-heading text-xs uppercase tracking-editorial text-muted-foreground mb-1.5">
        {label}
      </p>
      {payload.map((entry: any, i: number) => (
        <p
          key={i}
          className="font-body text-xs flex justify-between gap-3"
          style={{ color: entry.color }}
        >
          <span>{entry.name}</span>
          <span className="tabular-nums">
            {formatMonto(Math.abs(entry.value), "UYU")}
          </span>
        </p>
      ))}
    </div>
  );
};

const RADIAN = Math.PI / 180;
const renderPieLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: any) => {
  if (percent < 0.05) return null;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={600}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

/** Convert amount using exchange rate */
function convertir(
  monto: number,
  deMoneda: "UYU" | "USD",
  aMoneda: "UYU" | "USD",
  tipoCambio: number
): number {
  if (deMoneda === aMoneda) return monto;
  if (deMoneda === "USD" && aMoneda === "UYU") return monto * tipoCambio;
  return monto / tipoCambio;
}

// ── PDF Styles ───────────────────────────────────────────────────────────

const pdfStyles = PDFStyleSheet.create({
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
  rowAlt: {
    backgroundColor: "#faf8f5",
  },
  totalRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginTop: 4,
    borderTopWidth: 2,
    borderTopColor: "#730d32",
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
  escenarioBox: {
    marginTop: 10,
    padding: 10,
    backgroundColor: "#f0f9ff",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  barContainer: {
    marginTop: 12,
    marginBottom: 8,
  },
  bar: {
    height: 12,
    borderRadius: 2,
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
});

function pdfFmt(n: number, moneda: "UYU" | "USD" = "UYU", sign = false): string {
  const s = sign ? (n >= 0 ? "+" : "") : "";
  const prefix = moneda === "USD" ? "U$" : "$";
  return `${s}${prefix}${Math.abs(n).toLocaleString("es-UY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

interface ProyeccionPDFProps {
  anio: number;
  moneda: "UYU" | "USD";
  saldoInicial: number;
  ajusteIng: number;
  ajusteEgr: number;
  saldoInicialManual: boolean;
  data: Array<{
    mes: number;
    ingresos: number;
    egresos: number;
    neto: number;
    saldoBase: number;
    saldoOptimista: number;
    saldoPesimista: number;
    esProyectado: boolean;
  }>;
}

function ProyeccionPDF({ anio, moneda, saldoInicial, ajusteIng, ajusteEgr, saldoInicialManual, data }: ProyeccionPDFProps) {
  const totalIng = data.reduce((s, p) => s + p.ingresos, 0);
  const totalEgr = data.reduce((s, p) => s + p.egresos, 0);
  const totalNeto = totalIng - totalEgr;
  const saldoFinalBase = data[data.length - 1]?.saldoBase ?? 0;
  const saldoFinalOpt = data[data.length - 1]?.saldoOptimista ?? 0;
  const saldoFinalPes = data[data.length - 1]?.saldoPesimista ?? 0;

  // For bar chart simulation
  const maxSaldo = Math.max(...data.map((d) => Math.max(d.saldoBase, d.saldoOptimista)));
  const minSaldo = Math.min(...data.map((d) => Math.min(d.saldoBase, d.saldoPesimista)));
  const range = maxSaldo - minSaldo || 1;

  return (
    <Document>
      <PDFPage size="A4" style={pdfStyles.page}>
        {/* Header */}
        <PDFView style={pdfStyles.header}>
          <PDFView>
            <PDFText style={pdfStyles.clubName}>CLUB SEMINARIO</PDFText>
            <PDFText style={pdfStyles.reportTitle}>Proyección de Flujo de Caja</PDFText>
            <PDFText style={pdfStyles.reportPeriod}>Año {anio} — Moneda: {moneda}</PDFText>
          </PDFView>
          <PDFView style={{ alignItems: "flex-end" as const }}>
            <PDFText style={{ fontSize: 8, color: "#6b7280" }}>Club deportivo, social y cultural</PDFText>
            <PDFText style={{ fontSize: 8, color: "#6b7280" }}>Montevideo, Uruguay</PDFText>
          </PDFView>
        </PDFView>

        {/* Scenario config */}
        <PDFView style={pdfStyles.escenarioBox}>
          <PDFText style={{ fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 4 }}>
            Parámetros del escenario
          </PDFText>
          <PDFView style={{ flexDirection: "row", gap: 20 }}>
            <PDFText style={{ fontSize: 8, color: "#6b7280" }}>
              Margen ingresos: ±{ajusteIng}%
            </PDFText>
            <PDFText style={{ fontSize: 8, color: "#6b7280" }}>
              Margen egresos: ±{ajusteEgr}%
            </PDFText>
            <PDFText style={{ fontSize: 8, color: "#6b7280" }}>
              Saldo inicial: {pdfFmt(saldoInicial, moneda)} {saldoInicialManual ? "(manual)" : "(auto)"}
            </PDFText>
          </PDFView>
        </PDFView>

        {/* Summary Stats */}
        <PDFView style={[pdfStyles.statGrid, { marginTop: 14 }]}>
          <PDFView style={pdfStyles.statBox}>
            <PDFText style={pdfStyles.statLabel}>Saldo Final (Base)</PDFText>
            <PDFText style={[pdfStyles.statValue, { color: "#730d32" }]}>
              {pdfFmt(saldoFinalBase, moneda)}
            </PDFText>
          </PDFView>
          <PDFView style={pdfStyles.statBox}>
            <PDFText style={pdfStyles.statLabel}>Resultado Neto</PDFText>
            <PDFText style={[pdfStyles.statValue, { color: totalNeto >= 0 ? "#16a34a" : "#dc2626" }]}>
              {pdfFmt(totalNeto, moneda, true)}
            </PDFText>
          </PDFView>
          <PDFView style={pdfStyles.statBox}>
            <PDFText style={pdfStyles.statLabel}>Rango Fin de Año</PDFText>
            <PDFView style={{ flexDirection: "row", gap: 4, marginTop: 2 }}>
              <PDFText style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#dc2626" }}>
                {pdfFmt(saldoFinalPes, moneda)}
              </PDFText>
              <PDFText style={{ fontSize: 10, color: "#6b7280" }}>→</PDFText>
              <PDFText style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#16a34a" }}>
                {pdfFmt(saldoFinalOpt, moneda)}
              </PDFText>
            </PDFView>
          </PDFView>
        </PDFView>

        {/* Table */}
        <PDFText style={pdfStyles.sectionTitle}>DETALLE MENSUAL</PDFText>
        <PDFView style={pdfStyles.tableHeader}>
          <PDFText style={[pdfStyles.tableHeaderCell, { width: 60 }]}>Mes</PDFText>
          <PDFText style={[pdfStyles.tableHeaderCell, { width: 68, textAlign: "right" as const }]}>Ingresos</PDFText>
          <PDFText style={[pdfStyles.tableHeaderCell, { width: 68, textAlign: "right" as const }]}>Egresos</PDFText>
          <PDFText style={[pdfStyles.tableHeaderCell, { width: 68, textAlign: "right" as const }]}>Neto</PDFText>
          <PDFText style={[pdfStyles.tableHeaderCell, { width: 78, textAlign: "right" as const }]}>Saldo</PDFText>
          <PDFText style={[pdfStyles.tableHeaderCell, { width: 68, textAlign: "right" as const }]}>Optimista</PDFText>
          <PDFText style={[pdfStyles.tableHeaderCell, { width: 68, textAlign: "right" as const }]}>Pesimista</PDFText>
        </PDFView>
        {data.map((p, idx) => (
          <PDFView
            key={idx}
            style={[
              pdfStyles.tableRow,
              idx % 2 === 1 ? pdfStyles.rowAlt : {},
              p.esProyectado ? { borderLeftWidth: 2, borderLeftColor: "#f59e0b" } : {},
            ]}
          >
            <PDFText style={{ width: 60, fontSize: 9 }}>
              {nombreMes(p.mes).slice(0, 3)}{p.esProyectado ? " *" : ""}
            </PDFText>
            <PDFText style={{ width: 68, fontSize: 9, textAlign: "right" as const, color: "#16a34a" }}>
              {pdfFmt(p.ingresos, moneda)}
            </PDFText>
            <PDFText style={{ width: 68, fontSize: 9, textAlign: "right" as const, color: "#dc2626" }}>
              {pdfFmt(p.egresos, moneda)}
            </PDFText>
            <PDFText
              style={{
                width: 68,
                fontSize: 9,
                textAlign: "right" as const,
                fontFamily: "Helvetica-Bold",
                color: p.neto >= 0 ? "#16a34a" : "#dc2626",
              }}
            >
              {pdfFmt(p.neto, moneda, true)}
            </PDFText>
            <PDFText style={{ width: 78, fontSize: 9, textAlign: "right" as const, fontFamily: "Helvetica-Bold" }}>
              {pdfFmt(p.saldoBase, moneda)}
            </PDFText>
            <PDFText style={{ width: 68, fontSize: 9, textAlign: "right" as const, color: "#16a34a" }}>
              {pdfFmt(p.saldoOptimista, moneda)}
            </PDFText>
            <PDFText style={{ width: 68, fontSize: 9, textAlign: "right" as const, color: "#dc2626" }}>
              {pdfFmt(p.saldoPesimista, moneda)}
            </PDFText>
          </PDFView>
        ))}
        {/* Totals */}
        <PDFView style={pdfStyles.totalRow}>
          <PDFText style={{ width: 60, fontSize: 10, fontFamily: "Helvetica-Bold" }}>Total</PDFText>
          <PDFText style={{ width: 68, fontSize: 10, textAlign: "right" as const, fontFamily: "Helvetica-Bold", color: "#16a34a" }}>
            {pdfFmt(totalIng, moneda)}
          </PDFText>
          <PDFText style={{ width: 68, fontSize: 10, textAlign: "right" as const, fontFamily: "Helvetica-Bold", color: "#dc2626" }}>
            {pdfFmt(totalEgr, moneda)}
          </PDFText>
          <PDFText style={{ width: 68, fontSize: 10, textAlign: "right" as const, fontFamily: "Helvetica-Bold", color: totalNeto >= 0 ? "#16a34a" : "#dc2626" }}>
            {pdfFmt(totalNeto, moneda, true)}
          </PDFText>
          <PDFText style={{ width: 78, fontSize: 10, textAlign: "right" as const, fontFamily: "Helvetica-Bold" }}>
            {pdfFmt(saldoFinalBase, moneda)}
          </PDFText>
          <PDFText style={{ width: 68, fontSize: 10, textAlign: "right" as const, fontFamily: "Helvetica-Bold", color: "#16a34a" }}>
            {pdfFmt(saldoFinalOpt, moneda)}
          </PDFText>
          <PDFText style={{ width: 68, fontSize: 10, textAlign: "right" as const, fontFamily: "Helvetica-Bold", color: "#dc2626" }}>
            {pdfFmt(saldoFinalPes, moneda)}
          </PDFText>
        </PDFView>

        <PDFText style={{ fontSize: 7, color: "#6b7280", marginTop: 4 }}>
          * = Mes proyectado (basado en presupuesto)
        </PDFText>

        {/* Saldo evolution chart (bar simulation) */}
        <PDFText style={[pdfStyles.sectionTitle, { marginTop: 18 }]}>
          EVOLUCIÓN DEL SALDO
        </PDFText>
        <PDFView style={pdfStyles.barContainer}>
          {data.map((p, idx) => {
            const baseW = Math.max(((p.saldoBase - minSaldo) / range) * 280, 2);
            const optW = Math.max(((p.saldoOptimista - minSaldo) / range) * 280, 2);
            const pesW = Math.max(((p.saldoPesimista - minSaldo) / range) * 280, 2);
            return (
              <PDFView key={idx} style={{ marginBottom: 5 }}>
                <PDFView style={{ flexDirection: "row", alignItems: "center" }}>
                  <PDFText style={{ width: 35, fontSize: 7 }}>
                    {nombreMes(p.mes).slice(0, 3)}
                  </PDFText>
                  <PDFView style={{ flex: 1 }}>
                    {/* Pessimistic bar (background) */}
                    {p.esProyectado && (
                      <PDFView
                        style={{
                          height: 10,
                          width: optW,
                          backgroundColor: "#dcfce7",
                          borderRadius: 1,
                          position: "absolute" as const,
                        }}
                      />
                    )}
                    {p.esProyectado && (
                      <PDFView
                        style={{
                          height: 10,
                          width: pesW,
                          backgroundColor: "#fee2e2",
                          borderRadius: 1,
                          position: "absolute" as const,
                        }}
                      />
                    )}
                    {/* Base bar */}
                    <PDFView
                      style={{
                        height: 10,
                        width: baseW,
                        backgroundColor: p.esProyectado ? "#730d32" : "#991b45",
                        borderRadius: 1,
                        opacity: p.esProyectado ? 0.8 : 1,
                      }}
                    />
                  </PDFView>
                  <PDFText style={{ fontSize: 7, marginLeft: 6, width: 60, textAlign: "right" as const, color: "#1f1f1f" }}>
                    {pdfFmt(p.saldoBase, moneda)}
                  </PDFText>
                </PDFView>
              </PDFView>
            );
          })}
        </PDFView>

        {/* Legend */}
        <PDFView style={{ flexDirection: "row", gap: 16, marginTop: 6 }}>
          <PDFView style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <PDFView style={{ width: 12, height: 6, backgroundColor: "#991b45", borderRadius: 1 }} />
            <PDFText style={{ fontSize: 7, color: "#6b7280" }}>Real</PDFText>
          </PDFView>
          <PDFView style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <PDFView style={{ width: 12, height: 6, backgroundColor: "#730d32", borderRadius: 1, opacity: 0.8 }} />
            <PDFText style={{ fontSize: 7, color: "#6b7280" }}>Proyectado (base)</PDFText>
          </PDFView>
          <PDFView style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <PDFView style={{ width: 12, height: 6, backgroundColor: "#dcfce7", borderRadius: 1 }} />
            <PDFText style={{ fontSize: 7, color: "#6b7280" }}>Optimista</PDFText>
          </PDFView>
          <PDFView style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <PDFView style={{ width: 12, height: 6, backgroundColor: "#fee2e2", borderRadius: 1 }} />
            <PDFText style={{ fontSize: 7, color: "#6b7280" }}>Pesimista</PDFText>
          </PDFView>
        </PDFView>

        {/* Resultado box */}
        <PDFView style={pdfStyles.resultadoBox}>
          <PDFView>
            <PDFText style={{ fontSize: 10, fontFamily: "Helvetica-Bold" }}>Saldo Final Proyectado</PDFText>
            <PDFText style={{ fontSize: 8, color: "#6b7280", marginTop: 2 }}>
              Escenario base — Dic {anio}
            </PDFText>
          </PDFView>
          <PDFText style={{ fontSize: 18, fontFamily: "Helvetica-Bold", color: "#730d32" }}>
            {pdfFmt(saldoFinalBase, moneda)}
          </PDFText>
        </PDFView>

        {/* Footer */}
        <PDFView style={pdfStyles.footer} fixed>
          <PDFText>Club Seminario — Tesorería</PDFText>
          <PDFText>
            Generado: {new Date().toLocaleDateString("es-UY")}{" "}
            {new Date().toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit" })}
          </PDFText>
        </PDFView>
      </PDFPage>
    </Document>
  );
}

// ── Main Component ───────────────────────────────────────────────────────

export default function FlujoPresupuestoPage() {
  useDocumentTitle("Flujo y Presupuesto");
  // ── State ──
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [tab, setTab] = useState<TabActiva>("presupuesto");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [copiarOpen, setCopiarOpen] = useState(false);
  const [copiarOrigenAnio, setCopiarOrigenAnio] = useState(anio);
  const [copiarOrigenMes, setCopiarOrigenMes] = useState(
    new Date().getMonth() || 12
  );
  const [tcOpen, setTcOpen] = useState(false);

  // Presupuesto view mode
  const [mesPres, setMesPres] = useState(new Date().getMonth() + 1);
  const [vistaPres, setVistaPres] = useState<"mensual" | "anual">("mensual");

  // Multi-currency
  const [monedaDisplay, setMonedaDisplay] = useState<MonedaDisplay>("UYU");
  const [tipoCambioGlobal, setTipoCambioGlobal] = useState(43.5);
  const [tiposCambioPorMes, setTiposCambioPorMes] = useState<
    Record<number, number>
  >({});

  // Flujo
  const [mesSeleccionado, setMesSeleccionado] = useState(
    new Date().getMonth() + 1
  );

  // Data
  const [categorias, setCategorias] = useState<CategoriaFinanciera[]>([]);
  const [presupuestos, setPresupuestos] = useState<PresupuestoItem[]>([]);
  const [reales, setReales] = useState<Record<string, number>>({});
  const [realesPorMoneda, setRealesPorMoneda] = useState<
    Record<string, Record<string, number>>
  >({});
  const [mesesData, setMesesData] = useState<Record<number, MesData>>({});
  const [saldosPorMoneda, setSaldosPorMoneda] = useState<
    Record<string, number>
  >({});
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);
  const [distribucionPorMes, setDistribucionPorMes] = useState<
    Record<
      number,
      { ingresos: DistribucionItem[]; egresos: DistribucionItem[] }
    >
  >({});
  const [promedios, setPromedios] = useState<Record<string, number>>({});
  const [promediosMoneda, setPromediosMoneda] = useState<
    Record<string, Record<string, number>>
  >({});
  const [mesActualServer, setMesActualServer] = useState(
    new Date().getMonth() + 1
  );

  // Projection scenario adjustments
  const [ajusteIngresos, setAjusteIngresos] = useState(10);
  const [ajusteEgresos, setAjusteEgresos] = useState(10);
  const [escenarioOpen, setEscenarioOpen] = useState(true);
  // null = auto-calculated, number = manual override
  const [saldoInicialManual, setSaldoInicialManual] = useState<number | null>(null);
  // Projection currency toggle (independent from other tabs)
  const [monedaProyeccion, setMonedaProyeccion] = useState<"UYU" | "USD">("UYU");
  const [generatingPDF, setGeneratingPDF] = useState(false);

  // Editable presupuesto values: { `${catId}-${mes}`: "monto" }
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  // Editable presupuesto currencies: { `${catId}-${mes}`: "UYU"|"USD" }
  const [editMonedas, setEditMonedas] = useState<Record<string, "UYU" | "USD">>({});

  // Expanded parent categories in presupuesto table
  const [expandedCats, setExpandedCats] = useState<Set<number>>(new Set());

  // ── Fetch data ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/tesoreria/flujo-presupuesto?anio=${anio}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      setCategorias(json.categorias);
      setPresupuestos(json.presupuestos);
      setReales(json.reales);
      setRealesPorMoneda(json.realesPorMoneda || {});
      setMesesData(json.mesesData);
      setSaldosPorMoneda(json.saldosPorMoneda);
      setCuentas(json.cuentas);
      setDistribucionPorMes(json.distribucionPorMes);
      setPromedios(json.promediosPorCategoria);
      setPromediosMoneda(json.promediosPorCategoriaMoneda || {});
      setMesActualServer(json.mesActual);

      // Initialize edit values and currencies from presupuestos
      const ev: Record<string, string> = {};
      const em: Record<string, "UYU" | "USD"> = {};
      for (const p of json.presupuestos) {
        const key = `${p.categoria_id}-${p.mes}`;
        ev[key] = p.monto_presupuestado.toString();
        em[key] = p.moneda || "UYU";
      }
      setEditValues(ev);
      setEditMonedas(em);
    } catch (err: any) {
      toast.error(err.message || "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, [anio]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Derived data ──
  const topCats = useMemo(
    () => categorias.filter((c) => !c.padre_id),
    [categorias]
  );
  const ingresoCats = useMemo(
    () => topCats.filter((c) => c.tipo === "ingreso"),
    [topCats]
  );
  const egresoCats = useMemo(
    () => topCats.filter((c) => c.tipo === "egreso"),
    [topCats]
  );

  /** Map parent_id → subcategories */
  const subCatsMap = useMemo(() => {
    const map: Record<number, CategoriaFinanciera[]> = {};
    for (const c of categorias) {
      if (c.padre_id) {
        if (!map[c.padre_id]) map[c.padre_id] = [];
        map[c.padre_id].push(c);
      }
    }
    // Sort subcategories by orden
    for (const key of Object.keys(map)) {
      map[Number(key)].sort((a, b) => a.orden - b.orden);
    }
    return map;
  }, [categorias]);

  const toggleExpanded = (catId: number) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  /** Get exchange rate for a given month */
  const getTipoCambio = (mes: number) =>
    tiposCambioPorMes[mes] ?? tipoCambioGlobal;

  /** Convert MesData to a single currency total */
  const convertirMes = (
    data: MesData,
    mes: number,
    moneda: "UYU" | "USD"
  ) => {
    const tc = getTipoCambio(mes);
    if (moneda === "UYU") {
      return {
        ingresos: Math.round(data.ingresosUYU + data.ingresosUSD * tc),
        egresos: Math.round(data.egresosUYU + data.egresosUSD * tc),
      };
    }
    return {
      ingresos: Math.round(data.ingresosUSD + data.ingresosUYU / tc),
      egresos: Math.round(data.egresosUSD + data.egresosUYU / tc),
    };
  };

  /** Display currency (for "ambas" mode we default to UYU in totals) */
  const monedaBase: "UYU" | "USD" =
    monedaDisplay === "ambas" ? "UYU" : monedaDisplay;

  // ── Presupuesto rows for the current view ──
  /** Get real amount for a category-month, converted to the budget's currency */
  const getRealEnMoneda = (catId: number, mes: number, monedaPres: "UYU" | "USD") => {
    const key = `${catId}-${mes}`;
    const porMoneda = realesPorMoneda[key];
    if (!porMoneda) return 0;
    const tc = getTipoCambio(mes);
    const realUYU = porMoneda["UYU"] || 0;
    const realUSD = porMoneda["USD"] || 0;
    if (monedaPres === "UYU") {
      return realUYU + realUSD * tc;
    }
    return realUSD + realUYU / tc;
  };

  /** Build row data for a single category */
  const buildCatRow = (cat: CategoriaFinanciera, tipo: "ingreso" | "egreso") => {
    let presupuestado = 0;
    let real = 0;
    let monedaPres: "UYU" | "USD" = "UYU";

    if (vistaPres === "mensual") {
      const pres = presupuestos.find(
        (p) => p.categoria_id === cat.id && p.mes === mesPres
      );
      presupuestado = pres?.monto_presupuestado || 0;
      monedaPres = pres?.moneda || editMonedas[`${cat.id}-${mesPres}`] || "UYU";
      real = getRealEnMoneda(cat.id, mesPres, monedaPres);
    } else {
      for (let m = 1; m <= 12; m++) {
        const pres = presupuestos.find(
          (p) => p.categoria_id === cat.id && p.mes === m
        );
        const mp = pres?.moneda || "UYU";
        presupuestado += pres?.monto_presupuestado || 0;
        real += getRealEnMoneda(cat.id, m, mp);
      }
      // For annual view, use the most common currency or first month's currency
      const firstPres = presupuestos.find((p) => p.categoria_id === cat.id);
      monedaPres = firstPres?.moneda || "UYU";
    }

    const diferencia =
      tipo === "ingreso"
        ? real - presupuestado
        : presupuestado - real;
    const porcentaje =
      presupuestado > 0
        ? Math.round((real / presupuestado) * 100)
        : real > 0
          ? 999
          : 0;

    const editKey = `${cat.id}-${mesPres}`;
    const nuevoMonto = editValues[editKey] || presupuestado.toString();
    const editMoneda = editMonedas[editKey] || monedaPres;

    return {
      categoria: cat,
      presupuestado: Math.round(presupuestado),
      real: Math.round(real),
      diferencia: Math.round(diferencia),
      porcentaje,
      nuevoMonto,
      moneda: monedaPres,
      editMoneda,
      isSubcategory: !!cat.padre_id,
      hasChildren: !!(subCatsMap[cat.id] && subCatsMap[cat.id].length > 0),
    };
  };

  type PresupuestoRow = ReturnType<typeof buildCatRow>;

  const buildPresupuestoRows = (tipo: "ingreso" | "egreso") => {
    const cats = tipo === "ingreso" ? ingresoCats : egresoCats;
    const rows: PresupuestoRow[] = [];

    for (const parent of cats) {
      const parentRow = buildCatRow(parent, tipo);
      const subs = subCatsMap[parent.id] || [];

      // If parent has subcategories, parent totals = sum of subs
      // Convert each sub to monedaBase for aggregation
      if (subs.length > 0) {
        const subRows = subs.map((sub) => buildCatRow(sub, tipo));
        const tc = getTipoCambio(mesPres);
        let subPresup = 0;
        let subReal = 0;
        for (const r of subRows) {
          subPresup += convertir(r.presupuestado, r.moneda, monedaBase, tc);
          subReal += convertir(r.real, r.moneda, monedaBase, tc);
        }
        subPresup = Math.round(subPresup);
        subReal = Math.round(subReal);

        // Override parent with sum of children
        parentRow.presupuestado = subPresup;
        parentRow.real = subReal;
        parentRow.moneda = monedaBase;
        parentRow.diferencia =
          tipo === "ingreso"
            ? subReal - subPresup
            : subPresup - subReal;
        parentRow.porcentaje =
          subPresup > 0
            ? Math.round((subReal / subPresup) * 100)
            : subReal > 0
              ? 999
              : 0;
      }

      rows.push(parentRow);

      // Add subcategory rows if expanded
      if (subs.length > 0 && expandedCats.has(parent.id)) {
        for (const sub of subs) {
          rows.push(buildCatRow(sub, tipo));
        }
      }
    }

    return rows;
  };

  const ingresoRows = buildPresupuestoRows("ingreso");
  const egresoRows = buildPresupuestoRows("egreso");
  // Only sum parent rows to avoid double counting subcategories
  // Convert each row to monedaBase for totals
  const tcForTotals = getTipoCambio(mesPres);
  const ingTotals = {
    presupuestado: Math.round(ingresoRows.filter((r) => !r.isSubcategory).reduce((s, r) => s + convertir(r.presupuestado, r.moneda, monedaBase, tcForTotals), 0)),
    real: Math.round(ingresoRows.filter((r) => !r.isSubcategory).reduce((s, r) => s + convertir(r.real, r.moneda, monedaBase, tcForTotals), 0)),
  };
  const egrTotals = {
    presupuestado: Math.round(egresoRows.filter((r) => !r.isSubcategory).reduce((s, r) => s + convertir(r.presupuestado, r.moneda, monedaBase, tcForTotals), 0)),
    real: Math.round(egresoRows.filter((r) => !r.isSubcategory).reduce((s, r) => s + convertir(r.real, r.moneda, monedaBase, tcForTotals), 0)),
  };
  const resultadoPresup = ingTotals.presupuestado - egrTotals.presupuestado;
  const resultadoReal = ingTotals.real - egrTotals.real;

  // ── Flujo de caja ──
  const flujo = useMemo(() => {
    const saldoUYU = saldosPorMoneda["UYU"] || 0;
    const saldoUSD = saldosPorMoneda["USD"] || 0;
    const totalNetoAnio = Object.entries(mesesData).reduce(
      (sum, [, m]) =>
        sum +
        m.ingresosUYU -
        m.egresosUYU +
        (m.ingresosUSD - m.egresosUSD) * tipoCambioGlobal,
      0
    );
    let saldoAcumulado = Math.round(
      saldoUYU + saldoUSD * tipoCambioGlobal - totalNetoAnio
    );

    const items = [];
    for (let m = 1; m <= 12; m++) {
      const data = mesesData[m];
      if (!data) continue;
      const { ingresos, egresos } = convertirMes(data, m, monedaBase);
      const neto = ingresos - egresos;
      const saldoInicial = saldoAcumulado;
      saldoAcumulado += neto;

      items.push({
        mes: m,
        saldoInicial,
        ingresos,
        egresos,
        neto,
        saldoFinal: saldoAcumulado,
        esProyectado: m > mesActualServer,
        ingresosUYU: data.ingresosUYU,
        egresosUYU: data.egresosUYU,
        ingresosUSD: data.ingresosUSD,
        egresosUSD: data.egresosUSD,
      });
    }
    return items;
  }, [mesesData, saldosPorMoneda, tipoCambioGlobal, monedaBase, mesActualServer]);

  const totalIngFlujo = flujo.reduce((s, f) => s + f.ingresos, 0);
  const totalEgrFlujo = flujo.reduce((s, f) => s + f.egresos, 0);
  const netoAnualFlujo = totalIngFlujo - totalEgrFlujo;
  const saldoInicialAnio = flujo[0]?.saldoInicial ?? 0;

  // ── Proyección de flujo de caja ──
  // Auto-calculated starting balance
  const saldoInicialAuto = useMemo(() => {
    const saldoUYU = saldosPorMoneda["UYU"] || 0;
    const saldoUSD = saldosPorMoneda["USD"] || 0;
    const tc = tipoCambioGlobal;
    if (monedaProyeccion === "USD") {
      const totalNetoAnio = Object.values(mesesData).reduce(
        (sum, m) =>
          sum +
          m.ingresosUSD -
          m.egresosUSD +
          (m.ingresosUYU - m.egresosUYU) / tc,
        0
      );
      return Math.round(saldoUSD + saldoUYU / tc - totalNetoAnio);
    }
    const totalNetoAnio = Object.values(mesesData).reduce(
      (sum, m) =>
        sum +
        m.ingresosUYU -
        m.egresosUYU +
        (m.ingresosUSD - m.egresosUSD) * tc,
      0
    );
    return Math.round(saldoUYU + saldoUSD * tc - totalNetoAnio);
  }, [saldosPorMoneda, mesesData, tipoCambioGlobal, monedaProyeccion]);

  const saldoInicialProyeccion = saldoInicialManual ?? saldoInicialAuto;

  const proyeccionData = useMemo(() => {
    let saldoBase = saldoInicialProyeccion;
    let saldoOptimista = saldoInicialProyeccion;
    let saldoPesimista = saldoInicialProyeccion;

    const items = [];
    for (let m = 1; m <= 12; m++) {
      const esProyectado = m > mesActualServer;
      let ingresos = 0;
      let egresos = 0;

      // Calculate budget totals for this month (always, for display)
      let presupIngresos = 0;
      let presupEgresos = 0;
      {
        const tc = getTipoCambio(m);
        for (const cat of categorias) {
          if (cat.padre_id) continue;
          const subCats = subCatsMap[cat.id];
          const catsToSum =
            subCats && subCats.length > 0 ? subCats : [cat];
          for (const c of catsToSum) {
            const pres = presupuestos.find(
              (p) => p.categoria_id === c.id && p.mes === m
            );
            if (pres) {
              const monto = convertir(
                pres.monto_presupuestado,
                pres.moneda || "UYU",
                monedaProyeccion,
                tc
              );
              if (c.tipo === "ingreso") presupIngresos += monto;
              else presupEgresos += monto;
            }
          }
        }
        presupIngresos = Math.round(presupIngresos);
        presupEgresos = Math.round(presupEgresos);
      }

      // Calculate real values for past months (for comparison column)
      let realIngresos = 0;
      let realEgresos = 0;
      if (!esProyectado && mesesData[m]) {
        const { ingresos: ing, egresos: egr } = convertirMes(
          mesesData[m],
          m,
          monedaProyeccion
        );
        realIngresos = ing;
        realEgresos = egr;
      }

      // All months use presupuesto values for projection
      ingresos = presupIngresos;
      egresos = presupEgresos;

      const netoBase = ingresos - egresos;
      const saldoIni = saldoBase;

      const ingOpt = Math.round(ingresos * (1 + ajusteIngresos / 100));
      const egrOpt = Math.round(egresos * (1 - ajusteEgresos / 100));
      const ingPes = Math.round(ingresos * (1 - ajusteIngresos / 100));
      const egrPes = Math.round(egresos * (1 + ajusteEgresos / 100));

      saldoBase += netoBase;
      saldoOptimista += ingOpt - egrOpt;
      saldoPesimista += ingPes - egrPes;

      items.push({
        mes: m,
        mesNombre: nombreMes(m).slice(0, 3),
        ingresos,
        egresos,
        neto: netoBase,
        saldoInicial: saldoIni,
        saldoBase,
        saldoOptimista,
        saldoPesimista,
        esProyectado,
        realIngresos,
        realEgresos,
        realNeto: realIngresos - realEgresos,
      });
    }
    return items;
  }, [
    mesesData,
    saldoInicialProyeccion,
    tipoCambioGlobal,
    monedaProyeccion,
    mesActualServer,
    categorias,
    presupuestos,
    subCatsMap,
    ajusteIngresos,
    ajusteEgresos,
  ]);

  // Projection summary values
  const proySaldoFinalBase = proyeccionData[11]?.saldoBase ?? 0;
  const proySaldoFinalOpt = proyeccionData[11]?.saldoOptimista ?? 0;
  const proySaldoFinalPes = proyeccionData[11]?.saldoPesimista ?? 0;
  const proyNetoAnual = proyeccionData.reduce((s, p) => s + p.neto, 0);

  // Chart data for projection
  const proyChartData = proyeccionData.map((p) => ({
    mes: p.mesNombre,
    saldoBase: p.saldoBase,
    saldoOptimista: p.saldoOptimista,
    saldoPesimista: p.saldoPesimista,
    esProyectado: p.esProyectado,
  }));

  // Custom tooltip for projection chart
  const ProyeccionTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    return (
      <div className="bg-white border border-linea rounded-lg shadow-card p-3 min-w-[180px]">
        <p className="font-heading text-xs uppercase tracking-editorial text-muted-foreground mb-1.5">
          {label} {d?.esProyectado ? "(Proyectado)" : "(Presupuesto)"}
        </p>
        <div className="space-y-1">
          <p className="font-body text-xs flex justify-between gap-3">
            <span className="text-foreground">Base</span>
            <span className="tabular-nums font-medium">
              {formatMonto(d?.saldoBase ?? 0, monedaProyeccion)}
            </span>
          </p>
          <p className="font-body text-xs flex justify-between gap-3 text-emerald-600">
            <span>Optimista</span>
            <span className="tabular-nums">
              {formatMonto(d?.saldoOptimista ?? 0, monedaProyeccion)}
            </span>
          </p>
          <p className="font-body text-xs flex justify-between gap-3 text-red-600">
            <span>Pesimista</span>
            <span className="tabular-nums">
              {formatMonto(d?.saldoPesimista ?? 0, monedaProyeccion)}
            </span>
          </p>
        </div>
      </div>
    );
  };

  // ── Handlers ──
  const handleExportProyeccionPDF = async () => {
    setGeneratingPDF(true);
    try {
      const doc = (
        <ProyeccionPDF
          anio={anio}
          moneda={monedaProyeccion}
          saldoInicial={saldoInicialProyeccion}
          ajusteIng={ajusteIngresos}
          ajusteEgr={ajusteEgresos}
          saldoInicialManual={saldoInicialManual !== null}
          data={proyeccionData}
        />
      );
      const blob = await pdf(doc).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `proyeccion_${anio}_${monedaProyeccion.toLowerCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF de proyección generado");
    } catch (err: any) {
      toast.error("Error al generar PDF");
      console.error(err);
    } finally {
      setGeneratingPDF(false);
    }
  };

  const handleSavePresupuesto = async () => {
    setSaving(true);
    try {
      // Save month by month for the current view
      if (vistaPres === "mensual") {
        // Collect all editable rows (subcategories only if parent has children,
        // otherwise the parent itself is editable)
        const allRows = [...ingresoRows, ...egresoRows];
        const items = allRows
          .filter((r) => {
            // Only save leaf-level rows (subcategories or parents without children)
            if (r.hasChildren) return false;
            return parseFloat(r.nuevoMonto) > 0;
          })
          .map((r) => ({
            categoria_id: r.categoria.id,
            monto_presupuestado: parseFloat(r.nuevoMonto) || 0,
            moneda: r.editMoneda || "UYU",
          }));

        const res = await fetch("/api/tesoreria/flujo-presupuesto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ anio, mes: mesPres, items }),
        });
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error);
        }
      }

      toast.success("Presupuesto guardado");
      setEditMode(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const handleCopiar = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/tesoreria/flujo-presupuesto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "copiar",
          anio_origen: copiarOrigenAnio,
          mes_origen: copiarOrigenMes,
          anio_destino: anio,
          mes_destino: mesPres,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error);
      }

      const json = await res.json();
      toast.success(`${json.count} categorías copiadas`);
      setCopiarOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || "Error al copiar");
    } finally {
      setSaving(false);
    }
  };

  const updateEditValue = (catId: number, mes: number, value: string) => {
    setEditValues((prev) => ({ ...prev, [`${catId}-${mes}`]: value }));
  };

  const updateEditMoneda = (catId: number, mes: number, moneda: "UYU" | "USD") => {
    setEditMonedas((prev) => ({ ...prev, [`${catId}-${mes}`]: moneda }));
  };

  const prevMesPres = () => {
    if (mesPres === 1) {
      setMesPres(12);
      setAnio(anio - 1);
    } else setMesPres(mesPres - 1);
  };
  const nextMesPres = () => {
    if (mesPres === 12) {
      setMesPres(1);
      setAnio(anio + 1);
    } else setMesPres(mesPres + 1);
  };

  // ── Chart data ──
  const chartPresupuesto = [...ingresoRows, ...egresoRows]
    .filter((r) => !r.isSubcategory && (r.presupuestado > 0 || r.real > 0))
    .map((r) => ({
      nombre:
        r.categoria.nombre.length > 15
          ? r.categoria.nombre.slice(0, 15) + "…"
          : r.categoria.nombre,
      Presupuesto: r.presupuestado,
      Real: r.real,
      tipo: r.categoria.tipo,
    }));

  const waterfallData = flujo.map((f) => ({
    mes: nombreMes(f.mes).slice(0, 3),
    ingresos: f.ingresos,
    egresos: -f.egresos,
    neto: f.neto,
    saldoFinal: f.saldoFinal,
    esProyectado: f.esProyectado,
  }));

  // Distribution data for selected month
  const distMes = distribucionPorMes[mesSeleccionado] || {
    ingresos: [],
    egresos: [],
  };

  // ── Render presupuesto table ──
  const renderPresupuestoTable = (
    rows: typeof ingresoRows,
    tipo: "ingreso" | "egreso",
    totals: { presupuestado: number; real: number }
  ) => {
    const diffTotal =
      tipo === "ingreso"
        ? totals.real - totals.presupuestado
        : totals.presupuestado - totals.real;
    const pctTotal =
      totals.presupuestado > 0
        ? Math.round((totals.real / totals.presupuestado) * 100)
        : 0;

    return (
      <Card className="border-linea">
        <CardHeader className="pb-2">
          <CardTitle className="font-heading text-sm uppercase tracking-editorial flex items-center gap-2">
            {tipo === "ingreso" ? (
              <TrendingUp className="size-4 text-emerald-600" />
            ) : (
              <TrendingDown className="size-4 text-red-600" />
            )}
            {tipo === "ingreso" ? "Ingresos" : "Egresos"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-linea bg-superficie/50">
                  <th className="text-left font-heading text-xs uppercase tracking-editorial text-muted-foreground px-4 py-2.5">
                    Categoría
                  </th>
                  <th className="text-right font-heading text-xs uppercase tracking-editorial text-muted-foreground px-4 py-2.5">
                    Presup.
                  </th>
                  <th className="text-right font-heading text-xs uppercase tracking-editorial text-muted-foreground px-4 py-2.5">
                    Real
                  </th>
                  <th className="text-right font-heading text-xs uppercase tracking-editorial text-muted-foreground px-4 py-2.5 hidden sm:table-cell">
                    Dif.
                  </th>
                  <th className="text-right font-heading text-xs uppercase tracking-editorial text-muted-foreground px-4 py-2.5 w-24">
                    %
                  </th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="popLayout">
                  {rows.map((row, idx) => {
                    const isSub = row.isSubcategory;
                    const isParentWithChildren = row.hasChildren;
                    const isExpanded = expandedCats.has(row.categoria.id);
                    // In edit mode, only leaf rows are editable (subs, or parents w/o children)
                    const isEditable =
                      editMode && vistaPres === "mensual" && !isParentWithChildren;

                    return (
                      <motion.tr
                        key={`${row.categoria.id}-${isSub ? "sub" : "parent"}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ delay: idx * 0.02 }}
                        className={`border-b border-linea/50 transition-colors ${
                          isSub
                            ? "bg-superficie/20 hover:bg-superficie/40"
                            : "hover:bg-superficie/30"
                        } ${isParentWithChildren ? "cursor-pointer" : ""}`}
                        onClick={
                          isParentWithChildren
                            ? () => toggleExpanded(row.categoria.id)
                            : undefined
                        }
                      >
                        <td className={`py-3 ${isSub ? "pl-9 pr-4" : "px-4"}`}>
                          <div className="flex items-center gap-2">
                            {isParentWithChildren && (
                              <motion.div
                                animate={{ rotate: isExpanded ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                              >
                                <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
                              </motion.div>
                            )}
                            <span
                              className={`rounded-full shrink-0 ${isSub ? "size-1.5" : "size-2"}`}
                              style={{
                                backgroundColor:
                                  row.categoria.color || "#6B7280",
                              }}
                            />
                            <span
                              className={`font-body truncate max-w-[140px] sm:max-w-none ${
                                isSub
                                  ? "text-muted-foreground text-xs"
                                  : isParentWithChildren
                                    ? "text-foreground font-medium"
                                    : "text-foreground"
                              }`}
                            >
                              {row.categoria.nombre}
                            </span>
                            {isParentWithChildren && (
                              <span className="text-[10px] text-muted-foreground">
                                ({subCatsMap[row.categoria.id]?.length})
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isEditable ? (
                            <div className="flex items-center gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center h-8 rounded-md border border-input overflow-hidden shrink-0">
                                {(["UYU", "USD"] as const).map((m) => (
                                  <button
                                    key={m}
                                    type="button"
                                    onClick={() =>
                                      updateEditMoneda(row.categoria.id, mesPres, m)
                                    }
                                    className={`px-1.5 h-full text-[10px] font-medium transition-colors ${
                                      row.editMoneda === m
                                        ? "bg-bordo-800 text-white"
                                        : "text-muted-foreground hover:bg-superficie"
                                    }`}
                                  >
                                    {m}
                                  </button>
                                ))}
                              </div>
                              <Input
                                type="number"
                                min={0}
                                value={row.nuevoMonto}
                                onChange={(e) =>
                                  updateEditValue(
                                    row.categoria.id,
                                    mesPres,
                                    e.target.value
                                  )
                                }
                                className="w-24 text-right h-8 text-sm"
                              />
                            </div>
                          ) : (
                            <span
                              className={`font-body tabular-nums ${
                                isSub
                                  ? "text-muted-foreground text-xs"
                                  : isParentWithChildren
                                    ? "text-foreground font-medium"
                                    : "text-muted-foreground"
                              }`}
                            >
                              {formatMonto(row.presupuestado, row.moneda)}
                              {row.moneda === "USD" && !isParentWithChildren && (
                                <span className="text-[10px] text-muted-foreground ml-1">USD</span>
                              )}
                            </span>
                          )}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-body tabular-nums ${
                            isSub ? "text-muted-foreground text-xs" : "text-foreground"
                          }`}
                        >
                          {formatMonto(row.real, row.moneda)}
                        </td>
                        <td className="px-4 py-3 text-right hidden sm:table-cell">
                          <span
                            className={`font-body tabular-nums ${
                              isSub ? "text-xs " : ""
                            }${
                              row.diferencia >= 0
                                ? "text-emerald-600"
                                : "text-red-600"
                            }`}
                          >
                            {row.diferencia >= 0 ? "+" : ""}
                            {formatMonto(row.diferencia, row.moneda)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-end gap-1">
                            <span
                              className={`font-body tabular-nums text-muted-foreground ${
                                isSub ? "text-[10px]" : "text-xs"
                              }`}
                            >
                              {row.porcentaje}%
                            </span>
                            <ProgressBar
                              porcentaje={row.porcentaje}
                              tipo={tipo}
                            />
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
              <tfoot>
                <tr className="bg-superficie/50 font-medium">
                  <td className="px-4 py-3 font-heading text-xs uppercase tracking-editorial">
                    Total {tipo === "ingreso" ? "Ingresos" : "Egresos"}
                  </td>
                  <td className="px-4 py-3 text-right font-display text-sm tabular-nums">
                    {formatMonto(totals.presupuestado, monedaBase)}
                  </td>
                  <td className="px-4 py-3 text-right font-display text-sm tabular-nums">
                    {formatMonto(totals.real, monedaBase)}
                  </td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell">
                    <span
                      className={`font-display text-sm tabular-nums ${
                        diffTotal >= 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {diffTotal >= 0 ? "+" : ""}
                      {formatMonto(diffTotal, monedaBase)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-body text-sm tabular-nums text-muted-foreground">
                    {pctTotal}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  };

  // ── Render ──
  return (
    <div className="space-y-6 lg:space-y-8">
      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
            Flujo y Presupuesto {anio}
          </h1>
          <p className="mt-1 font-body text-sm text-muted-foreground">
            Presupuesto y flujo de caja integrados
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setAnio(anio - 1)}
            className="size-8"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="font-heading text-sm uppercase tracking-editorial min-w-[50px] text-center">
            {anio}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setAnio(anio + 1)}
            className="size-8"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </motion.div>

      {/* ── Currency & Exchange Rate Controls ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.4 }}
      >
        <Card className="border-linea border-dashed">
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6">
              {/* Display currency toggle */}
              <div className="flex items-center gap-2">
                <DollarSign className="size-4 text-muted-foreground" />
                <span className="font-body text-sm text-muted-foreground">
                  Moneda:
                </span>
                <div className="flex items-center gap-1">
                  {(["UYU", "USD", "ambas"] as MonedaDisplay[]).map((m) => (
                    <Button
                      key={m}
                      variant={monedaDisplay === m ? "default" : "outline"}
                      size="sm"
                      onClick={() => setMonedaDisplay(m)}
                      className={`h-7 text-xs px-2.5 ${
                        monedaDisplay === m
                          ? "bg-bordo-800 hover:bg-bordo-700 text-white"
                          : ""
                      }`}
                    >
                      {m === "ambas" ? "Ambas" : m}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Global exchange rate */}
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="size-4 text-muted-foreground" />
                <span className="font-body text-sm text-muted-foreground whitespace-nowrap">
                  TC USD/UYU:
                </span>
                <Input
                  type="number"
                  step="0.01"
                  min={1}
                  value={tipoCambioGlobal}
                  onChange={(e) =>
                    setTipoCambioGlobal(parseFloat(e.target.value) || 43.5)
                  }
                  className="w-20 h-7 text-sm text-right"
                />
              </div>

              {/* Per-month TC config */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTcOpen(true)}
                className="h-7 text-xs gap-1.5 text-muted-foreground"
              >
                <Settings2 className="size-3.5" />
                TC por mes
                {Object.keys(tiposCambioPorMes).length > 0 && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1 py-0 h-4"
                  >
                    {Object.keys(tiposCambioPorMes).length}
                  </Badge>
                )}
              </Button>

              {/* Saldos display */}
              {monedaDisplay === "ambas" && (
                <div className="flex items-center gap-3 ml-auto text-xs font-body text-muted-foreground">
                  <span>
                    Saldo UYU:{" "}
                    <span className="text-foreground font-medium tabular-nums">
                      {formatMonto(saldosPorMoneda["UYU"] || 0, "UYU")}
                    </span>
                  </span>
                  <span>
                    Saldo USD:{" "}
                    <span className="text-foreground font-medium tabular-nums">
                      {formatMonto(saldosPorMoneda["USD"] || 0, "USD")}
                    </span>
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Tabs ── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
      >
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as TabActiva)}
          className="w-full"
        >
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="presupuesto" className="gap-1.5">
              <Target className="size-3.5" />
              Presupuesto
            </TabsTrigger>
            <TabsTrigger value="flujo" className="gap-1.5">
              <Droplets className="size-3.5" />
              Flujo de Caja
            </TabsTrigger>
            <TabsTrigger value="proyeccion" className="gap-1.5">
              <Activity className="size-3.5" />
              Proyección
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </motion.div>

      {/* ════════════════════════════════════════════════════════════════════
          TAB: PRESUPUESTO
      ═══════════════════════════════════════════════════════════════════ */}
      {tab === "presupuesto" && (
        <motion.div
          key="presupuesto"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.4 }}
          className="space-y-6"
        >
          {/* Presupuesto controls */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-1">
                <Button
                  variant={vistaPres === "mensual" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setVistaPres("mensual")}
                  className={
                    vistaPres === "mensual"
                      ? "bg-bordo-800 hover:bg-bordo-700 text-white"
                      : ""
                  }
                >
                  Mensual
                </Button>
                <Button
                  variant={vistaPres === "anual" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setVistaPres("anual")}
                  className={
                    vistaPres === "anual"
                      ? "bg-bordo-800 hover:bg-bordo-700 text-white"
                      : ""
                  }
                >
                  Anual
                </Button>
              </div>

              {vistaPres === "mensual" && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={prevMesPres}
                    className="size-8"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="font-heading text-sm uppercase tracking-editorial min-w-[140px] text-center">
                    {nombreMes(mesPres)} {anio}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={nextMesPres}
                    className="size-8"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCopiarOpen(true)}
                className="gap-1.5"
              >
                <Copy className="size-3.5" />
                <span className="hidden sm:inline">Copiar de otro mes</span>
                <span className="sm:hidden">Copiar</span>
              </Button>
              {editMode ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditMode(false);
                      fetchData();
                    }}
                  >
                    <X className="size-3.5 mr-1" />
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSavePresupuesto}
                    disabled={saving}
                    className="bg-bordo-800 hover:bg-bordo-700 text-white gap-1.5"
                  >
                    <Save className="size-3.5" />
                    {saving ? "Guardando…" : "Guardar"}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setEditMode(true)}
                  className="bg-bordo-800 hover:bg-bordo-700 text-white gap-1.5"
                >
                  <Edit3 className="size-3.5" />
                  Editar
                </Button>
              )}
            </div>
          </div>

          {/* Summary cards */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4"
          >
            {[
              {
                label: "Resultado presupuestado",
                value: resultadoPresup,
                icon: Target,
                color: "text-blue-600",
                bg: "bg-blue-50",
              },
              {
                label: "Resultado real",
                value: resultadoReal,
                icon: BarChart3,
                color:
                  resultadoReal >= 0 ? "text-emerald-600" : "text-red-600",
                bg: resultadoReal >= 0 ? "bg-emerald-50" : "bg-red-50",
              },
              {
                label: "Desvío",
                value: resultadoReal - resultadoPresup,
                icon:
                  resultadoReal >= resultadoPresup ? TrendingUp : TrendingDown,
                color:
                  resultadoReal >= resultadoPresup
                    ? "text-emerald-600"
                    : "text-red-600",
                bg:
                  resultadoReal >= resultadoPresup
                    ? "bg-emerald-50"
                    : "bg-red-50",
              },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <motion.div
                  key={card.label}
                  variants={fadeInUp}
                  transition={springSmooth}
                >
                  <Card className="border-linea">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-body text-xs text-muted-foreground mb-1">
                            {card.label}
                          </p>
                          <p className="font-display text-xl sm:text-2xl uppercase tracking-tightest text-foreground">
                            {loading ? (
                              <span className="inline-block w-14 h-7 bg-superficie animate-pulse rounded" />
                            ) : (
                              <AnimatedCounter
                                value={card.value}
                                moneda={monedaBase}
                              />
                            )}
                          </p>
                        </div>
                        <div className={`p-1.5 rounded-lg ${card.bg}`}>
                          <Icon
                            className={`size-4 ${card.color}`}
                            strokeWidth={1.5}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Tables */}
          {loading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-64 bg-superficie animate-pulse rounded-lg"
                />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {renderPresupuestoTable(ingresoRows, "ingreso", ingTotals)}
              {renderPresupuestoTable(egresoRows, "egreso", egrTotals)}
            </div>
          )}

          {/* Chart: Presupuesto vs Real */}
          {!loading && chartPresupuesto.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              <Card className="border-linea">
                <CardHeader className="pb-2">
                  <CardTitle className="font-heading text-sm uppercase tracking-editorial flex items-center gap-2">
                    <BarChart3 className="size-4 text-muted-foreground" />
                    Comparativo presupuesto vs. real
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] sm:h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chartPresupuesto}
                        margin={{ top: 10, right: 10, left: 0, bottom: 40 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#e5e7eb"
                        />
                        <XAxis
                          dataKey="nombre"
                          tick={{ fontSize: 11, fill: "#6b7280" }}
                          angle={-45}
                          textAnchor="end"
                          height={60}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "#6b7280" }}
                          tickFormatter={(v) =>
                            `${monedaBase === "USD" ? "U$" : "$"}${(v / 1000).toFixed(0)}k`
                          }
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend
                          wrapperStyle={{
                            fontSize: 12,
                            fontFamily: "var(--font-body)",
                          }}
                        />
                        <Bar
                          dataKey="Presupuesto"
                          fill="#d1d5db"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={40}
                        />
                        <Bar
                          dataKey="Real"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={40}
                        >
                          {chartPresupuesto.map((entry, index) => (
                            <Cell
                              key={index}
                              fill={
                                entry.tipo === "ingreso"
                                  ? "#10b981"
                                  : "#ef4444"
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: FLUJO DE CAJA
      ═══════════════════════════════════════════════════════════════════ */}
      {tab === "flujo" && (
        <motion.div
          key="flujo"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.4 }}
          className="space-y-6"
        >
          {/* Summary Cards */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
          >
            {[
              {
                label: "Saldo Inicial",
                value: saldoInicialAnio,
                icon: Wallet,
                color: "text-bordo-700",
                bg: "bg-bordo-50",
              },
              {
                label: "Ingresos Totales",
                value: totalIngFlujo,
                icon: TrendingUp,
                color: "text-emerald-600",
                bg: "bg-emerald-50",
              },
              {
                label: "Egresos Totales",
                value: totalEgrFlujo,
                icon: TrendingDown,
                color: "text-red-600",
                bg: "bg-red-50",
              },
              {
                label: "Resultado Neto",
                value: netoAnualFlujo,
                icon: Droplets,
                color:
                  netoAnualFlujo >= 0 ? "text-emerald-600" : "text-red-600",
                bg: netoAnualFlujo >= 0 ? "bg-emerald-50" : "bg-red-50",
              },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <motion.div
                  key={card.label}
                  variants={fadeInUp}
                  transition={springSmooth}
                >
                  <Card className="border-linea h-full">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <p className="font-body text-[11px] sm:text-xs text-muted-foreground mb-1 truncate">
                            {card.label}
                          </p>
                          <p className="font-display text-lg sm:text-2xl uppercase tracking-tightest text-foreground">
                            {loading ? (
                              <span className="inline-block w-14 h-7 bg-superficie animate-pulse rounded" />
                            ) : (
                              <AnimatedCounter
                                value={card.value}
                                moneda={monedaBase}
                              />
                            )}
                          </p>
                        </div>
                        <div className={`p-1.5 rounded-lg ${card.bg} shrink-0`}>
                          <Icon
                            className={`size-4 ${card.color}`}
                            strokeWidth={1.5}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Waterfall Chart */}
          {!loading && waterfallData.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              <Card className="border-linea">
                <CardHeader className="pb-2">
                  <CardTitle className="font-heading text-sm uppercase tracking-editorial flex items-center gap-2">
                    <Droplets className="size-4 text-muted-foreground" />
                    Flujo de Caja — Cascada
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] sm:h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={waterfallData}
                        margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#e5e7eb"
                        />
                        <XAxis
                          dataKey="mes"
                          tick={{ fontSize: 11, fill: "#6b7280" }}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "#6b7280" }}
                          tickFormatter={(v) =>
                            `${monedaBase === "USD" ? "U$" : "$"}${(v / 1000).toFixed(0)}k`
                          }
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend
                          wrapperStyle={{
                            fontSize: 12,
                            fontFamily: "var(--font-body)",
                          }}
                        />
                        <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />
                        <Bar
                          dataKey="ingresos"
                          name="Ingresos"
                          stackId="flow"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={50}
                        >
                          {waterfallData.map((entry, index) => (
                            <Cell
                              key={`ing-${index}`}
                              fill={entry.esProyectado ? "#86efac" : "#10b981"}
                              fillOpacity={entry.esProyectado ? 0.6 : 1}
                            />
                          ))}
                        </Bar>
                        <Bar
                          dataKey="egresos"
                          name="Egresos"
                          stackId="flow"
                          radius={[0, 0, 4, 4]}
                          maxBarSize={50}
                        >
                          {waterfallData.map((entry, index) => (
                            <Cell
                              key={`egr-${index}`}
                              fill={entry.esProyectado ? "#fca5a5" : "#ef4444"}
                              fillOpacity={entry.esProyectado ? 0.6 : 1}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center justify-center gap-4 mt-2 text-xs font-body text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-sm bg-emerald-500" />{" "}
                      Real
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-sm bg-emerald-300 opacity-60" />{" "}
                      Proyectado
                    </span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Detail Table */}
          {!loading && flujo.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
            >
              <Card className="border-linea">
                <CardHeader className="pb-2">
                  <CardTitle className="font-heading text-sm uppercase tracking-editorial">
                    Detalle mensual
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-linea bg-superficie/50">
                          <th className="text-left font-heading text-xs uppercase tracking-editorial text-muted-foreground px-4 py-2.5">
                            Mes
                          </th>
                          {monedaDisplay === "ambas" && (
                            <th className="text-right font-heading text-xs uppercase tracking-editorial text-muted-foreground px-4 py-2.5 hidden lg:table-cell">
                              TC
                            </th>
                          )}
                          <th className="text-right font-heading text-xs uppercase tracking-editorial text-muted-foreground px-4 py-2.5 hidden sm:table-cell">
                            Saldo ini.
                          </th>
                          <th className="text-right font-heading text-xs uppercase tracking-editorial text-muted-foreground px-4 py-2.5">
                            Ingresos
                          </th>
                          <th className="text-right font-heading text-xs uppercase tracking-editorial text-muted-foreground px-4 py-2.5">
                            Egresos
                          </th>
                          <th className="text-right font-heading text-xs uppercase tracking-editorial text-muted-foreground px-4 py-2.5">
                            Neto
                          </th>
                          <th className="text-right font-heading text-xs uppercase tracking-editorial text-muted-foreground px-4 py-2.5">
                            Saldo
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {flujo.map((f, idx) => (
                          <motion.tr
                            key={f.mes}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.04 }}
                            className={`border-b border-linea/50 hover:bg-superficie/30 transition-colors cursor-pointer ${
                              mesSeleccionado === f.mes
                                ? "bg-bordo-50/50"
                                : ""
                            }`}
                            onClick={() => setMesSeleccionado(f.mes)}
                          >
                            <td className="px-4 py-3 font-body text-foreground">
                              <div className="flex items-center gap-1.5">
                                {nombreMes(f.mes)}
                                {f.esProyectado && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">
                                    Proy.
                                  </span>
                                )}
                              </div>
                            </td>
                            {monedaDisplay === "ambas" && (
                              <td className="px-4 py-3 text-right font-body tabular-nums text-xs text-muted-foreground hidden lg:table-cell">
                                {getTipoCambio(f.mes).toFixed(2)}
                              </td>
                            )}
                            <td className="px-4 py-3 text-right font-body tabular-nums text-muted-foreground hidden sm:table-cell">
                              {formatMonto(f.saldoInicial, monedaBase)}
                            </td>
                            <td className="px-4 py-3 text-right font-body tabular-nums text-emerald-600">
                              {formatMonto(f.ingresos, monedaBase)}
                            </td>
                            <td className="px-4 py-3 text-right font-body tabular-nums text-red-600">
                              {formatMonto(f.egresos, monedaBase)}
                            </td>
                            <td
                              className={`px-4 py-3 text-right font-body tabular-nums ${
                                f.neto >= 0
                                  ? "text-emerald-600"
                                  : "text-red-600"
                              }`}
                            >
                              {f.neto >= 0 ? "+" : ""}
                              {formatMonto(f.neto, monedaBase)}
                            </td>
                            <td className="px-4 py-3 text-right font-display text-sm tabular-nums tracking-tightest">
                              {formatMonto(f.saldoFinal, monedaBase)}
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Multi-currency detail (when "ambas" selected) */}
          {monedaDisplay === "ambas" && !loading && flujo.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45, duration: 0.5 }}
            >
              <Card className="border-linea border-dashed">
                <CardHeader className="pb-2">
                  <CardTitle className="font-heading text-sm uppercase tracking-editorial flex items-center gap-2">
                    <DollarSign className="size-4 text-muted-foreground" />
                    Desglose por moneda —{" "}
                    {nombreMes(mesSeleccionado)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const f = flujo.find((x) => x.mes === mesSeleccionado);
                    if (!f) return null;
                    return (
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <p className="font-heading text-xs uppercase tracking-editorial text-muted-foreground">
                            Pesos (UYU)
                          </p>
                          <div className="flex justify-between text-sm font-body">
                            <span className="text-muted-foreground">
                              Ingresos
                            </span>
                            <span className="tabular-nums text-emerald-600">
                              {formatMonto(f.ingresosUYU, "UYU")}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm font-body">
                            <span className="text-muted-foreground">
                              Egresos
                            </span>
                            <span className="tabular-nums text-red-600">
                              {formatMonto(f.egresosUYU, "UYU")}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm font-body font-medium border-t border-linea pt-1">
                            <span>Neto</span>
                            <span
                              className={`tabular-nums ${
                                f.ingresosUYU - f.egresosUYU >= 0
                                  ? "text-emerald-600"
                                  : "text-red-600"
                              }`}
                            >
                              {formatMonto(
                                f.ingresosUYU - f.egresosUYU,
                                "UYU"
                              )}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="font-heading text-xs uppercase tracking-editorial text-muted-foreground">
                            Dólares (USD)
                          </p>
                          <div className="flex justify-between text-sm font-body">
                            <span className="text-muted-foreground">
                              Ingresos
                            </span>
                            <span className="tabular-nums text-emerald-600">
                              {formatMonto(f.ingresosUSD, "USD")}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm font-body">
                            <span className="text-muted-foreground">
                              Egresos
                            </span>
                            <span className="tabular-nums text-red-600">
                              {formatMonto(f.egresosUSD, "USD")}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm font-body font-medium border-t border-linea pt-1">
                            <span>Neto</span>
                            <span
                              className={`tabular-nums ${
                                f.ingresosUSD - f.egresosUSD >= 0
                                  ? "text-emerald-600"
                                  : "text-red-600"
                              }`}
                            >
                              {formatMonto(
                                f.ingresosUSD - f.egresosUSD,
                                "USD"
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Distribution Charts */}
          {!loading &&
            (distMes.ingresos.length > 0 || distMes.egresos.length > 0) && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="grid md:grid-cols-2 gap-4 lg:gap-6"
              >
                {distMes.ingresos.length > 0 && (
                  <Card className="border-linea">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="font-heading text-sm uppercase tracking-editorial flex items-center gap-2">
                          <TrendingUp className="size-4 text-emerald-600" />
                          Distribución Ingresos
                        </CardTitle>
                        <Select
                          value={mesSeleccionado.toString()}
                          onValueChange={(v) =>
                            v && setMesSeleccionado(parseInt(v))
                          }
                        >
                          <SelectTrigger className="w-[110px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 12 }, (_, i) => (
                              <SelectItem
                                key={i + 1}
                                value={(i + 1).toString()}
                              >
                                {nombreMes(i + 1)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[220px] sm:h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={distMes.ingresos}
                              dataKey="monto"
                              nameKey="nombre"
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={90}
                              label={renderPieLabel}
                              labelLine={false}
                              animationBegin={200}
                              animationDuration={800}
                            >
                              {distMes.ingresos.map((entry, index) => (
                                <PieCell key={index} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value) =>
                                formatMonto(Number(value), monedaBase)
                              }
                              contentStyle={{
                                fontSize: 12,
                                borderRadius: 8,
                                border: "1px solid #e5e7eb",
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-1.5 mt-2">
                        {distMes.ingresos.map((item) => (
                          <div
                            key={item.nombre}
                            className="flex items-center justify-between text-xs font-body"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="size-2 rounded-full shrink-0"
                                style={{ backgroundColor: item.color }}
                              />
                              <span className="truncate text-muted-foreground">
                                {item.nombre}
                              </span>
                            </div>
                            <span className="tabular-nums text-foreground shrink-0 ml-2">
                              {formatMonto(item.monto, monedaBase)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {distMes.egresos.length > 0 && (
                  <Card className="border-linea">
                    <CardHeader className="pb-2">
                      <CardTitle className="font-heading text-sm uppercase tracking-editorial flex items-center gap-2">
                        <TrendingDown className="size-4 text-red-600" />
                        Distribución Egresos
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[220px] sm:h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={distMes.egresos}
                              dataKey="monto"
                              nameKey="nombre"
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={90}
                              label={renderPieLabel}
                              labelLine={false}
                              animationBegin={400}
                              animationDuration={800}
                            >
                              {distMes.egresos.map((entry, index) => (
                                <PieCell key={index} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              formatter={(value) =>
                                formatMonto(Number(value), monedaBase)
                              }
                              contentStyle={{
                                fontSize: 12,
                                borderRadius: 8,
                                border: "1px solid #e5e7eb",
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-1.5 mt-2">
                        {distMes.egresos.map((item) => (
                          <div
                            key={item.nombre}
                            className="flex items-center justify-between text-xs font-body"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="size-2 rounded-full shrink-0"
                                style={{ backgroundColor: item.color }}
                              />
                              <span className="truncate text-muted-foreground">
                                {item.nombre}
                              </span>
                            </div>
                            <span className="tabular-nums text-foreground shrink-0 ml-2">
                              {formatMonto(item.monto, monedaBase)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </motion.div>
            )}
        </motion.div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB: PROYECCIÓN
      ═══════════════════════════════════════════════════════════════════ */}
      {tab === "proyeccion" && (
        <motion.div
          key="proyeccion"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.4 }}
          className="space-y-6"
        >
          {/* Currency Toggle + Scenario Controls */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.02, duration: 0.3 }}
            className="flex justify-end"
          >
            <div className="inline-flex items-center gap-1 bg-superficie border border-linea rounded-lg p-1">
              {(["UYU", "USD"] as const).map((mon) => (
                <button
                  key={mon}
                  onClick={() => setMonedaProyeccion(mon)}
                  className={`px-3 py-1.5 text-xs font-heading uppercase tracking-editorial rounded-md transition-all duration-200 ${
                    monedaProyeccion === mon
                      ? "bg-bordo-800 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-superficie"
                  }`}
                >
                  {mon === "UYU" ? "$ UYU" : "U$ USD"}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Scenario Controls */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.4 }}
          >
            <Card className="border-linea">
              <CardHeader
                className="pb-0 cursor-pointer"
                onClick={() => setEscenarioOpen(!escenarioOpen)}
              >
                <CardTitle className="font-heading text-sm uppercase tracking-editorial flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Settings2 className="size-4 text-muted-foreground" />
                    Ajustes de escenario
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 border-emerald-200 bg-emerald-50 text-emerald-700"
                    >
                      Ingresos ±{ajusteIngresos}%
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 border-red-200 bg-red-50 text-red-700"
                    >
                      Egresos ±{ajusteEgresos}%
                    </Badge>
                    <motion.div
                      animate={{ rotate: escenarioOpen ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronDown className="size-4 text-muted-foreground" />
                    </motion.div>
                  </div>
                </CardTitle>
              </CardHeader>
              <AnimatePresence>
                {escenarioOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <CardContent className="pt-4 pb-5">
                      <div className="grid sm:grid-cols-2 gap-6">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="font-body text-sm text-muted-foreground">
                              Margen ingresos
                            </Label>
                            <span className="font-display text-sm tabular-nums text-emerald-600">
                              ±{ajusteIngresos}%
                            </span>
                          </div>
                          <Slider
                            value={[ajusteIngresos]}
                            onValueChange={(v) =>
                              setAjusteIngresos(Array.isArray(v) ? v[0] : v)
                            }
                            min={0}
                            max={50}
                            step={1}
                          />
                          <p className="text-[11px] text-muted-foreground font-body">
                            Optimista: +{ajusteIngresos}% ingresos / Pesimista: -{ajusteIngresos}% ingresos
                          </p>
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="font-body text-sm text-muted-foreground">
                              Margen egresos
                            </Label>
                            <span className="font-display text-sm tabular-nums text-red-600">
                              ±{ajusteEgresos}%
                            </span>
                          </div>
                          <Slider
                            value={[ajusteEgresos]}
                            onValueChange={(v) =>
                              setAjusteEgresos(Array.isArray(v) ? v[0] : v)
                            }
                            min={0}
                            max={50}
                            step={1}
                          />
                          <p className="text-[11px] text-muted-foreground font-body">
                            Optimista: -{ajusteEgresos}% egresos / Pesimista: +{ajusteEgresos}% egresos
                          </p>
                        </div>
                      </div>
                      {/* Saldo inicial override */}
                      <div className="mt-5 pt-4 border-t border-linea/50">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <Wallet className="size-4 text-muted-foreground shrink-0" />
                            <Label className="font-body text-sm text-muted-foreground whitespace-nowrap">
                              Saldo inicial del año
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              value={saldoInicialManual ?? saldoInicialAuto}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === "") {
                                  setSaldoInicialManual(null);
                                } else {
                                  setSaldoInicialManual(parseFloat(v) || 0);
                                }
                              }}
                              className={`w-36 h-8 text-sm text-right ${
                                saldoInicialManual !== null
                                  ? "border-bordo-300 bg-bordo-50/30"
                                  : ""
                              }`}
                            />
                            <span className="text-xs text-muted-foreground font-body">
                              {monedaProyeccion}
                            </span>
                            {saldoInicialManual !== null && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                onClick={() => setSaldoInicialManual(null)}
                                title="Volver al cálculo automático"
                              >
                                <X className="size-3.5" />
                              </Button>
                            )}
                          </div>
                          {saldoInicialManual !== null ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 border-bordo-200 bg-bordo-50 text-bordo-700"
                            >
                              Manual
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0"
                            >
                              Auto
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-end mt-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setAjusteIngresos(10);
                            setAjusteEgresos(10);
                            setSaldoInicialManual(null);
                          }}
                          className="h-7 text-xs gap-1.5 text-muted-foreground"
                        >
                          <RotateCcw className="size-3" />
                          Restaurar defaults
                        </Button>
                      </div>
                    </CardContent>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          </motion.div>

          {/* Summary Cards */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4"
          >
            {[
              {
                label: "Saldo proyectado (fin de año)",
                value: proySaldoFinalBase,
                icon: Activity,
                color: "text-bordo-700",
                bg: "bg-bordo-50",
              },
              {
                label: "Resultado neto proyectado",
                value: proyNetoAnual,
                icon: proyNetoAnual >= 0 ? TrendingUp : TrendingDown,
                color:
                  proyNetoAnual >= 0 ? "text-emerald-600" : "text-red-600",
                bg: proyNetoAnual >= 0 ? "bg-emerald-50" : "bg-red-50",
              },
              {
                label: "Rango fin de año",
                value: proySaldoFinalBase,
                icon: Target,
                color: "text-blue-600",
                bg: "bg-blue-50",
                isRange: true,
              },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <motion.div
                  key={card.label}
                  variants={fadeInUp}
                  transition={springSmooth}
                >
                  <Card className="border-linea h-full">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <p className="font-body text-[11px] sm:text-xs text-muted-foreground mb-1">
                            {card.label}
                          </p>
                          {"isRange" in card && card.isRange ? (
                            <div>
                              <p className="font-display text-lg sm:text-xl uppercase tracking-tightest text-foreground">
                                {loading ? (
                                  <span className="inline-block w-14 h-7 bg-superficie animate-pulse rounded" />
                                ) : (
                                  <>
                                    <span className="text-red-600">
                                      <AnimatedCounter
                                        value={proySaldoFinalPes}
                                        moneda={monedaProyeccion}
                                      />
                                    </span>
                                    <span className="text-muted-foreground mx-1 text-sm">
                                      →
                                    </span>
                                    <span className="text-emerald-600">
                                      <AnimatedCounter
                                        value={proySaldoFinalOpt}
                                        moneda={monedaProyeccion}
                                      />
                                    </span>
                                  </>
                                )}
                              </p>
                            </div>
                          ) : (
                            <p className="font-display text-xl sm:text-2xl uppercase tracking-tightest text-foreground">
                              {loading ? (
                                <span className="inline-block w-14 h-7 bg-superficie animate-pulse rounded" />
                              ) : (
                                <AnimatedCounter
                                  value={card.value}
                                  moneda={monedaProyeccion}
                                />
                              )}
                            </p>
                          )}
                        </div>
                        <div className={`p-1.5 rounded-lg ${card.bg} shrink-0`}>
                          <Icon
                            className={`size-4 ${card.color}`}
                            strokeWidth={1.5}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Projection Chart */}
          {!loading && proyChartData.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              <Card className="border-linea">
                <CardHeader className="pb-2">
                  <CardTitle className="font-heading text-sm uppercase tracking-editorial flex items-center gap-2">
                    <Activity className="size-4 text-muted-foreground" />
                    Evolución del saldo proyectado
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px] sm:h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={proyChartData}
                        margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
                      >
                        <defs>
                          <linearGradient
                            id="gradOptimista"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#10b981"
                              stopOpacity={0.15}
                            />
                            <stop
                              offset="100%"
                              stopColor="#10b981"
                              stopOpacity={0.02}
                            />
                          </linearGradient>
                          <linearGradient
                            id="gradPesimista"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#ef4444"
                              stopOpacity={0.02}
                            />
                            <stop
                              offset="100%"
                              stopColor="#ef4444"
                              stopOpacity={0.15}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#e5e7eb"
                        />
                        <XAxis
                          dataKey="mes"
                          tick={{ fontSize: 11, fill: "#6b7280" }}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "#6b7280" }}
                          tickFormatter={(v) =>
                            `${monedaProyeccion === "USD" ? "U$" : "$"}${(v / 1000).toFixed(0)}k`
                          }
                        />
                        <Tooltip content={<ProyeccionTooltip />} />
                        <ReferenceLine
                          x={nombreMes(mesActualServer).slice(0, 3)}
                          stroke="#730d32"
                          strokeDasharray="4 4"
                          strokeWidth={1.5}
                          label={{
                            value: "Hoy",
                            position: "top",
                            fontSize: 10,
                            fill: "#730d32",
                            fontWeight: 600,
                          }}
                        />
                        {/* Optimistic area */}
                        <Area
                          type="monotone"
                          dataKey="saldoOptimista"
                          fill="url(#gradOptimista)"
                          stroke="#10b981"
                          strokeWidth={1}
                          strokeDasharray="4 3"
                          strokeOpacity={0.5}
                          fillOpacity={1}
                          name="Optimista"
                          animationDuration={1200}
                        />
                        {/* Pessimistic area */}
                        <Area
                          type="monotone"
                          dataKey="saldoPesimista"
                          fill="url(#gradPesimista)"
                          stroke="#ef4444"
                          strokeWidth={1}
                          strokeDasharray="4 3"
                          strokeOpacity={0.5}
                          fillOpacity={1}
                          name="Pesimista"
                          animationDuration={1200}
                        />
                        {/* Base line */}
                        <Line
                          type="monotone"
                          dataKey="saldoBase"
                          stroke="#730d32"
                          strokeWidth={2.5}
                          dot={{ fill: "#730d32", r: 3 }}
                          activeDot={{ r: 5, fill: "#730d32" }}
                          name="Base"
                          animationDuration={1500}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center justify-center gap-4 mt-3 text-xs font-body text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="w-5 h-0.5 bg-bordo-800 rounded" /> Base
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-5 h-0.5 bg-emerald-500 rounded opacity-60" style={{ borderTop: "1px dashed #10b981" }} />{" "}
                      Optimista
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-5 h-0.5 bg-red-500 rounded opacity-60" style={{ borderTop: "1px dashed #ef4444" }} />{" "}
                      Pesimista
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 border border-dashed border-bordo-800 rounded-sm" />{" "}
                      Mes actual
                    </span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Projection Table */}
          {!loading && proyeccionData.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
            >
              <Card className="border-linea">
                <CardHeader className="pb-2">
                  <CardTitle className="font-heading text-sm uppercase tracking-editorial">
                    Detalle de proyección mensual
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-linea bg-superficie/50">
                          <th className="text-left font-heading text-xs uppercase tracking-editorial text-muted-foreground px-4 py-2.5">
                            Mes
                          </th>
                          <th className="text-right font-heading text-xs uppercase tracking-editorial text-muted-foreground px-4 py-2.5">
                            Ingresos
                          </th>
                          <th className="text-right font-heading text-xs uppercase tracking-editorial text-muted-foreground px-4 py-2.5">
                            Egresos
                          </th>
                          <th className="text-right font-heading text-xs uppercase tracking-editorial text-muted-foreground px-4 py-2.5 hidden sm:table-cell">
                            Neto
                          </th>
                          <th className="text-right font-heading text-xs uppercase tracking-editorial text-muted-foreground px-4 py-2.5 hidden lg:table-cell">
                            Real Neto
                          </th>
                          <th className="text-right font-heading text-xs uppercase tracking-editorial text-muted-foreground px-4 py-2.5">
                            Saldo
                          </th>
                          <th className="text-right font-heading text-xs uppercase tracking-editorial text-muted-foreground px-4 py-2.5 hidden md:table-cell">
                            Optimista
                          </th>
                          <th className="text-right font-heading text-xs uppercase tracking-editorial text-muted-foreground px-4 py-2.5 hidden md:table-cell">
                            Pesimista
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {proyeccionData.map((p, idx) => (
                          <motion.tr
                            key={p.mes}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.04 }}
                            className={`border-b border-linea/50 hover:bg-superficie/30 transition-colors ${
                              p.esProyectado
                                ? "border-l-2 border-l-amber-300 bg-amber-50/20"
                                : ""
                            }`}
                          >
                            <td className="px-4 py-3 font-body text-foreground">
                              <div className="flex items-center gap-1.5">
                                {nombreMes(p.mes)}
                                {p.esProyectado && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">
                                    Proy.
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-body tabular-nums text-emerald-600">
                              {formatMonto(p.ingresos, monedaProyeccion)}
                            </td>
                            <td className="px-4 py-3 text-right font-body tabular-nums text-red-600">
                              {formatMonto(p.egresos, monedaProyeccion)}
                            </td>
                            <td
                              className={`px-4 py-3 text-right font-body tabular-nums hidden sm:table-cell ${
                                p.neto >= 0
                                  ? "text-emerald-600"
                                  : "text-red-600"
                              }`}
                            >
                              {p.neto >= 0 ? "+" : ""}
                              {formatMonto(p.neto, monedaProyeccion)}
                            </td>
                            <td
                              className={`px-4 py-3 text-right font-body tabular-nums hidden lg:table-cell ${
                                !p.esProyectado
                                  ? p.realNeto >= 0
                                    ? "text-emerald-600"
                                    : "text-red-600"
                                  : "text-muted-foreground/50"
                              }`}
                            >
                              {p.esProyectado
                                ? <span className="text-muted-foreground/50">—</span>
                                : p.realIngresos === 0 && p.realEgresos === 0
                                  ? <span className="text-muted-foreground/50">—</span>
                                  : <>
                                      {p.realNeto >= 0 ? "+" : ""}
                                      {formatMonto(p.realNeto, monedaProyeccion)}
                                    </>
                              }
                            </td>
                            <td className="px-4 py-3 text-right font-display text-sm tabular-nums tracking-tightest">
                              {formatMonto(p.saldoBase, monedaProyeccion)}
                            </td>
                            <td className="px-4 py-3 text-right font-body tabular-nums text-emerald-600 hidden md:table-cell">
                              {formatMonto(p.saldoOptimista, monedaProyeccion)}
                            </td>
                            <td className="px-4 py-3 text-right font-body tabular-nums text-red-600 hidden md:table-cell">
                              {formatMonto(p.saldoPesimista, monedaProyeccion)}
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-superficie/50 font-medium">
                          <td className="px-4 py-3 font-heading text-xs uppercase tracking-editorial">
                            Total / Final
                          </td>
                          <td className="px-4 py-3 text-right font-display text-sm tabular-nums text-emerald-600">
                            {formatMonto(
                              proyeccionData.reduce(
                                (s, p) => s + p.ingresos,
                                0
                              ),
                              monedaProyeccion
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-display text-sm tabular-nums text-red-600">
                            {formatMonto(
                              proyeccionData.reduce(
                                (s, p) => s + p.egresos,
                                0
                              ),
                              monedaProyeccion
                            )}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-display text-sm tabular-nums hidden sm:table-cell ${
                              proyNetoAnual >= 0
                                ? "text-emerald-600"
                                : "text-red-600"
                            }`}
                          >
                            {proyNetoAnual >= 0 ? "+" : ""}
                            {formatMonto(proyNetoAnual, monedaProyeccion)}
                          </td>
                          <td className={`px-4 py-3 text-right font-display text-sm tabular-nums hidden lg:table-cell ${
                            proyeccionData.reduce((s, p) => s + p.realNeto, 0) >= 0
                              ? "text-emerald-600"
                              : "text-red-600"
                          }`}>
                            {formatMonto(
                              proyeccionData.reduce(
                                (s, p) => s + p.realNeto,
                                0
                              ),
                              monedaProyeccion
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-display text-sm tabular-nums tracking-tightest">
                            {formatMonto(proySaldoFinalBase, monedaProyeccion)}
                          </td>
                          <td className="px-4 py-3 text-right font-display text-sm tabular-nums text-emerald-600 hidden md:table-cell">
                            {formatMonto(proySaldoFinalOpt, monedaProyeccion)}
                          </td>
                          <td className="px-4 py-3 text-right font-display text-sm tabular-nums text-red-600 hidden md:table-cell">
                            {formatMonto(proySaldoFinalPes, monedaProyeccion)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Export PDF Button */}
          {!loading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.4 }}
              className="flex justify-end"
            >
              <Button
                onClick={handleExportProyeccionPDF}
                disabled={generatingPDF}
                className="bg-bordo-800 hover:bg-bordo-700 text-white gap-2"
              >
                {generatingPDF ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                {generatingPDF ? "Generando…" : "Exportar PDF"}
              </Button>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          DIALOGS
      ═══════════════════════════════════════════════════════════════════ */}

      {/* Copy presupuesto dialog */}
      <Dialog open={copiarOpen} onOpenChange={setCopiarOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-editorial">
              Copiar presupuesto
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="font-body text-sm">Desde</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <Select
                  value={copiarOrigenMes.toString()}
                  onValueChange={(v) =>
                    v && setCopiarOrigenMes(parseInt(v))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => (
                      <SelectItem key={i + 1} value={(i + 1).toString()}>
                        {nombreMes(i + 1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  value={copiarOrigenAnio}
                  onChange={(e) =>
                    setCopiarOrigenAnio(parseInt(e.target.value) || anio)
                  }
                />
              </div>
            </div>
            <div>
              <Label className="font-body text-sm">Hacia</Label>
              <p className="font-body text-sm text-muted-foreground mt-1">
                {nombreMes(mesPres)} {anio}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopiarOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCopiar}
              disabled={saving}
              className="bg-bordo-800 hover:bg-bordo-700 text-white"
            >
              {saving ? "Copiando…" : "Copiar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exchange rate per-month dialog */}
      <Dialog open={tcOpen} onOpenChange={setTcOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-editorial">
              Tipo de cambio por mes
            </DialogTitle>
          </DialogHeader>
          <p className="font-body text-sm text-muted-foreground">
            Definí un tipo de cambio específico para cada mes. Los meses sin
            valor usan el TC global ({tipoCambioGlobal}).
          </p>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {Array.from({ length: 12 }, (_, i) => {
              const mes = i + 1;
              const valor = tiposCambioPorMes[mes];
              return (
                <div
                  key={mes}
                  className="flex items-center gap-3 text-sm font-body"
                >
                  <span className="w-24 text-muted-foreground">
                    {nombreMes(mes)}
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    min={1}
                    placeholder={tipoCambioGlobal.toString()}
                    value={valor ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTiposCambioPorMes((prev) => {
                        const next = { ...prev };
                        if (v === "" || isNaN(parseFloat(v))) {
                          delete next[mes];
                        } else {
                          next[mes] = parseFloat(v);
                        }
                        return next;
                      });
                    }}
                    className="w-24 h-8 text-right text-sm"
                  />
                  <span className="text-xs text-muted-foreground">
                    USD/UYU
                  </span>
                  {valor !== undefined && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      onClick={() =>
                        setTiposCambioPorMes((prev) => {
                          const next = { ...prev };
                          delete next[mes];
                          return next;
                        })
                      }
                    >
                      <X className="size-3" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTcOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
