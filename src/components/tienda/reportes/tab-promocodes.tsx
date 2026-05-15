"use client";

import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { springSmooth } from "@/lib/motion";
import { formatearMoneda, formatearMonedaCompacta } from "@/lib/tesoreria/conversion";
import { KpiCard } from "./kpi-card";
import type { ReportePromocodes } from "@/types/reportes";

interface Props {
  data: ReportePromocodes;
}

export function TabPromocodes({ data }: Props) {
  const topRanking = data.ranking.slice(0, 10);
  const ahora = new Date(data.rango.hasta + "T23:59:59").getTime();

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          index={0}
          label="Total descontado"
          value={formatearMoneda(data.totalDescontado, "UYU")}
          hint={`${data.cantidadUsos} usos`}
        />
        <KpiCard
          index={1}
          label="Descuento / ventas"
          value={
            data.descuentoSobreVentasPct == null
              ? "—"
              : `${data.descuentoSobreVentasPct.toFixed(1)}%`
          }
        />
        <KpiCard
          index={2}
          label="Margen restante"
          value={formatearMoneda(data.margenRestante, "UYU")}
          hint={
            data.margenRestantePct == null
              ? undefined
              : `${data.margenRestantePct.toFixed(1)}% sobre ventas con código`
          }
          tone={data.margenRestante < 0 ? "negative" : "positive"}
        />
        <KpiCard
          index={3}
          label="Ticket con / sin código"
          value={`${formatearMonedaCompacta(data.ticketConCodigo, "UYU")} · ${formatearMonedaCompacta(data.ticketSinCodigo, "UYU")}`}
        />
      </div>

      {/* Contadores de estado */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatusCounter index={0} label="Vigentes" value={data.contadoresEstado.vigentes} color="#0d7377" />
        <StatusCounter index={1} label="Vencidos" value={data.contadoresEstado.vencidos} color="#a64161" />
        <StatusCounter index={2} label="Agotados" value={data.contadoresEstado.agotados} color="#c97064" />
        <StatusCounter index={3} label="Sin uso" value={data.contadoresEstado.sinUso} color="#4a5d6c" />
      </div>

      {/* Ranking */}
      <ChartCard title="Ranking de códigos">
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left py-2 font-heading">Código</th>
                <th className="text-right py-2 font-heading">Usos</th>
                <th className="text-right py-2 font-heading">Descontado</th>
                <th className="text-right py-2 font-heading">Facturación</th>
                <th className="text-right py-2 font-heading">COGS</th>
                <th className="text-right py-2 font-heading">Margen</th>
                <th className="text-right py-2 font-heading">%</th>
              </tr>
            </thead>
            <tbody>
              {data.ranking.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-muted-foreground">
                    No se usaron promocodes en el rango
                  </td>
                </tr>
              ) : (
                data.ranking.map((r, i) => (
                  <motion.tr
                    key={r.promocode_id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...springSmooth, delay: i * 0.02 }}
                    className={`border-b border-border/50 ${
                      r.margen < 0
                        ? "bg-rose-50/60 dark:bg-rose-950/20 hover:bg-rose-100/60"
                        : "hover:bg-muted/40"
                    }`}
                  >
                    <td className="py-2 font-mono">
                      <div className="font-medium text-foreground">{r.codigo}</div>
                      {r.descripcion && (
                        <div className="text-[10px] text-muted-foreground font-body">
                          {r.descripcion}
                        </div>
                      )}
                    </td>
                    <td className="py-2 text-right font-mono">{r.usos}</td>
                    <td className="py-2 text-right font-mono text-rose-700 dark:text-rose-400">
                      −{formatearMoneda(r.descontado, "UYU")}
                    </td>
                    <td className="py-2 text-right font-mono">
                      {formatearMoneda(r.facturacion, "UYU")}
                    </td>
                    <td className="py-2 text-right font-mono text-muted-foreground">
                      {formatearMoneda(r.cogs, "UYU")}
                    </td>
                    <td
                      className={`py-2 text-right font-mono font-medium ${
                        r.margen < 0 ? "text-rose-600" : "text-emerald-700 dark:text-emerald-400"
                      }`}
                    >
                      {formatearMoneda(r.margen, "UYU")}
                    </td>
                    <td className="py-2 text-right font-mono text-muted-foreground">
                      {r.margenPct == null ? "—" : `${r.margenPct.toFixed(1)}%`}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Descuento otorgado vs margen restante (top 10)">
          <ResponsiveContainer width="100%" height={Math.max(220, topRanking.length * 30 + 40)}>
            <BarChart
              data={topRanking}
              layout="vertical"
              margin={{ top: 5, right: 10, bottom: 0, left: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatearMonedaCompacta(Number(v), "UYU")} />
              <YAxis type="category" dataKey="codigo" tick={{ fontSize: 10 }} width={90} />
              <Tooltip formatter={((v: number) => formatearMoneda(v, "UYU")) as never} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="descontado" name="Descontado" fill="#c97064" radius={[0, 6, 6, 0]} />
              <Bar dataKey="margen" name="Margen restante" radius={[0, 6, 6, 0]}>
                {topRanking.map((r, i) => (
                  <Cell key={i} fill={r.margen < 0 ? "#9f1239" : "#0d7377"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Acumulación con precio socio">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={[
                {
                  tipo: "Acumulado con socio",
                  cantidad: data.acumulacionPrecioSocio.conPrecioSocio,
                },
                {
                  tipo: "Solo descuento",
                  cantidad: data.acumulacionPrecioSocio.soloDescuento,
                },
              ]}
              margin={{ top: 5, right: 10, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="tipo" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="cantidad" name="Usos" fill="#730d32" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Estado de todos los códigos">
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left py-2 font-heading">Código</th>
                <th className="text-left py-2 font-heading">Vigencia</th>
                <th className="text-right py-2 font-heading">Usos</th>
                <th className="text-left py-2 font-heading">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.detalleEstados.map((e, i) => {
                const badge = e.vigente
                  ? { label: "Vigente", color: "#0d7377" }
                  : e.agotado
                  ? { label: "Agotado", color: "#c97064" }
                  : new Date(e.fecha_fin).getTime() < ahora
                  ? { label: "Vencido", color: "#a64161" }
                  : !e.activo
                  ? { label: "Inactivo", color: "#4a5d6c" }
                  : { label: "Programado", color: "#f7b643" };

                return (
                  <motion.tr
                    key={e.promocode_id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...springSmooth, delay: Math.min(i * 0.015, 0.4) }}
                    className="border-b border-border/50 hover:bg-muted/40"
                  >
                    <td className="py-2 font-mono">
                      <div className="font-medium text-foreground">{e.codigo}</div>
                      {e.descripcion && (
                        <div className="text-[10px] text-muted-foreground font-body">
                          {e.descripcion}
                        </div>
                      )}
                    </td>
                    <td className="py-2 text-muted-foreground font-mono">
                      {formatearFechaCorta(e.fecha_inicio)} → {formatearFechaCorta(e.fecha_fin)}
                    </td>
                    <td className="py-2 text-right font-mono">
                      {e.usos_actuales}
                      {e.usos_max != null && (
                        <span className="text-muted-foreground"> / {e.usos_max}</span>
                      )}
                    </td>
                    <td className="py-2">
                      <span
                        className="inline-block px-2 py-0.5 rounded-full text-[10px] font-heading uppercase tracking-wider"
                        style={{
                          backgroundColor: `${badge.color}1a`,
                          color: badge.color,
                        }}
                      >
                        {badge.label}
                      </span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}

function StatusCounter({
  label,
  value,
  color,
  index,
}: {
  label: string;
  value: number;
  color: string;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springSmooth, delay: index * 0.04 }}
      className="rounded-2xl border border-border bg-card p-4 flex items-center justify-between"
    >
      <div>
        <p className="text-[10px] uppercase tracking-wider font-heading text-muted-foreground">
          {label}
        </p>
        <p className="text-2xl font-display tracking-tight" style={{ color }}>
          {value}
        </p>
      </div>
      <div
        className="h-10 w-10 rounded-full opacity-30"
        style={{ backgroundColor: color }}
      />
    </motion.div>
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

function formatearFechaCorta(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}`;
}
