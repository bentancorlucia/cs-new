"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowUpRight, Ban, CalendarClock, ChevronDown, Plus, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import type { PedidoDisciplina, PlanPago } from "@/lib/socios/disciplinas";
import { Barra, Boton, Campo, DialogoAccion, Explicacion, Filtros, Panel, Vacio, claseControl } from "@/components/socios/cuotas/ui";
import { cancelarPlanPago } from "@/app/(dashboard)/secretaria/disciplinas/actions";
import type { DatosDisciplina } from "./form-disciplina";
import { ArmarPlan } from "./armar-plan";
import { BadgeSituacionCuota, BadgeSituacionPlan, Cifra, ImporteContador } from "./ui";

type Filtro = "vigentes" | "todos";

export function PlanesPagoVista({
  disciplina,
  planes,
  pedidos,
  hoy,
  puedeTesoreria,
}: {
  disciplina: DatosDisciplina;
  planes: PlanPago[];
  pedidos: PedidoDisciplina[];
  hoy: string;
  puedeTesoreria: boolean;
}) {
  const [filtro, setFiltro] = useState<Filtro>("vigentes");
  const [armando, setArmando] = useState(false);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [cancelar, setCancelar] = useState<PlanPago | null>(null);

  const vigentes = planes.filter((p) => p.estado === "vigente");
  const visibles = filtro === "vigentes" ? vigentes : planes;
  const saldo = vigentes.reduce((s, p) => s + p.saldo, 0);
  const vencido = vigentes.reduce((s, p) => s + p.saldo_vencido, 0);
  const proximo = vigentes
    .map((p) => p.proximo_vencimiento)
    .filter((v): v is string => !!v)
    .sort()[0];
  const pedidoPorId = new Map(pedidos.map((p) => [p.id, p]));

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Cifra etiqueta="Saldo en planes" icono={CalendarClock} detalle={`${vigentes.length} plan${vigentes.length === 1 ? "" : "es"} vigente${vigentes.length === 1 ? "" : "s"}`}>
          <ImporteContador valor={saldo} moneda="UYU" />
        </Cifra>
        <Cifra etiqueta="Vencido" tono={vencido > 0 ? "alerta" : "bueno"} delay={0.04} detalle={vencido > 0 ? "Cuotas vencidas sin pagar" : "Nada vencido"}>
          <ImporteContador valor={vencido} moneda="UYU" />
        </Cifra>
        <div className="col-span-2 lg:col-span-1">
          <Cifra etiqueta="Próximo vencimiento" delay={0.08} detalle={proximo && proximo < hoy ? "Ya venció" : undefined} tono={proximo && proximo < hoy ? "alerta" : "neutro"}>
            {proximo ? formatFecha(proximo) : <span className="text-muted-foreground">—</span>}
          </Cifra>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {armando && (
          <motion.div
            key="armar"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <ArmarPlan disciplina={disciplina} pedidos={pedidos} hoy={hoy} onClose={() => setArmando(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <Panel
        titulo="Planes de pago"
        icono={CalendarClock}
        delay={0.06}
        accion={
          puedeTesoreria && !armando ? (
            <Boton className="h-9 w-full px-3 text-xs sm:w-auto" onClick={() => setArmando(true)}>
              <Plus className="size-3.5" />
              Armar un plan
            </Boton>
          ) : undefined
        }
      >
        <div className="border-b border-linea px-4 py-2.5">
          <Filtros<Filtro>
            id="planes"
            valor={filtro}
            onChange={setFiltro}
            opciones={[
              { valor: "vigentes", etiqueta: "Vigentes", cantidad: vigentes.length },
              { valor: "todos", etiqueta: "Todos", cantidad: planes.length },
            ]}
          />
        </div>
        {visibles.length === 0 ? (
          <div className="p-4">
            <Vacio
              icono={CalendarClock}
              titulo={planes.length ? "No hay planes vigentes" : "La disciplina no tiene planes de pago"}
              texto="Un plan ordena en cuotas con vencimiento lo que la disciplina debe por sus pedidos de la tienda."
            />
          </div>
        ) : (
          <ul className="divide-y divide-linea">
            <AnimatePresence initial={false}>
              {visibles.map((p, i) => {
                const open = abierto === p.id;
                return (
                  <motion.li
                    key={p.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.35, delay: Math.min(i, 8) * 0.04 }}
                    className={cn(p.estado === "cancelado" && "bg-superficie/40")}
                  >
                    <button
                      type="button"
                      onClick={() => setAbierto(open ? null : p.id)}
                      aria-expanded={open}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 text-left transition-colors hover:bg-superficie/50 sm:grid-cols-[minmax(0,1fr)_12rem_9rem_auto]"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn("truncate font-medium", p.estado === "cancelado" && "text-muted-foreground")}>{p.descripcion}</span>
                          <BadgeSituacionPlan situacion={p.situacion} />
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {p.cuotas_pagadas} de {p.cuotas} cuota{p.cuotas === 1 ? "" : "s"} pagada{p.cuotas === 1 ? "" : "s"} · armado el {formatFecha(p.created_at)}
                          {p.cuotas_vencidas > 0 && p.estado === "vigente" && <span className="text-rose-700"> · {p.cuotas_vencidas} vencida{p.cuotas_vencidas === 1 ? "" : "s"}</span>}
                        </div>
                      </div>
                      <div className="col-span-2 row-start-2 space-y-1 sm:col-span-1 sm:row-start-auto">
                        <Barra valor={p.pagado} total={p.importe_total} tono={p.situacion === "atrasado" ? "rose" : p.situacion === "cancelado" ? "bordo" : "emerald"} />
                        <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
                          <span>{formatImporte(p.pagado)} pagado</span>
                          <span>{Math.round((p.pagado / Math.max(p.importe_total, 0.01)) * 100)}%</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-heading tabular-nums">{formatImporte(p.saldo, "UYU")}</div>
                        <div className={cn("text-[11px]", p.saldo_vencido > 0 ? "text-rose-700" : "text-muted-foreground")}>
                          {p.estado === "cancelado"
                            ? "cancelado"
                            : p.saldo_vencido > 0
                              ? `${formatImporte(p.saldo_vencido)} vencido`
                              : p.proximo_vencimiento
                                ? `vence ${formatFecha(p.proximo_vencimiento)}`
                                : "saldo"}
                        </div>
                      </div>
                      <motion.span animate={{ rotate: open ? 180 : 0 }} className="hidden text-muted-foreground sm:block">
                        <ChevronDown className="size-4" />
                      </motion.span>
                    </button>
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          key="detalle"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3 }}
                          className="overflow-hidden"
                        >
                          <DetallePlan
                            plan={p}
                            pedidoPorId={pedidoPorId}
                            hoy={hoy}
                            puedeCancelar={puedeTesoreria && p.estado === "vigente"}
                            onCancelar={() => setCancelar(p)}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
        <div className="border-t border-linea px-4 py-2">
          <Explicacion>
            El plan no genera asientos: la deuda ya está en la cuenta corriente desde la venta. Los pagos de la disciplina y lo compensado en las
            liquidaciones se imputan a las cuotas, de la más vieja a la más nueva.
          </Explicacion>
        </div>
      </Panel>

      {cancelar && <DialogoCancelar plan={cancelar} disciplina={disciplina} onClose={() => setCancelar(null)} />}
    </>
  );
}

function DetallePlan({
  plan,
  pedidoPorId,
  hoy,
  puedeCancelar,
  onCancelar,
}: {
  plan: PlanPago;
  pedidoPorId: Map<number, PedidoDisciplina>;
  hoy: string;
  puedeCancelar: boolean;
  onCancelar: () => void;
}) {
  return (
    <div className="space-y-4 border-t border-dashed border-linea bg-superficie/30 px-4 py-4">
      {plan.estado === "cancelado" && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-muted-foreground">
          Cancelado {plan.cancelado_at ? `el ${formatFecha(plan.cancelado_at.slice(0, 10))}` : ""}: {plan.motivo_cancelacion}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className="space-y-2">
          <h4 className="text-[10px] font-medium uppercase tracking-editorial text-muted-foreground">Pedidos incluidos</h4>
          <ul className="space-y-1.5">
            {plan.pedidos.map((pp) => {
              const p = pedidoPorId.get(pp.pedido_id);
              return (
                <li key={pp.pedido_id} className="flex items-center justify-between gap-2 rounded-lg border border-linea bg-white px-3 py-2 text-sm">
                  <Link href={`/admin/pedidos/${pp.pedido_id}`} className="group flex min-w-0 items-center gap-1.5 hover:text-bordo-800">
                    <ShoppingBag className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate font-mono text-xs">{p?.numero ?? `#${pp.pedido_id}`}</span>
                    {p?.fecha && <span className="text-[11px] text-muted-foreground">{formatFecha(p.fecha)}</span>}
                    <ArrowUpRight className="size-3 shrink-0 opacity-50 group-hover:opacity-100" />
                  </Link>
                  <span className="shrink-0 tabular-nums">{formatImporte(pp.importe)}</span>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-between px-1 text-xs">
            <span className="text-muted-foreground">Importe del plan</span>
            <span className="font-medium tabular-nums">{formatImporte(plan.importe_total, "UYU")}</span>
          </div>
          {plan.importe_total < plan.pedidos.reduce((s, p) => s + p.importe, 0) - 0.004 && (
            <Explicacion>El plan es menor que el total de los pedidos: ya habían pagado una parte.</Explicacion>
          )}
          {plan.notas && <p className="rounded-lg bg-white px-3 py-2 text-xs text-muted-foreground">{plan.notas}</p>}
        </div>

        <div className="min-w-0 space-y-2">
          <h4 className="text-[10px] font-medium uppercase tracking-editorial text-muted-foreground">Cuotas</h4>
          <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea bg-white">
            {plan.detalle.map((c, i) => (
              <motion.li
                key={c.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 px-3 py-2 text-sm"
              >
                <span className="flex size-6 items-center justify-center rounded-full bg-superficie text-[11px] font-medium tabular-nums">{c.numero}</span>
                <div className="min-w-0">
                  <div className={cn("tabular-nums", c.situacion === "vencida" && "text-rose-700")}>
                    Vence {formatFecha(c.vencimiento)}
                    {c.situacion === "vencida" && <span className="text-[11px]"> · hace {diasEntre(c.vencimiento, hoy)} días</span>}
                  </div>
                  {c.imputaciones.length > 0 && (
                    <ul className="mt-0.5 space-y-0.5 text-[11px] text-muted-foreground">
                      {c.imputaciones.map((a) => (
                        <li key={a.id} className={cn(a.anulada && "line-through opacity-70")}>
                          {formatFecha(a.fecha)} · {a.cobro_id ? "pago de la disciplina" : `liquidación Nº ${a.liquidacion_id}`} · {formatImporte(a.importe)}
                          {a.anulada && " (anulado)"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="tabular-nums">{formatImporte(c.importe)}</span>
                  {c.pagado > 0 && c.saldo > 0 && <span className="text-[11px] tabular-nums text-muted-foreground">saldo {formatImporte(c.saldo)}</span>}
                  <BadgeSituacionCuota situacion={c.situacion} />
                </div>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
      {puedeCancelar && (
        <div className="flex justify-end">
          <Boton variante="peligro" className="h-9 px-3 text-xs" onClick={onCancelar}>
            <Ban className="size-3.5" />
            Cancelar el plan
          </Boton>
        </div>
      )}
    </div>
  );
}

function diasEntre(desde: string, hasta: string) {
  return Math.max(0, Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000));
}

function DialogoCancelar({ plan, disciplina, onClose }: { plan: PlanPago; disciplina: DatosDisciplina; onClose: () => void }) {
  const [motivo, setMotivo] = useState("");
  return (
    <DialogoAccion
      open
      onOpenChange={(o) => !o && onClose()}
      icono={Ban}
      destructivo
      titulo={`Cancelar "${plan.descripcion}"`}
      descripcion={
        <div className="space-y-2">
          <p>
            Lo pagado ({formatImporte(plan.pagado, "UYU")}) queda imputado a sus cuotas. El saldo ({formatImporte(plan.saldo, "UYU")}) vuelve a ser deuda
            general de la disciplina y sus pedidos quedan libres para armar otro plan.
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="size-3.5" />
            La cuenta corriente no cambia: el plan no tiene asientos.
          </p>
        </div>
      }
      textoAccion="Cancelar el plan"
      mensaje="Plan cancelado"
      deshabilitado={motivo.trim().length < 3}
      ejecutar={async () => {
        const r = await cancelarPlanPago({ disciplina_id: disciplina.id, id: plan.id, motivo: motivo.trim() });
        return r.ok ? { ok: true } : r;
      }}
    >
      <Campo etiqueta="Motivo" ayuda="Queda registrado en el plan.">
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          autoFocus
          className={cn(claseControl, "h-auto py-2")}
          placeholder="Ej: se rearma con más cuotas"
        />
      </Campo>
    </DialogoAccion>
  );
}
