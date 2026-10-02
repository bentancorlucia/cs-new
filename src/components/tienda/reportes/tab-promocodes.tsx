"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { fadeInUp, springSmooth, staggerContainer, staggerContainerFast } from "@/lib/motion";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { uruguayDateKey } from "@/lib/timezone";
import { formatPct } from "@/lib/reportes/etiquetas";
import { EnteroAnimado } from "@/components/contabilidad/reportes/importe-animado";
import { KpiCard } from "./kpi-card";
import { Barra, Tarjeta } from "./tab-general";
import type { PromocodeEstado, ReportePromocodes } from "@/types/reportes";

const fmt = (v: number) => formatImporte(v, "UYU");

function estado(e: PromocodeEstado): { label: string; clase: string } {
  if (e.vigente) return { label: "Vigente", clase: "bg-emerald-50 text-emerald-700" };
  if (e.agotado) return { label: "Agotado", clase: "bg-orange-50 text-orange-700" };
  if (e.vencido) return { label: "Vencido", clase: "bg-gray-100 text-gray-600" };
  if (!e.activo) return { label: "Inactivo", clase: "bg-gray-100 text-gray-500" };
  return { label: "Programado", clase: "bg-blue-50 text-blue-700" };
}

export function TabPromocodes({ data }: { data: ReportePromocodes }) {
  const maxDesc = Math.max(1, ...data.ranking.map((r) => r.descontado));
  const totalUsos = data.acumulacionPrecioSocio.conPrecioSocio + data.acumulacionPrecioSocio.soloDescuento;

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">
        Pedidos vendidos en el período (fecha contable, sin anulados). Facturación = cobrado sin donación; costo = kardex.
      </p>

      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Total descontado" valor={data.totalDescontado} tono="bordo" hint={`${data.cantidadUsos} pedidos con código`} />
        <KpiCard label="Descuento sobre ventas" valor={data.descuentoSobreVentasPct} formato="pct" hint="del precio de lista" />
        <KpiCard
          label="Margen con código"
          valor={data.margenConCodigo}
          tono={data.margenConCodigo < 0 ? "negativo" : "positivo"}
          hint={formatPct(data.margenConCodigoPct)}
        />
        <KpiCard
          label="Ticket con / sin código"
          valor={data.ticketConCodigo}
          hint={`sin código: ${fmt(data.ticketSinCodigo)}`}
        />
      </motion.div>

      <motion.div variants={staggerContainerFast} initial="hidden" animate="visible" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { l: "Vigentes", v: data.contadoresEstado.vigentes, c: "text-emerald-700" },
          { l: "Vencidos", v: data.contadoresEstado.vencidos, c: "text-muted-foreground" },
          { l: "Agotados", v: data.contadoresEstado.agotados, c: "text-orange-700" },
          { l: "Sin uso", v: data.contadoresEstado.sinUso, c: "text-muted-foreground" },
        ].map((x) => (
          <motion.div key={x.l} variants={fadeInUp} transition={springSmooth} className="rounded-xl border border-linea bg-white px-3 py-2 shadow-sm">
            <p className="text-[11px] text-muted-foreground">Códigos {x.l.toLowerCase()} (hoy)</p>
            <p className={cn("font-display text-lg tracking-tightest", x.c)}>
              <EnteroAnimado valor={x.v} />
            </p>
          </motion.div>
        ))}
      </motion.div>

      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid gap-4 lg:grid-cols-3">
        <Tarjeta titulo="Ranking de códigos" subtitulo="En pedidos del período" className="lg:col-span-2">
          {data.ranking.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Ningún pedido del período usó un código.</p>
          ) : (
            <div className="reporte-scroll -mx-4 overflow-x-auto sm:mx-0">
              <table className="reporte-tabla w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-linea text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2 font-heading sm:px-2">Código</th>
                    <th className="px-2 py-2 text-right font-heading">Usos</th>
                    <th className="px-2 py-2 text-right font-heading">Descontado</th>
                    <th className="px-2 py-2 text-right font-heading">Facturación</th>
                    <th className="px-2 py-2 text-right font-heading">Margen</th>
                    <th className="px-4 py-2 text-right font-heading sm:px-2">Margen %</th>
                  </tr>
                </thead>
                <motion.tbody variants={staggerContainerFast} initial="hidden" animate="visible" className="divide-y divide-linea">
                  {data.ranking.map((r) => (
                    <motion.tr key={r.promocode_id} variants={fadeInUp} className={cn("hover:bg-superficie/60", r.margen < 0 && "bg-red-50/60")}>
                      <td className="px-4 py-2 sm:px-2">
                        <span className="font-mono text-xs font-semibold">{r.codigo}</span>
                        {r.descripcion && <span className="block text-[10px] text-muted-foreground">{r.descripcion}</span>}
                        <div className="mt-1 max-w-[180px]">
                          <Barra pct={(r.descontado / maxDesc) * 100} color="bg-dorado-400" />
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.usos}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmt(r.descontado)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmt(r.facturacion)}</td>
                      <td className={cn("px-2 py-2 text-right tabular-nums", r.margen < 0 && "text-red-700")}>{fmt(r.margen)}</td>
                      <td className="px-4 py-2 text-right tabular-nums sm:px-2">{formatPct(r.margenPct)}</td>
                    </motion.tr>
                  ))}
                </motion.tbody>
              </table>
            </div>
          )}
        </Tarjeta>

        <Tarjeta titulo="Acumulación con precio socio" subtitulo="Pedidos con código">
          <div className="space-y-3 text-sm">
            <div>
              <div className="flex justify-between">
                <span>Código + precio socio</span>
                <span className="tabular-nums font-heading">{data.acumulacionPrecioSocio.conPrecioSocio}</span>
              </div>
              <Barra pct={totalUsos ? (data.acumulacionPrecioSocio.conPrecioSocio / totalUsos) * 100 : 0} />
            </div>
            <div>
              <div className="flex justify-between">
                <span>Solo el código</span>
                <span className="tabular-nums font-heading">{data.acumulacionPrecioSocio.soloDescuento}</span>
              </div>
              <Barra pct={totalUsos ? (data.acumulacionPrecioSocio.soloDescuento / totalUsos) * 100 : 0} color="bg-dorado-400" />
            </div>
          </div>
        </Tarjeta>
      </motion.div>

      <motion.div variants={staggerContainer} initial="hidden" animate="visible">
        <Tarjeta titulo="Estado de los códigos" subtitulo="Todos los códigos, hoy (usos acumulados, no del período)">
          {data.detalleEstados.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No hay códigos cargados.</p>
          ) : (
            <div className="reporte-scroll -mx-4 overflow-x-auto sm:mx-0">
              <table className="reporte-tabla w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-linea text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2 font-heading sm:px-2">Código</th>
                    <th className="px-2 py-2 font-heading">Estado</th>
                    <th className="px-2 py-2 font-heading">Vigencia</th>
                    <th className="px-4 py-2 text-right font-heading sm:px-2">Usos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linea">
                  {data.detalleEstados.map((e) => {
                    const s = estado(e);
                    return (
                      <tr key={e.promocode_id} className="hover:bg-superficie/60">
                        <td className="px-4 py-2 font-mono text-xs font-semibold sm:px-2">{e.codigo}</td>
                        <td className="px-2 py-2">
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px]", s.clase)}>{s.label}</span>
                        </td>
                        <td className="px-2 py-2 text-xs text-muted-foreground tabular-nums">
                          {formatFecha(uruguayDateKey(e.fecha_inicio))} → {formatFecha(uruguayDateKey(e.fecha_fin))}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums sm:px-2">
                          {e.usos_actuales}
                          {e.usos_max != null ? ` / ${e.usos_max}` : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Tarjeta>
      </motion.div>
    </div>
  );
}
