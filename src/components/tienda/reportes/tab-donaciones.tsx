"use client";

import { motion } from "framer-motion";
import { Info } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { fadeInUp, staggerContainer, staggerContainerFast } from "@/lib/motion";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { NOMBRE_CANAL, NOMBRE_ESTADO_DONACION, etiquetaBucket } from "@/lib/reportes/etiquetas";
import { KpiCard } from "./kpi-card";
import { ControlContableCard } from "./control-contable";
import { Barra, Tarjeta } from "./tab-general";
import type { ReporteDonaciones } from "@/types/reportes";

const fmt = (v: number) => formatImporte(v, "UYU");

const ESTILO: Record<string, string> = {
  cobrada: "bg-amber-50 text-amber-800",
  transferida: "bg-emerald-50 text-emerald-700",
  pendiente_pago: "bg-gray-100 text-gray-600",
  cancelada: "bg-red-50 text-red-700",
};

export function TabDonaciones({ data }: { data: ReporteDonaciones }) {
  const maxEstado = Math.max(1, ...data.porEstado.map((e) => e.total));

  return (
    <div className="space-y-5">
      <ControlContableCard
        controles={[data.control]}
        descripcion="Donaciones cobradas = lo acreditado en «Donaciones Olla del Hogar a transferir» por las ventas del período. Las transferencias a la Olla son otro asiento."
      />

      {!data.configActiva && (
        <div className="flex items-center gap-2 rounded-xl border border-linea bg-superficie p-3 text-xs text-muted-foreground">
          <Info className="size-4" /> Las donaciones están desactivadas en el checkout.
        </div>
      )}

      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Total donado" valor={data.totalDonado} tono="bordo" hint="no es venta" />
        <KpiCard label="Pedidos con donación" valor={data.cantidad} formato="entero" hint={`promedio ${fmt(data.promedio)}`} />
        <KpiCard
          label="Tasa de donación"
          valor={data.tasaConversionPct}
          formato="pct"
          hint={`sobre ${data.pedidosOnline} pedidos online`}
        />
        <KpiCard
          label="Pendientes de cobro (hoy)"
          valor={data.pendientesDeCobro.total}
          hint={`${data.pendientesDeCobro.cantidad} pedidos sin aprobar`}
        />
      </motion.div>

      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid gap-4 lg:grid-cols-3">
        <Tarjeta titulo="Por estado" subtitulo="De las donaciones del período" className="lg:col-span-1">
          {data.porEstado.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Sin donaciones en el rango.</p>
          ) : (
            <ul className="space-y-3">
              {data.porEstado.map((e, i) => (
                <li key={e.estado}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span>{NOMBRE_ESTADO_DONACION[e.estado] ?? e.estado}</span>
                    <span className="tabular-nums font-heading">{fmt(e.total)}</span>
                  </div>
                  <Barra pct={(e.total / maxEstado) * 100} color={e.estado === "transferida" ? "bg-emerald-600" : "bg-dorado-400"} delay={i * 0.06} />
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{e.cantidad} donaciones</p>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>

        <Tarjeta titulo="Evolución" subtitulo="Monto donado por período" className="lg:col-span-2">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.serie} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8e4de" />
                <XAxis dataKey="fecha" tickFormatter={etiquetaBucket} tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} width={44} />
                <Tooltip
                  formatter={(v) => fmt(Number(v))}
                  labelFormatter={(l) => etiquetaBucket(String(l))}
                  contentStyle={{ borderRadius: 12, borderColor: "#e8e4de", fontSize: 12 }}
                />
                <Bar dataKey="monto" name="Donado" fill="#0d7377" radius={[6, 6, 0, 0]} animationDuration={700} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Tarjeta>
      </motion.div>

      <motion.div variants={staggerContainer} initial="hidden" animate="visible">
        <Tarjeta titulo="Detalle" subtitulo="Por fecha contable de la venta">
          {data.detalle.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sin donaciones en el rango.</p>
          ) : (
            <div className="reporte-scroll -mx-4 overflow-x-auto sm:mx-0">
              <table className="reporte-tabla w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-linea text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2 font-heading sm:px-2">Fecha</th>
                    <th className="px-2 py-2 font-heading">Pedido</th>
                    <th className="px-2 py-2 font-heading">Canal</th>
                    <th className="px-2 py-2 text-right font-heading">Monto</th>
                    <th className="px-4 py-2 font-heading sm:px-2">Estado</th>
                  </tr>
                </thead>
                <motion.tbody variants={staggerContainerFast} initial="hidden" animate="visible" className="divide-y divide-linea">
                  {data.detalle.map((d) => (
                    <motion.tr key={d.pedido_id} variants={fadeInUp} className="hover:bg-superficie/60">
                      <td className="px-4 py-2 tabular-nums sm:px-2">{formatFecha(d.fecha)}</td>
                      <td className="px-2 py-2 font-heading">{d.numero_pedido ?? `#${d.pedido_id}`}</td>
                      <td className="px-2 py-2 text-muted-foreground">{NOMBRE_CANAL[d.canal]}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmt(d.monto)}</td>
                      <td className="px-4 py-2 sm:px-2">
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px]", ESTILO[d.estado] ?? "bg-gray-100 text-gray-600")}>
                          {NOMBRE_ESTADO_DONACION[d.estado] ?? d.estado}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </motion.tbody>
              </table>
            </div>
          )}
        </Tarjeta>
      </motion.div>
    </div>
  );
}
