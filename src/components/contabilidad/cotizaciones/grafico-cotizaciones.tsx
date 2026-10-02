"use client";

import { useId } from "react";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatFecha } from "@/lib/contabilidad/formato";
import { easeSmooth } from "@/lib/motion";
import type { CotizacionVista } from "./cotizaciones-cliente";

const BORDO = "#730d32";
const DORADO = "#f7b643";

export function formatTasa(n: number): string {
  return new Intl.NumberFormat("es-UY", { minimumFractionDigits: 3, maximumFractionDigits: 6 }).format(n);
}

type Punto = CotizacionVista & { etiqueta: string };

function PuntoManual(props: { cx?: number; cy?: number; payload?: Punto; index?: number }) {
  const { cx, cy, payload, index } = props;
  if (payload?.fuente !== "manual" || cx === undefined || cy === undefined) {
    return <g key={`p-${index}`} />;
  }
  return (
    <circle key={`p-${index}`} cx={cx} cy={cy} r={4} fill={DORADO} stroke="#fff" strokeWidth={1.5} />
  );
}

/** Evolución del dólar (ascendente). Los puntos dorados son cotizaciones manuales. */
export function GraficoCotizaciones({ cotizaciones }: { cotizaciones: CotizacionVista[] }) {
  const id = useId().replace(/:/g, "");
  const datos: Punto[] = [...cotizaciones]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((c) => ({ ...c, etiqueta: formatFecha(c.fecha).slice(0, 5) }));

  if (datos.length < 2) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl bg-superficie/60 text-sm text-muted-foreground">
        Hacen falta al menos dos cotizaciones para el gráfico.
      </div>
    );
  }

  const tasas = datos.map((d) => d.tasa);
  const min = Math.min(...tasas);
  const max = Math.max(...tasas);
  const margen = Math.max((max - min) * 0.15, 0.05);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={easeSmooth}
      className="h-56 w-full sm:h-64"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id={`relleno-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BORDO} stopOpacity={0.18} />
              <stop offset="100%" stopColor={BORDO} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe5" vertical={false} />
          <XAxis
            dataKey="etiqueta"
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            domain={[min - margen, max + margen]}
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) =>
              new Intl.NumberFormat("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
            }
          />
          <Tooltip
            cursor={{ stroke: BORDO, strokeOpacity: 0.2 }}
            contentStyle={{ borderRadius: 12, border: "1px solid #e8e4de", fontSize: 12 }}
            labelFormatter={((_: unknown, payload: { payload?: Punto }[]) => {
              const p = payload?.[0]?.payload;
              return p ? formatFecha(p.fecha) : "";
            }) as never}
            formatter={((value: number, _n: unknown, item: { payload?: Punto }) => [
              `$ ${formatTasa(Number(value))}`,
              item?.payload?.fuente === "manual" ? "Manual" : "BCU",
            ]) as never}
          />
          <Area
            type="monotone"
            dataKey="tasa"
            stroke={BORDO}
            strokeWidth={2.5}
            fill={`url(#relleno-${id})`}
            dot={PuntoManual as never}
            activeDot={{ r: 5, fill: BORDO, stroke: "#fff", strokeWidth: 2 }}
            isAnimationActive
            animationDuration={1200}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
