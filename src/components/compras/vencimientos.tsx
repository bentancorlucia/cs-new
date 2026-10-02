"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { CalendarClock, HandCoins } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth, fadeInUp, staggerContainerFast } from "@/lib/motion";
import { lunesDe, numeroDocumento, sumarDias } from "@/lib/comercial/compras-esquemas";
import type { SemanaVencimientos } from "@/lib/comercial/compras";

const VENCIDAS = "0000-vencidas";
import { BadgeMoneda, EncabezadoPagina, ImporteAnimado, Kpi, Vacio } from "./ui";

export function Vencimientos({
  semanas,
  totales,
  hoy,
  puedeOperar,
}: {
  semanas: SemanaVencimientos[];
  totales: { moneda: string; total: number; vencido: number }[];
  hoy: string;
  puedeOperar: boolean;
}) {
  const lunesHoy = lunesDe(hoy);
  const etiqueta = (lunes: string) => {
    if (lunes === VENCIDAS) return "Vencidas";
    if (lunes === lunesHoy) return "Esta semana";
    if (lunes === sumarDias(lunesHoy, 7)) return "La semana que viene";
    return `Semana del ${formatFecha(lunes)}`;
  };
  const tot = (m: string) => totales.find((t) => t.moneda === m) ?? { moneda: m, total: 0, vencido: 0 };

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Proveedores y compras"
        titulo="Vencimientos"
        descripcion="Facturas y notas de débito pendientes de todo el club, ordenadas por vencimiento, con el total de cada semana."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {["UYU", "USD"].map((m, i) => (
          <Kpi key={m} etiqueta={`Pendiente en ${m === "USD" ? "dólares" : "pesos"}`} delay={0.05 * (i + 1)}>
            <ImporteAnimado valor={tot(m).total} moneda={m} />
          </Kpi>
        ))}
        {["UYU", "USD"].map((m, i) => (
          <Kpi
            key={`v${m}`}
            etiqueta={`Vencido en ${m === "USD" ? "dólares" : "pesos"}`}
            tono={tot(m).vencido > 0 ? "alerta" : "neutro"}
            delay={0.05 * (i + 3)}
          >
            <ImporteAnimado valor={tot(m).vencido} moneda={m} />
          </Kpi>
        ))}
      </div>

      {semanas.length === 0 ? (
        <Vacio icono={CalendarClock} titulo="No hay facturas pendientes" texto="Todo al día con los proveedores." />
      ) : (
        <div className="space-y-4">
          {semanas.map((s, i) => {
            const vencida = s.lunes === VENCIDAS;
            return (
              <motion.section
                key={s.lunes}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ ...easeSmooth, delay: Math.min(i, 4) * 0.05 }}
                className={cn("overflow-hidden rounded-2xl border bg-white", vencida ? "border-rose-200" : "border-linea")}
              >
                <header
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3",
                    vencida ? "border-rose-100 bg-rose-50/60" : "border-linea bg-superficie/40"
                  )}
                >
                  <div>
                    <div className={cn("font-heading text-sm", vencida ? "text-rose-800" : "text-foreground")}>{etiqueta(s.lunes)}</div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      {vencida ? "Antes de hoy" : `${formatFecha(s.lunes)} al ${formatFecha(sumarDias(s.lunes, 6))}`} ·{" "}
                      {s.documentos.length} documento
                      {s.documentos.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {s.totales.map((t) => (
                      <span key={t.moneda} className="flex items-center gap-1.5 font-heading tabular-nums">
                        <BadgeMoneda moneda={t.moneda} />
                        {formatImporte(t.total, t.moneda)}
                      </span>
                    ))}
                  </div>
                </header>
                <motion.ul
                  variants={staggerContainerFast}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  className="divide-y divide-linea/70"
                >
                  {s.documentos.map((d) => (
                    <motion.li
                      key={d.id}
                      variants={fadeInUp}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm sm:grid-cols-[6.5rem_minmax(0,1fr)_10rem_auto]"
                    >
                      <div className={cn("text-xs tabular-nums", d.diasVencido > 0 ? "text-rose-700" : "text-muted-foreground")}>
                        {formatFecha(d.vencimiento ?? d.fecha)}
                        {d.diasVencido > 0 && <div>hace {d.diasVencido} d</div>}
                      </div>
                      <div className="col-span-2 min-w-0 sm:col-span-1">
                        <Link href={`/admin/proveedores/${d.proveedor_id}`} className="block truncate font-medium hover:text-bordo-800">
                          {d.proveedor}
                        </Link>
                        <Link href={`/admin/compras/documentos/${d.id}`} className="text-xs text-muted-foreground hover:text-bordo-800">
                          {numeroDocumento(d)}
                          {d.comprometido > 0 && ` · ${formatImporte(d.comprometido, d.moneda)} en orden de pago`}
                        </Link>
                      </div>
                      <div className="text-right font-heading tabular-nums">{formatImporte(d.saldo, d.moneda)}</div>
                      {puedeOperar ? (
                        <motion.div whileTap={{ scale: 0.95 }}>
                          <Link
                            href={`/admin/compras/pagos/nuevo?proveedor=${d.proveedor_id}&moneda=${d.moneda}&documento=${d.id}`}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-linea px-2.5 text-xs font-medium text-bordo-800 transition-colors hover:bg-bordo-50"
                          >
                            <HandCoins className="size-3.5" />
                            Pagar
                          </Link>
                        </motion.div>
                      ) : (
                        <span />
                      )}
                    </motion.li>
                  ))}
                </motion.ul>
              </motion.section>
            );
          })}
        </div>
      )}
    </div>
  );
}
