"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ChevronDown, ExternalLink, FileText, Lock, LockOpen } from "lucide-react";
import type { SesionHistorial } from "@/lib/comercial/caja";
import { fechaHora, pesos } from "@/components/pos/formato";
import { easeSmooth, fadeInUp, springSmooth, staggerContainer } from "@/lib/motion";
import { DiferenciaArqueo } from "./diferencia-arqueo";
import { TablaResumen } from "./tabla-resumen";

const NOMBRE_ORIGEN: Record<string, string> = {
  pedido_venta: "Venta",
  pedido_efectivo: "Efectivo mixto",
  devolucion_venta: "Devolución",
  caja_movimiento: "Movimiento",
  caja_arqueo: "Arqueo",
};

const NOMBRE_TIPO: Record<string, string> = {
  deposito_banco: "Depósito al banco",
  retiro: "Retiro",
  ingreso: "Ingreso",
  gasto: "Gasto",
  arqueo: "Arqueo",
};

export function HistorialCaja({
  nombreCaja,
  sesiones,
  error,
  verAsientos,
}: {
  nombreCaja: string;
  sesiones: SesionHistorial[];
  error: string | null;
  verAsientos: boolean;
}) {
  const [abierta, setAbierta] = useState<number | null>(sesiones[0]?.id ?? null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={easeSmooth}
            className="text-[11px] uppercase tracking-editorial text-bordo-700 font-heading"
          >
            Punto de venta
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...easeSmooth, delay: 0.05 }}
            className="font-display text-2xl sm:text-3xl uppercase tracking-tightest"
          >
            Historial de caja
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ ...easeSmooth, delay: 0.12 }}
            className="mt-1 text-sm text-muted-foreground"
          >
            {nombreCaja}: aperturas, cierres, arqueos y los asientos de cada sesión.
          </motion.p>
        </div>
        <Link
          href="/admin/pos"
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-linea bg-white px-4 text-sm font-heading hover:bg-superficie"
        >
          <ArrowLeft className="size-4" />
          Volver al POS
        </Link>
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {sesiones.length === 0 && !error ? (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl border border-dashed border-linea bg-white px-6 py-12 text-center text-muted-foreground"
        >
          Todavía no se abrió la caja.
        </motion.p>
      ) : (
        <motion.ul variants={staggerContainer} initial="hidden" animate="visible" className="space-y-3">
          {sesiones.map((s) => (
            <motion.li key={s.id} variants={fadeInUp} layout>
              <TarjetaSesion
                s={s}
                abierta={abierta === s.id}
                onToggle={() => setAbierta(abierta === s.id ? null : s.id)}
                verAsientos={verAsientos}
              />
            </motion.li>
          ))}
        </motion.ul>
      )}
    </div>
  );
}

