"use client";

import { motion } from "framer-motion";
import { Waves } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth } from "@/lib/motion";

export function compacto(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toLocaleString("es-UY", { maximumFractionDigits: 1 })} M`;
  if (a >= 1_000) return `${(v / 1_000).toLocaleString("es-UY", { maximumFractionDigits: 0 })} k`;
  return v.toLocaleString("es-UY", { maximumFractionDigits: 0 });
}

const TOOLTIP = {
  formatter: ((v: number | null) => (v === null || v === undefined ? "—" : formatImporte(Number(v), "UYU"))) as never,
  contentStyle: { borderRadius: 12, border: "1px solid #e8e4de", fontSize: 12 },
};

function Tarjeta({ titulo, nota, children }: { titulo: string; nota: string; children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={easeSmooth}
      className="reporte-tarjeta rounded-2xl border border-linea bg-white p-4 shadow-card sm:p-5 print:hidden"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-heading text-base text-bordo-900">{titulo}</h2>
        <span className="text-[11px] text-muted-foreground">{nota}</span>
      </div>
      {children}
    </motion.section>
  );
}

function SinDatos({ texto }: { texto: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center text-center text-sm text-muted-foreground">
      <Waves className="mb-2 size-8 text-bordo-200" strokeWidth={1.5} />
      {texto}
    </div>
  );
}

/** Barras de ingresos y egresos por mes + línea del saldo a fin de mes (eje derecho). */
export function GraficoFlujoReal({
  datos,
}: {
  datos: { mes: string; ingresos: number; egresos: number; saldo: number }[];
}) {
  const hay = datos.some((d) => d.ingresos !== 0 || d.egresos !== 0);
  return (
    <Tarjeta titulo="Ingresos, egresos y saldo" nota="En pesos · saldo al cierre de cada mes">
      {hay || datos.some((d) => d.saldo !== 0) ? (
        <div className="h-64 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={datos.map((d) => ({ mes: d.mes, Ingresos: d.ingresos, Egresos: d.egresos, Saldo: d.saldo }))}
              margin={{ top: 4, right: 0, bottom: 0, left: -8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe5" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="flujo" tick={{ fontSize: 11 }} tickFormatter={compacto} tickLine={false} axisLine={false} width={48} />
              <YAxis
                yAxisId="saldo"
                orientation="right"
                tick={{ fontSize: 11, fill: "#730d32" }}
                tickFormatter={compacto}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <Tooltip {...TOOLTIP} cursor={{ fill: "#fdf2f5" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="flujo" dataKey="Ingresos" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={28} animationDuration={900} />
              <Bar yAxisId="flujo" dataKey="Egresos" fill="#f43f5e" radius={[6, 6, 0, 0]} maxBarSize={28} animationDuration={900} />
              <Line
                yAxisId="saldo"
                type="monotone"
                dataKey="Saldo"
                stroke="#730d32"
                strokeWidth={2}
                dot={{ r: 3, fill: "#730d32" }}
                animationDuration={1200}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <SinDatos texto="No hubo movimientos de fondos en el período." />
      )}
    </Tarjeta>
  );
}

/** Saldo real a fin de mes (línea llena) y proyectado (punteada), con la línea del cero. */
export function GraficoProyeccion({
  datos,
}: {
  datos: { mes: string; real: number | null; proyectado: number | null }[];
}) {
  const valores = datos.flatMap((d) => [d.real, d.proyectado]).filter((v): v is number => v !== null);
  const hayNegativo = valores.some((v) => v < 0);
  return (
    <Tarjeta titulo="Saldo de disponibilidades" nota="Real a fin de cada mes y proyectado">
      {valores.length > 0 ? (
        <div className="h-64 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={datos.map((d) => ({ mes: d.mes, Real: d.real, Proyectado: d.proyectado }))}
              margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe5" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={compacto} tickLine={false} axisLine={false} width={48} />
              <Tooltip {...TOOLTIP} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {hayNegativo && <ReferenceLine y={0} stroke="#e11d48" strokeDasharray="4 4" />}
              <Line
                type="monotone"
                dataKey="Real"
                stroke="#730d32"
                strokeWidth={2.5}
                dot={{ r: 3, fill: "#730d32" }}
                connectNulls={false}
                animationDuration={1000}
              />
              <Line
                type="monotone"
                dataKey="Proyectado"
                stroke="#e8900a"
                strokeWidth={2.5}
                strokeDasharray="6 4"
                dot={{ r: 3, fill: "#e8900a" }}
                connectNulls={false}
                animationDuration={1400}
                animationBegin={300}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <SinDatos texto="Todavía no hay saldos para graficar." />
      )}
    </Tarjeta>
  );
}
