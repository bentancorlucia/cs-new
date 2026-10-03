"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, HandCoins, Layers, Scale, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth } from "@/lib/motion";
import { NOMBRE_MEDIO, nombrePeriodo, type ResumenCuotas } from "@/lib/socios/cuotas";
import {
  Aviso,
  Barra,
  BotonLink,
  EncabezadoPagina,
  Explicacion,
  ImporteAnimado,
  Kpi,
  NumeroAnimado,
  Panel,
} from "./ui";

const TONO_MEDIO = {
  debito_visa: "sky",
  transferencia_club: "bordo",
  transferencia_disciplina: "violet",
  efectivo: "emerald",
} as const;

export function ResumenCuotasVista({
  resumen: r,
  error,
  puedeCobrar,
  puedeTesoreria,
  verTesoreria,
}: {
  resumen: ResumenCuotas | null;
  error: string | null;
  puedeCobrar: boolean;
  puedeTesoreria: boolean;
  verTesoreria: boolean;
}) {
  const diferencias = r?.control?.filter((c) => Math.abs(c.diferencia) >= 0.005) ?? [];
  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Socios"
        titulo="Cuotas y cobranza"
        descripcion={r ? `Situación al ${formatFecha(r.fecha)}` : undefined}
      >
        {puedeTesoreria && (
          <BotonLink href="/cuotas/lotes" variante="secundario">
            <Layers className="size-4" />
            Emitir cuotas
          </BotonLink>
        )}
        {puedeCobrar && (
          <BotonLink href="/cuotas/cobros/nuevo">
            <HandCoins className="size-4" />
            Registrar cobro
          </BotonLink>
        )}
      </EncabezadoPagina>

      {error && <Aviso titulo="No se pudo leer la cobranza">{error}</Aviso>}

      {diferencias.length > 0 && (
        <Aviso titulo="El control contable no cierra">
          {diferencias.map((d) => (
            <div key={d.concepto}>
              {d.concepto}: según socios {formatImporte(d.segun_socios, "UYU")}, según contabilidad{" "}
              {formatImporte(d.segun_contabilidad, "UYU")} (diferencia {formatImporte(d.diferencia)}).
            </div>
          ))}
          <div className="mt-1">Revisá asientos manuales sobre estas cuentas o asientos en borrador.</div>
        </Aviso>
      )}

      {r && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi etiqueta="Deuda total" delay={0.03} detalle={`${r.conDeuda} persona${r.conDeuda === 1 ? "" : "s"} con saldo`}>
              <ImporteAnimado valor={r.deudaTotal} moneda="UYU" />
            </Kpi>
            <Kpi etiqueta="Deuda vencida" tono={r.deudaVencida > 0 ? "alerta" : "neutro"} delay={0.06} detalle="Cuotas con vencimiento pasado">
              <ImporteAnimado valor={r.deudaVencida} moneda="UYU" />
            </Kpi>
            <Kpi etiqueta="Socios al día" tono="bueno" delay={0.09} detalle={`de ${r.socios} socios vigentes`}>
              <NumeroAnimado valor={r.alDia} />
            </Kpi>
            <Kpi etiqueta="Socios morosos" tono={r.noAlDia > 0 ? "alerta" : "neutro"} delay={0.12} detalle="Más cuotas vencidas que la tolerancia">
              <NumeroAnimado valor={r.noAlDia} />
            </Kpi>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Panel
              titulo={`Cobrado en ${nombrePeriodo(r.fecha).toLowerCase()}`}
              icono={Wallet}
              delay={0.1}
              accion={
                <Link href="/cuotas/cobros" className="inline-flex items-center gap-1 text-xs text-bordo-800 hover:underline">
                  Ver cobros <ArrowRight className="size-3" />
                </Link>
              }
            >
              <div className="space-y-3 p-4">
                <div className="font-heading text-2xl text-foreground">
                  <ImporteAnimado valor={r.totalCobradoMes} moneda="UYU" />
                </div>
                <ul className="space-y-2.5">
                  {r.cobradoMes.map((m, i) => (
                    <motion.li
                      key={m.medio}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ ...easeSmooth, delay: 0.15 + i * 0.05 }}
                      className="space-y-1"
                    >
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span>
                          {NOMBRE_MEDIO[m.medio]}
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            {m.cantidad} cobro{m.cantidad === 1 ? "" : "s"}
                          </span>
                        </span>
                        <span className="tabular-nums">{formatImporte(m.importe)}</span>
                      </div>
                      <Barra valor={m.importe} total={r.totalCobradoMes} tono={TONO_MEDIO[m.medio as keyof typeof TONO_MEDIO]} />
                    </motion.li>
                  ))}
                </ul>
                <Explicacion>Cobros vigentes con fecha en el mes, del día 1 hasta hoy.</Explicacion>
              </div>
            </Panel>

            <div className="space-y-4">
              <Panel
                titulo="Último lote emitido"
                icono={Layers}
                delay={0.14}
                accion={
                  verTesoreria ? (
                    <Link href="/cuotas/lotes" className="inline-flex items-center gap-1 text-xs text-bordo-800 hover:underline">
                      Emisión <ArrowRight className="size-3" />
                    </Link>
                  ) : undefined
                }
              >
                {r.ultimoLote ? (
                  <div className="space-y-3 p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="font-heading text-lg">{nombrePeriodo(r.ultimoLote.periodo)}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.ultimoLote.cantidad} cuotas · vence {formatFecha(r.ultimoLote.fecha_vencimiento)}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <div className="text-[10px] uppercase tracking-editorial text-muted-foreground">Emitido</div>
                        <div className="tabular-nums">{formatImporte(r.ultimoLote.importe_total)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-editorial text-muted-foreground">Cobrado</div>
                        <div className="tabular-nums text-emerald-700">{formatImporte(r.ultimoLote.cobrado)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-editorial text-muted-foreground">Pendiente</div>
                        <div className="tabular-nums">{formatImporte(r.ultimoLote.pendiente)}</div>
                      </div>
                    </div>
                    <Barra valor={r.ultimoLote.cobrado} total={Number(r.ultimoLote.importe_total)} tono="emerald" />
                    <Explicacion>Cobrado incluye notas de crédito; pendiente es el saldo de sus cuotas hoy.</Explicacion>
                  </div>
                ) : (
                  <p className="p-4 text-sm text-muted-foreground">Todavía no se emitió ningún lote.</p>
                )}
              </Panel>

              <Panel titulo="Saldo a favor" icono={HandCoins} delay={0.18}>
                <div className="space-y-1 p-4">
                  <div className="font-heading text-xl">
                    <ImporteAnimado valor={r.saldoAFavor} moneda="UYU" />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.personasConSaldoAFavor} persona{r.personasConSaldoAFavor === 1 ? "" : "s"} pagaron de más; se aplica solo
                    al emitir sus próximas cuotas.
                  </div>
                </div>
              </Panel>
            </div>
          </div>

          {r.control && (
            <Panel
              titulo="Control contable"
              icono={Scale}
              delay={0.22}
              accion={
                diferencias.length === 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                    <CheckCircle2 className="size-3.5" /> Coincide
                  </span>
                ) : undefined
              }
            >
              <div className="divide-y divide-linea">
                {r.control.map((c) => {
                  const mal = Math.abs(c.diferencia) >= 0.005;
                  return (
                    <div key={c.concepto} className="grid grid-cols-2 gap-x-3 gap-y-1 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_9rem_9rem_8rem]">
                      <div className="col-span-2 font-medium sm:col-span-1">{c.concepto}</div>
                      <div className="text-xs text-muted-foreground sm:text-right sm:text-sm sm:text-foreground">
                        <span className="sm:hidden">Socios </span>
                        <span className="tabular-nums">{formatImporte(c.segun_socios)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground sm:text-right sm:text-sm sm:text-foreground">
                        <span className="sm:hidden">Contabilidad </span>
                        <span className="tabular-nums">{formatImporte(c.segun_contabilidad)}</span>
                      </div>
                      <div className={cn("col-span-2 text-right font-medium tabular-nums sm:col-span-1", mal ? "text-rose-700" : "text-emerald-700")}>
                        {mal ? formatImporte(c.diferencia) : "0,00"}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-linea px-4 py-2">
                <Explicacion>
                  Lo que dicen las cuotas y el saldo a favor contra el saldo de sus cuentas contables. La diferencia tiene que ser 0.
                </Explicacion>
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