function TarjetaSesion({
  s,
  abierta,
  onToggle,
  verAsientos,
}: {
  s: SesionHistorial;
  abierta: boolean;
  onToggle: () => void;
  verAsientos: boolean;
}) {
  const difApertura = s.contado_inicial - s.saldo_inicial;
  const difCierre = s.contado_final != null && s.saldo_final != null ? s.contado_final - s.saldo_final : null;
  const enCurso = s.estado === "abierta";

  return (
    <div className="overflow-hidden rounded-2xl border border-linea bg-white shadow-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 text-left hover:bg-superficie/50 sm:px-5"
      >
        <div className="flex items-center gap-3">
          <span className={`flex size-10 items-center justify-center rounded-xl ${enCurso ? "bg-green-100 text-green-700" : "bg-superficie text-muted-foreground"}`}>
            {enCurso ? <LockOpen className="size-5" /> : <Lock className="size-5" />}
          </span>
          <div>
            <p className="font-heading font-semibold">
              Sesión #{s.id}
              {enCurso && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[11px] text-green-800">abierta</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              {fechaHora(s.abierta_at)} → {s.cerrada_at ? fechaHora(s.cerrada_at) : "en curso"}
            </p>
          </div>
        </div>
        <Dato titulo="Apertura" valor={pesos(s.contado_inicial)} sub={s.abierta_por_nombre} />
        <Dato
          titulo="Cierre"
          valor={s.contado_final != null ? pesos(s.contado_final) : "—"}
          sub={s.cerrada_por_nombre ?? (s.saldo_final != null ? `esperado ${pesos(s.saldo_final)}` : null)}
        />
        {difCierre != null && Math.abs(difCierre) >= 0.005 && (
          <span className={`rounded-full px-2.5 py-1 text-xs font-heading font-semibold ${difCierre > 0 ? "bg-sky-50 text-sky-800" : "bg-red-50 text-red-700"}`}>
            {difCierre > 0 ? "Sobrante" : "Faltante"} {pesos(Math.abs(difCierre))}
          </span>
        )}
        <motion.span animate={{ rotate: abierta ? 180 : 0 }} transition={springSmooth} className="ml-auto text-muted-foreground">
          <ChevronDown className="size-5" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {abierta && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={springSmooth}
            className="overflow-hidden border-t border-linea"
          >
            <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-2">
              <div className="space-y-3">
                <h3 className="text-xs font-heading uppercase tracking-editorial text-muted-foreground">Resumen</h3>
                <TablaResumen filas={s.resumen} />
                {Math.abs(difApertura) >= 0.005 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Al abrir</p>
                    <DiferenciaArqueo diferencia={difApertura} registrada />
                  </div>
                )}
                {difCierre != null && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Al cerrar</p>
                    <DiferenciaArqueo diferencia={difCierre} registrada />
                  </div>
                )}
                {s.notas && (
                  <p className="whitespace-pre-line rounded-xl bg-superficie px-4 py-3 text-sm text-muted-foreground">{s.notas}</p>
                )}
                {s.movimientos.filter((m) => m.tipo !== "arqueo").length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-heading uppercase tracking-editorial text-muted-foreground">Movimientos de caja</h3>
                    <ul className="divide-y divide-linea rounded-xl border border-linea">
                      {s.movimientos
                        .filter((m) => m.tipo !== "arqueo")
                        .map((m) => (
                          <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                            <div className="min-w-0 flex-1">
                              <p className="truncate">
                                <span className="font-medium">{NOMBRE_TIPO[m.tipo] ?? m.tipo}</span> · {m.descripcion}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {fechaHora(m.created_at)}
                                {m.creado_por_nombre ? ` · ${m.creado_por_nombre}` : ""}
                              </p>
                            </div>
                            <span className={`tabular-nums font-heading font-semibold ${m.entra ? "text-green-700" : "text-red-700"}`}>
                              {m.entra ? "+" : "−"} {pesos(m.importe)}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-heading uppercase tracking-editorial text-muted-foreground">
                  Asientos ({s.asientos.length})
                </h3>
                {s.asientos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin asientos en la caja.</p>
                ) : (
                  <ul className="max-h-[420px] divide-y divide-linea overflow-y-auto rounded-xl border border-linea">
                    {s.asientos.map((a) => {
                      const contenido = (
                        <>
                          <FileText className="size-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate">
                              <span className="font-medium">{a.numero != null ? `N° ${a.numero}` : "Asiento"}</span> · {a.descripcion}
                            </p>
                            <p className="text-xs text-muted-foreground">{a.origen_tipo ? NOMBRE_ORIGEN[a.origen_tipo] ?? a.origen_tipo : "Manual"}</p>
                          </div>
                          <span className={`tabular-nums text-sm font-semibold ${a.debe >= a.haber ? "text-green-700" : "text-red-700"}`}>
                            {a.debe >= a.haber ? "+" : "−"} {pesos(Math.abs(a.debe - a.haber))}
                          </span>
                          {verAsientos && <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />}
                        </>
                      );
                      return (
                        <li key={a.id}>
                          {verAsientos ? (
                            <Link
                              href={`/contabilidad/asientos/${a.id}`}
                              className="flex items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-bordo-50/60"
                            >
                              {contenido}
                            </Link>
                          ) : (
                            <div className="flex items-center gap-3 px-3 py-2 text-sm">{contenido}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Dato({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string | null }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-editorial text-muted-foreground font-heading">{titulo}</p>
      <p className="font-heading font-semibold tabular-nums">{valor}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
