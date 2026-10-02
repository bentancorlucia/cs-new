"use client";

import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth } from "@/lib/motion";
import { MESES_CORTOS, type PuntoMensual } from "@/lib/contabilidad/presupuesto";

// Validados (dataviz/validate_palette): dorado y bordo separables con daltonismo.
const PRESUPUESTADO = "#c98a1a";
const EJECUTADO = "#ab1d47";

const compacto = new Intl.NumberFormat("es-UY", { notation: "compact", maximumFractionDigits: 1 });

/** Resultado (ingresos − egresos) mes a mes o acumulado: presupuestado vs ejecutado. */
export function GraficoEjecucion({ serie, acumulado }: { serie: PuntoMensual[]; acumulado: boolean }) {
  const datos = serie.reduce<{ etiqueta: string; presupuestado: number; ejecutado: number }[]>((lista, p) => {
    const previo = lista[lista.length - 1];
    lista.push({
      etiqueta: MESES_CORTOS[p.mes - 1],
      presupuestado: acumulado && previo ? Math.round((previo.presupuestado + p.presupuestado) * 100) / 100 : p.presupuestado,
      ejecutado: acumulado && previo ? Math.round((previo.ejecutado + p.ejecutado) * 100) / 100 : p.ejecutado,
    });
    return lista;
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={easeSmooth}
      className="h-64 w-full sm:h-72"
      role="img"
      aria-label="Gráfico de barras del resultado presupuestado y ejecutado por mes"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 8, right: 4, bottom: 0, left: -4 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe5" vertical={false} />
          <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(v: number) => compacto.format(v)}
          />
          <ReferenceLine y={0} stroke="#d6d0c8" />
          <Tooltip
            cursor={{ fill: "#730d32", fillOpacity: 0.05 }}
            contentStyle={{ borderRadius: 12, border: "1px solid #e8e4de", fontSize: 12 }}
            formatter={((value: number, nombre: string) => [
              `$ ${formatImporte(Number(value))}`,
              nombre === "presupuestado" ? "Presupuestado" : "Ejecutado",
            ]) as never}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
            formatter={(v: string) => (
              <span className="text-foreground">{v === "presupuestado" ? "Presupuestado" : "Ejecutado"}</span>
            )}
          />
          <Bar
            dataKey="presupuestado"
            fill={PRESUPUESTADO}
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
            animationDuration={900}
            animationEasing="ease-out"
          />
          <Bar
            dataKey="ejecutado"
            fill={EJECUTADO}
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
            animationBegin={150}
            animationDuration={900}
            animationEasing="ease-out"
          />
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
