"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, CalendarClock, ChevronDown, ChevronRight, Download, Receipt } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { r2 } from "@/lib/socios/cuotas";
import { mesLiquidacion } from "@/lib/socios/liquidacion-resumen";
import {
  AYUDA_TIPO_MOVIMIENTO,
  NOMBRE_CUENTA_MOVIMIENTO,
  NOMBRE_TIPO_MOVIMIENTO,
  type TipoMovimiento,
} from "@/lib/socios/disciplinas";
import type { CuentaDisciplina, PlanPagoDisc, SaldosDisciplina } from "@/lib/socios/panel-disciplina";
import { Barra, Boton, Explicacion, Filtros, Panel, Vacio } from "@/components/socios/cuotas/ui";
import { importeEnCuenta } from "@/components/socios/disciplinas/cuenta-corriente";
import {
  BadgeSituacionCuota,
  BadgeSituacionPlan,
  BadgeTipoMovimiento,
  CLASE_CUENTA,
  Cifra,
  ImporteContador,
  SaldoNeto,
  claseSaldo,
  exportarExcel,
} from "@/components/socios/disciplinas/ui";

const PAGINA = 40;

function NetoFila({ neto, className }: { neto: number; className?: string }) {
  const abs = Math.abs(neto);
  return (
    <span className={cn("tabular-nums", claseSaldo(neto), className)}>
      {abs < 0.005 ? "0,00" : `${neto > 0 ? "Debe" : "Le deben"} ${formatImporte(abs)}`}
    </span>
  );
}

