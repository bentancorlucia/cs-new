"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarRange,
  CheckCircle2,
  DollarSign,
  FilePen,
  ListTree,
  Lock,
  NotebookPen,
  Scale,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatFecha, formatImporte, NOMBRE_MES } from "@/lib/contabilidad/formato";
import type { EjercicioResumen, ResultadoMes } from "@/lib/contabilidad/reportes";
import { easeSmooth, fadeInUp, springBouncy, springSmooth, staggerContainer, staggerContainerFast } from "@/lib/motion";
import { EnteroAnimado, ImporteAnimado } from "./importe-animado";

interface PeriodoChip {
  id: string;
  mes: number;
  anio: number;
  estado: "abierto" | "cerrado";
  fecha_inicio: string;
  fecha_fin: string;
}

const ACCESOS = [
  { href: "/contabilidad/asientos", label: "Libro diario", desc: "Asientos y borradores", icon: NotebookPen },
  { href: "/contabilidad/mayor", label: "Libro mayor", desc: "Movimientos por cuenta", icon: BookOpen },
  { href: "/contabilidad/balance", label: "Balances", desc: "Sumas y saldos, situación, resultados", icon: Scale },
  { href: "/contabilidad/plan-de-cuentas", label: "Plan de cuentas", desc: "Rubros y cuentas imputables", icon: ListTree },
  { href: "/contabilidad/ejercicios", label: "Ejercicios", desc: "Períodos, cierres y aperturas", icon: CalendarRange },
  { href: "/contabilidad/cotizaciones", label: "Cotizaciones", desc: "Dólar BCU y manuales", icon: DollarSign },
];

