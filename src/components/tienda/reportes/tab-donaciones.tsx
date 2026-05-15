"use client";

import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { springSmooth } from "@/lib/motion";
import { formatearMoneda, formatearMonedaCompacta } from "@/lib/tesoreria/conversion";
import { KpiCard } from "./kpi-card";
import type { ReporteDonaciones } from "@/types/reportes";

const ESTADO_LABELS: Record<string, string> = {
  pendiente_pago: "Pendiente",
  cobrada: "Cobrada",
  transferida: "Transferida",
  cancelada: "Cancelada",
};

const ESTADO_COLOR: Record<string, string> = {
  pendiente_pago: "#f7b643",
  cobrada: "#0d7377",
  transferida: "#730d32",
  cancelada: "#a64161",
};

interface Props {
  data: ReporteDonaciones;
}

export function TabDonaciones({ data }: Props) {
  return (
    <div className="space-y-5">
      {!data.configActiva && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/40 p-3 text-xs font-body text-amber-900 dark:text-amber-200"
        >
          El prompt de donación en checkout está <strong>desactivado</strong>.
        </motion.div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          index={0}
          label="Total donado"
          value={formatearMoneda(data.totalDonado, "UYU")}
        />
        <KpiCard
          index={1}
          label="Donaciones"
          value={data.cantidad.toLocaleString("es-UY")}
        />
        <KpiCard
          index={2}
          label="Donación promedio"
          value={formatearMoneda(data.promedio, "UYU")}
        />
        <KpiCard
          index={3}
          label="Tasa de conversión"
          value={
            data.tasaConversionPct == null
              ? "—"
              : `${data.tasaConversionPct.toFixed(1)}%`
          }
          hint={`${data.cantidad} / ${data.pedidosPagados} pedidos pagados`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Desglose por estado">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={data.porEstado.map((e) => ({
                  name: ESTADO_LABELS[e.clave] || e.clave,
                  value: e.total,
                  raw: e.clave,
                }))}
                dataKey="value"
                nameKey="name"
                outerRadius={90}
                innerRadius={50}
                paddingAngle={2}
              >
                {data.porEstado.map((e, i) => (
                  <Cell key={i} fill={ESTADO_COLOR[e.clave] || "#888"} />
                ))}
              </Pie>
              <Tooltip formatter={((v: number) => formatearMoneda(v, "UYU")) as never} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Evolución temporal">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data.serie} margin={{ top: 5, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="gDonacion" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#730d32" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#730d32" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatearMonedaCompacta(Number(v), "UYU")} />
              <Tooltip formatter={((v: number) => formatearMoneda(v, "UYU")) as never} />
              <Area
                type="monotone"
                dataKey="monto"
                name="Monto donado"
                stroke="#730d32"
                fill="url(#gDonacion)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Detalle de donaciones">
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left py-2 font-heading">Pedido</th>
                <th className="text-left py-2 font-heading">Fecha</th>
                <th className="text-left py-2 font-heading">Estado</th>
                <th className="text-right py-2 font-heading">Monto</th>
              </tr>
            </thead>
            <tbody>
              {data.detalle.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-6 text-muted-foreground">
                    Sin donaciones en el rango
                  </td>
                </tr>
              ) : (
                data.detalle.map((d, i) => (
                  <motion.tr
                    key={d.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...springSmooth, delay: Math.min(i * 0.015, 0.4) }}
                    className="border-b border-border/50 hover:bg-muted/40"
                  >
                    <td className="py-2 font-mono">
                      {d.numero_pedido || `#${d.pedido_id}`}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {new Date(d.created_at).toLocaleDateString("es-UY")}
                    </td>
                    <td className="py-2">
                      <span
                        className="inline-block px-2 py-0.5 rounded-full text-[10px] font-heading uppercase tracking-wider"
                        style={{
                          backgroundColor: `${ESTADO_COLOR[d.estado]}1a`,
                          color: ESTADO_COLOR[d.estado],
                        }}
                      >
                        {ESTADO_LABELS[d.estado] || d.estado}
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono font-medium">
                      {formatearMoneda(d.monto, "UYU")}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springSmooth}
      className="rounded-2xl border border-border bg-card p-4 sm:p-5"
    >
      <h3 className="text-xs uppercase tracking-wider font-heading text-muted-foreground mb-3">
        {title}
      </h3>
      {children}
    </motion.div>
  );
}