export function CuentaPanel({
  cuenta,
  saldos: saldosResumen,
  hoy,
  verLiquidacion,
}: {
  cuenta: CuentaDisciplina | null;
  saldos: SaldosDisciplina | null;
  hoy: string;
  verLiquidacion: (id: number) => void;
}) {
  const [tipo, setTipo] = useState<TipoMovimiento | "todos">("todos");
  const [mostrar, setMostrar] = useState(PAGINA);
  if (!cuenta) return null;
  const saldos = cuenta.saldos ?? saldosResumen;
  const debe = saldos?.debe_al_club ?? 0;
  const leDeben = saldos?.club_le_debe ?? 0;
  const neto = saldos?.saldo ?? r2(debe - leDeben);

  const movimientos = cuenta.movimientos;
  const filtrados = movimientos.filter((m) => tipo === "todos" || m.tipo === tipo);
  const visibles = filtrados.slice(0, mostrar);
  const tipos = (Object.keys(NOMBRE_TIPO_MOVIMIENTO) as TipoMovimiento[]).filter((t) => movimientos.some((m) => m.tipo === t));
  const planes = cuenta.planes_pago.filter((p) => p.estado === "vigente");
  const planesCerrados = cuenta.planes_pago.filter((p) => p.estado !== "vigente");

  async function exportar() {
    try {
      await exportarExcel(
        `cuenta-con-el-club-${hoy}.xlsx`,
        "Cuenta con el club",
        ["Fecha", "Tipo", "Cuenta", "Descripción", "Debe la disciplina", "Le debe el club", "Saldo neto (+ debe la disciplina)"],
        [...filtrados].reverse().map((m) => [
          formatFecha(m.fecha),
          NOMBRE_TIPO_MOVIMIENTO[m.tipo],
          NOMBRE_CUENTA_MOVIMIENTO[m.cuenta],
          m.descripcion,
          m.cuenta === "disciplina_debe" ? importeEnCuenta(m) : null,
          m.cuenta === "club_debe" ? importeEnCuenta(m) : null,
          m.saldo,
        ]),
        [11, 20, 18, 48, 16, 16, 18]
      );
    } catch {
      toast.error("No se pudo armar el Excel");
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Cifra etiqueta="La disciplina debe" icono={BookOpen} tono={debe > 0 ? "alerta" : "neutro"} detalle="Compras en la tienda, cobros recibidos y préstamos">
          <ImporteContador valor={debe} moneda="UYU" />
        </Cifra>
        <Cifra etiqueta="El club le debe" tono={leDeben > 0 ? "dorado" : "neutro"} delay={0.04} detalle="Liquidaciones a pagar">
          <ImporteContador valor={leDeben} moneda="UYU" className={leDeben > 0 ? "text-amber-700" : undefined} />
        </Cifra>
        <div className="col-span-2 lg:col-span-1">
          <Cifra etiqueta="Saldo neto" delay={0.08} detalle={saldos?.ultimo_movimiento ? `Último movimiento: ${formatFecha(saldos.ultimo_movimiento)}` : "Lo que debe menos lo que le deben"}>
            <SaldoNeto neto={neto} />
          </Cifra>
        </div>
      </div>

      {cuenta.liquidaciones_pendientes.length > 0 && (
        <Panel titulo="Liquidaciones que el club tiene que pagar" icono={Receipt} delay={0.06}>
          <ul className="divide-y divide-linea">
            {cuenta.liquidaciones_pendientes.map((l, i) => (
              <motion.li key={l.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 + i * 0.03 }}>
                <button
                  type="button"
                  onClick={() => verLiquidacion(l.id)}
                  className="group flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-superficie/60"
                >
                  <span className="capitalize">{mesLiquidacion(l.periodo)}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-right">
                      <span className="block tabular-nums text-amber-700">{formatImporte(l.saldo)}</span>
                      {l.saldo < l.importe && <span className="block text-[11px] text-muted-foreground">de {formatImporte(l.importe)}</span>}
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>
              </motion.li>
            ))}
          </ul>
        </Panel>
      )}

      {(planes.length > 0 || planesCerrados.length > 0) && (
        <Panel titulo="Planes de pago con el club" icono={CalendarClock} delay={0.1}>
          <div className="divide-y divide-linea">
            {[...planes, ...planesCerrados].map((p) => (
              <PlanPago key={p.id} p={p} hoy={hoy} />
            ))}
          </div>
        </Panel>
      )}

      <Panel
        titulo="Movimientos"
        icono={BookOpen}
        delay={0.12}
        accion={
          <Boton variante="secundario" className="h-9 px-3 text-xs" onClick={exportar} disabled={filtrados.length === 0}>
            <Download className="size-3.5" />
            Excel
          </Boton>
        }
      >
        {movimientos.length > 0 && (
          <div className="space-y-2 border-b border-linea p-4">
            <Filtros<TipoMovimiento | "todos">
              id="mov-disc"
              valor={tipo}
              onChange={(v) => {
                setTipo(v);
                setMostrar(PAGINA);
              }}
              opciones={[
                { valor: "todos", etiqueta: "Todos", cantidad: movimientos.length },
                ...tipos.map((t) => ({ valor: t, etiqueta: NOMBRE_TIPO_MOVIMIENTO[t], cantidad: movimientos.filter((m) => m.tipo === t).length })),
              ]}
            />
            {tipo !== "todos" && <Explicacion>{AYUDA_TIPO_MOVIMIENTO[tipo]}</Explicacion>}
          </div>
        )}
        {filtrados.length === 0 ? (
          <div className="p-4">
            <Vacio icono={BookOpen} titulo="Sin movimientos con el club" />
          </div>
        ) : (
          <ul className="divide-y divide-linea">
            <AnimatePresence initial={false}>
              {visibles.map((m, i) => {
                const importe = importeEnCuenta(m);
                return (
                  <motion.li
                    key={m.clave}
                    layout="position"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(i, 15) * 0.02 }}
                    className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <BadgeTipoMovimiento tipo={m.tipo} />
                        <span className="text-[11px] text-muted-foreground tabular-nums">{formatFecha(m.fecha)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground sm:text-sm sm:text-foreground">{m.descripcion}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className={cn("tabular-nums", CLASE_CUENTA[m.cuenta])}>
                        {importe >= 0 ? "+" : "−"}
                        {formatImporte(Math.abs(importe))}
                      </span>
                      <span className={cn("text-[10px]", CLASE_CUENTA[m.cuenta])}>{NOMBRE_CUENTA_MOVIMIENTO[m.cuenta].toLowerCase()}</span>
                      <NetoFila neto={m.saldo} className="text-[11px]" />
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
        {filtrados.length > visibles.length && (
          <div className="border-t border-linea px-4 py-3 text-center">
            <button type="button" onClick={() => setMostrar((n) => n + PAGINA)} className="text-xs font-medium text-bordo-800 hover:underline">
              Ver {Math.min(PAGINA, filtrados.length - visibles.length)} movimientos anteriores
            </button>
          </div>
        )}
        <div className="border-t border-linea px-4 py-2">
          <Explicacion>
            &quot;Debe&quot;: la disciplina le debe al club (compras en la tienda, cuotas que cobró directamente, préstamos). &quot;Le deben&quot;: el club le
            debe a la disciplina por liquidaciones. Al pagar una liquidación, el club puede descontar lo que la disciplina le debe.
          </Explicacion>
        </div>
      </Panel>
    </>
  );
}

function PlanPago({ p, hoy }: { p: PlanPagoDisc; hoy: string }) {
  const [abierto, setAbierto] = useState(p.estado === "vigente" && p.situacion === "atrasado");
  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        className={cn("w-full space-y-2 px-4 py-3 text-left transition-colors hover:bg-superficie/50", p.estado !== "vigente" && "opacity-70")}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-medium">{p.descripcion || `Plan ${p.id}`}</div>
            <div className="text-[11px] text-muted-foreground">
              {p.cuotas_pagadas}/{p.cuotas_total} cuotas pagas
              {p.proximo_vencimiento && p.estado === "vigente" ? ` · próxima ${formatFecha(p.proximo_vencimiento)}` : ""}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <BadgeSituacionPlan situacion={p.estado === "vigente" ? p.situacion : p.estado === "cancelado" ? "cancelado" : p.situacion} />
            <motion.span animate={{ rotate: abierto ? 180 : 0 }}>
              <ChevronDown className="size-4 text-muted-foreground" />
            </motion.span>
          </div>
        </div>
        <Barra valor={p.pagado} total={p.importe_total} tono={p.situacion === "atrasado" ? "rose" : "emerald"} />
        <div className="flex justify-between text-[11px] tabular-nums text-muted-foreground">
          <span>Pagado {formatImporte(p.pagado)}</span>
          <span>
            Saldo {formatImporte(p.saldo)}
            {p.saldo_vencido > 0 && <span className="text-rose-700"> · vencido {formatImporte(p.saldo_vencido)}</span>}
          </span>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {abierto && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="divide-y divide-linea/70 overflow-hidden bg-superficie/30"
          >
            {p.cuotas.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2 text-xs">
                <span>
                  Cuota {c.numero} ·{" "}
                  <span className={cn(c.saldo > 0 && c.vencimiento < hoy ? "text-rose-700" : "text-muted-foreground")}>vence {formatFecha(c.vencimiento)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">{formatImporte(c.importe)}</span>
                  <BadgeSituacionCuota situacion={c.situacion} />
                </span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