function compacto(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toLocaleString("es-UY", { maximumFractionDigits: 1 })} M`;
  if (a >= 1_000) return `${(v / 1_000).toLocaleString("es-UY", { maximumFractionDigits: 0 })} k`;
  return v.toLocaleString("es-UY", { maximumFractionDigits: 0 });
}

export function ResumenCliente({
  hoy,
  hasta,
  ejercicio,
  periodos,
  disponibilidades,
  resultado,
  borradores,
  confirmados,
  cotizacion,
  evolucion,
}: {
  hoy: string;
  hasta: string;
  ejercicio: EjercicioResumen;
  periodos: PeriodoChip[];
  disponibilidades: number;
  resultado: { ingresos: number; egresos: number; resultado: number };
  borradores: number;
  confirmados: number;
  cotizacion: { fecha: string; tasa: number; fuente: string; dias: number } | null;
  evolucion: ResultadoMes[];
}) {
  const superavit = resultado.resultado >= 0;
  const cotizacionVieja = !cotizacion || cotizacion.dias > 4;
  const cerrados = periodos.filter((p) => p.estado === "cerrado").length;
  const datosGrafico = evolucion.map((m) => ({
    mes: NOMBRE_MES[Number(m.mes.slice(5, 7)) - 1]?.slice(0, 3) ?? m.mes,
    Recursos: m.ingresos,
    Gastos: m.egresos,
    Resultado: m.resultado,
  }));
  const hayMovimientos = evolucion.some((m) => m.ingresos !== 0 || m.egresos !== 0);

  return (
    <div className="space-y-6">
      {/* Ejercicio + períodos */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={easeSmooth}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-bordo-800 to-bordo-950 p-5 text-white sm:p-6"
      >
        <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-dorado-300/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-editorial text-dorado-200 font-heading">Ejercicio actual</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="font-display text-4xl tracking-tightest">{ejercicio.nombre}</span>
              {ejercicio.estado === "cerrado" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-heading">
                  <Lock className="size-3" /> Cerrado
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-white/70">
              {formatFecha(ejercicio.fecha_inicio)} al {formatFecha(ejercicio.fecha_fin)} · datos al {formatFecha(hasta)}
            </div>
          </div>
          <div className="text-xs text-white/80">
            <EnteroAnimado valor={confirmados} className="font-heading text-lg text-white" /> asientos confirmados ·{" "}
            <span className="font-heading text-white">{cerrados}</span>/{periodos.length || 12} períodos cerrados
          </div>
        </div>

        <motion.div
          variants={staggerContainerFast}
          initial="hidden"
          animate="visible"
          className="relative mt-5 grid grid-cols-6 gap-1.5 sm:grid-cols-12"
        >
          {periodos.map((p) => {
            const actual = p.fecha_inicio <= hoy && hoy <= p.fecha_fin;
            const cerrado = p.estado === "cerrado";
            return (
              <motion.div
                key={p.id}
                variants={fadeInUp}
                transition={springSmooth}
                title={`${NOMBRE_MES[p.mes - 1]} ${p.anio}: ${cerrado ? "cerrado" : "abierto"}`}
                className={`relative flex flex-col items-center rounded-lg px-1 py-2 text-[11px] font-heading ${
                  cerrado ? "bg-white/90 text-bordo-900" : "bg-white/10 text-white"
                } ${actual ? "ring-2 ring-dorado-300" : ""}`}
              >
                <span>{NOMBRE_MES[p.mes - 1]?.slice(0, 3)}</span>
                <span className="mt-0.5 flex h-3 items-center">
                  {cerrado ? <Lock className="size-2.5" /> : <span className="size-1.5 rounded-full bg-emerald-300" />}
                </span>
                {actual && (
                  <motion.span
                    layoutId="periodo-actual"
                    className="absolute -bottom-1 h-1 w-4 rounded-full bg-dorado-300"
                    transition={springSmooth}
                  />
                )}
              </motion.div>
            );
          })}
        </motion.div>
      </motion.section>

      {/* KPIs */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"
      >
        <Kpi
          titulo="Disponibilidades"
          icono={Wallet}
          href={`/contabilidad/balance?tab=situacion&ejercicio=${ejercicio.id}`}
          valor={<ImporteAnimado valor={disponibilidades} moneda="UYU" />}
          sub="Cajas y bancos, en pesos (USD al TC contable)"
          negativo={disponibilidades < 0}
        />
        <Kpi
          titulo={superavit ? "Superávit del ejercicio" : "Déficit del ejercicio"}
          icono={superavit ? TrendingUp : TrendingDown}
          href={`/contabilidad/balance?tab=resultados&ejercicio=${ejercicio.id}`}
          valor={<ImporteAnimado valor={resultado.resultado} moneda="UYU" />}
          sub={`Recursos ${formatImporte(resultado.ingresos)} − gastos ${formatImporte(resultado.egresos)}`}
          tono={superavit ? "exito" : "alerta"}
        />
        <Kpi
          titulo="Asientos en borrador"
          icono={FilePen}
          href="/contabilidad/asientos"
          valor={<EnteroAnimado valor={borradores} />}
          sub={borradores > 0 ? "Pendientes de confirmar: no suman en los reportes" : "Todo confirmado"}
          tono={borradores > 0 ? "aviso" : undefined}
        />
        <Kpi
          titulo="Dólar (última cotización)"
          icono={DollarSign}
          href="/contabilidad/cotizaciones"
          valor={
            cotizacion ? (
              <ImporteAnimado valor={cotizacion.tasa} moneda="UYU" />
            ) : (
              <span className="text-muted-foreground">Sin datos</span>
            )
          }
          sub={
            cotizacion ? (
              <span className={`inline-flex items-center gap-1 ${cotizacionVieja ? "text-amber-800" : ""}`}>
                {cotizacionVieja ? <AlertTriangle className="size-3" /> : <CheckCircle2 className="size-3 text-emerald-600" />}
                {formatFecha(cotizacion.fecha)} · {cotizacion.fuente === "bcu" ? "BCU" : "manual"}
                {cotizacionVieja && ` · hace ${cotizacion.dias} días`}
              </span>
            ) : (
              "Cargá la cotización para las cuentas en dólares"
            )
          }
          tono={cotizacionVieja ? "aviso" : undefined}
        />
      </motion.div>

      {/* Gráfico */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={easeSmooth}
        className="rounded-2xl border border-linea bg-white p-4 shadow-card sm:p-5"
      >
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="font-heading text-base text-bordo-900">Recursos y gastos por mes</h2>
          <span className="text-[11px] text-muted-foreground">Sin asientos de cierre · en pesos</span>
        </div>
        {hayMovimientos ? (
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={datosGrafico} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe5" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={compacto} tickLine={false} axisLine={false} width={48} />
                <Tooltip
                  formatter={((v: number) => formatImporte(Number(v), "UYU")) as never}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e8e4de", fontSize: 12 }}
                  cursor={{ fill: "#fdf2f5" }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Recursos" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={28} animationDuration={900} />
                <Bar dataKey="Gastos" fill="#f43f5e" radius={[6, 6, 0, 0]} maxBarSize={28} animationDuration={900} />
                <Line
                  type="monotone"
                  dataKey="Resultado"
                  stroke="#730d32"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#730d32" }}
                  animationDuration={1200}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-48 flex-col items-center justify-center text-center text-sm text-muted-foreground">
            <Scale className="mb-2 size-8 text-bordo-200" strokeWidth={1.5} />
            Todavía no hay recursos ni gastos confirmados en el ejercicio.
          </div>
        )}
      </motion.section>

      {/* Accesos */}
      <div>
        <h2 className="mb-3 font-heading text-lg text-bordo-900">Secciones</h2>
        <motion.div
          variants={staggerContainerFast}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-40px" }}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {ACCESOS.map(({ href, label, desc, icon: Icon }) => (
            <motion.div key={href} variants={fadeInUp} transition={easeSmooth} whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}>
              <Link
                href={href}
                className="group block rounded-2xl border border-linea bg-white p-4 transition-all hover:border-bordo-200 hover:shadow-card-hover"
              >
                <div className="flex items-center justify-between">
                  <div className="flex size-9 items-center justify-center rounded-full bg-bordo-50 text-bordo-700 transition-colors group-hover:bg-bordo-800 group-hover:text-white">
                    <Icon className="size-4" strokeWidth={1.5} />
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-bordo-700" />
                </div>
                <div className="mt-3 font-heading text-base text-foreground">{label}</div>
                <div className="text-xs text-muted-foreground">{desc}</div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

function Kpi({
  titulo,
  icono: Icono,
  valor,
  sub,
  href,
  tono,
  negativo,
}: {
  titulo: string;
  icono: typeof Wallet;
  valor: React.ReactNode;
  sub: React.ReactNode;
  href: string;
  tono?: "exito" | "alerta" | "aviso";
  negativo?: boolean;
}) {
  const estilos =
    tono === "exito"
      ? "border-emerald-200 bg-emerald-50/40"
      : tono === "alerta"
        ? "border-rose-200 bg-rose-50/50"
        : tono === "aviso"
          ? "border-amber-200 bg-amber-50/50"
          : "border-linea bg-white";
  const colorValor =
    negativo || tono === "alerta" ? "text-rose-700" : tono === "exito" ? "text-emerald-700" : "text-bordo-950";
  return (
    <motion.div variants={fadeInUp} transition={easeSmooth} whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }}>
      <Link href={href} className={`group block h-full rounded-2xl border p-5 shadow-card transition-shadow hover:shadow-card-hover ${estilos}`}>
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-editorial text-muted-foreground font-heading">{titulo}</span>
          <motion.span
            whileHover={{ rotate: -8, scale: 1.1 }}
            transition={springBouncy}
            className="flex size-8 items-center justify-center rounded-full bg-bordo-50 text-bordo-700"
          >
            <Icono className="size-4" strokeWidth={1.5} />
          </motion.span>
        </div>
        <div className={`mt-2 font-display text-2xl tracking-tight ${colorValor}`}>{valor}</div>
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      </Link>
    </motion.div>
  );
}
