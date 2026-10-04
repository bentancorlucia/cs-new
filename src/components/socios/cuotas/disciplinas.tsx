"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, Calculator, History, Pencil, Receipt, Send, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth } from "@/lib/motion";
import {
  finMes,
  inicioMes,
  r2,
  sumarDias,
  sumarMeses,
  type CuentaDisponible,
  type DisciplinaCobranza,
  type LiquidacionDisciplinaLista,
  type PreviaLiquidacionDisciplina,
} from "@/lib/socios/cuotas";
import type { PlanVigente } from "@/lib/socios/disciplinas";
import {
  anularLiquidacionDisciplina,
  guardarDisciplinaCobranza,
  liquidarDisciplina,
  previsualizarDisciplina,
} from "@/app/(dashboard)/cuotas/actions";
import {
  Aviso,
  BadgeEstado,
  Boton,
  Campo,
  DialogoAccion,
  DialogoAnular,
  EncabezadoPagina,
  Explicacion,
  ImporteAnimado,
  LinkAsiento,
  Panel,
  Pastilla,
  Vacio,
  claseControl,
} from "./ui";

function rangoSugerido(d: DisciplinaCobranza | undefined, hoy: string) {
  const mesPasado = sumarMeses(inicioMes(hoy), -1);
  const desde = d?.ultimaLiquidacion ? sumarDias(d.ultimaLiquidacion, 1) : mesPasado;
  let hasta = finMes(mesPasado);
  if (hasta < desde) hasta = hoy;
  return { desde, hasta };
}

export function DisciplinasVista({
  disciplinas,
  liquidaciones,
  cuentas,
  cuentaDefecto,
  hoy,
  puedeOperar,
  planesPago = [],
}: {
  disciplinas: DisciplinaCobranza[];
  liquidaciones: LiquidacionDisciplinaLista[];
  cuentas: CuentaDisponible[];
  cuentaDefecto: string | null;
  hoy: string;
  puedeOperar: boolean;
  /** Planes de pago vigentes con saldo: lo compensado se puede imputar a sus cuotas. */
  planesPago?: PlanVigente[];
}) {
  const router = useRouter();
  const [discId, setDiscId] = useState<number | "">("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [previa, setPrevia] = useState<{ clave: string; datos: PreviaLiquidacionDisciplina } | null>(null);
  const [compensar, setCompensar] = useState("");
  const [cuentaId, setCuentaId] = useState(cuentaDefecto ?? cuentas[0]?.id ?? "");
  const [fecha, setFecha] = useState(hoy);
  const [notas, setNotas] = useState("");
  const [planId, setPlanId] = useState<number | "">("");
  const [calculando, start] = useTransition();
  const [confirmar, setConfirmar] = useState(false);
  const [editar, setEditar] = useState<DisciplinaCobranza | null>(null);
  const [anular, setAnular] = useState<LiquidacionDisciplinaLista | null>(null);

  const disc = disciplinas.find((d) => d.id === discId);
  const clave = `${discId}|${desde}|${hasta}`;
  const p = previa && previa.clave === clave ? previa.datos : null;
  const montoComp = Number(compensar.replace(",", ".")) || 0;
  const transferir = p ? r2(p.importe - montoComp) : 0;
  const maxComp = p ? r2(Math.max(0, Math.min(p.importe, p.deuda))) : 0;
  const planesDisc = planesPago.filter((pl) => pl.disciplina_id === discId);
  const planElegido = montoComp > 0 ? planesDisc.find((pl) => pl.id === planId) : undefined;

  function elegir(id: number | "") {
    setDiscId(id);
    const r = rangoSugerido(disciplinas.find((d) => d.id === id), hoy);
    setDesde(r.desde);
    setHasta(r.hasta);
    setPrevia(null);
    setPlanId("");
  }

  function calcular() {
    if (!discId || !desde || !hasta) return;
    start(async () => {
      const r = await previsualizarDisciplina({ disciplina_id: Number(discId), desde, hasta });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setPrevia({ clave, datos: r.data });
      setCompensar(String(r2(Math.max(0, Math.min(r.data.importe, r.data.deuda)))));
    });
  }

  const errores: string[] = [];
  if (p) {
    if (p.yaLiquidado) errores.push("Ese período ya se liquidó (total o parcialmente)");
    if (p.importe <= 0) errores.push("No hay nada para liquidar en el período");
    if (montoComp < 0 || montoComp > maxComp) errores.push(`Lo compensado va de 0 a ${formatImporte(maxComp)}`);
    if (transferir > 0 && !cuentaId) errores.push("Elegí la cuenta desde la que se transfiere");
  }

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Cuotas y cobranza"
        titulo="Liquidación a disciplinas"
        descripcion="Lo cobrado de las cuotas de cada disciplina, menos su parte de la comisión del débito, se le liquida; puede compensar lo que le debe al club."
      />

      <Panel titulo="Liquidar" icono={Calculator} delay={0.04}>
        <div className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_10rem_auto] sm:items-end">
            <Campo etiqueta="Disciplina">
              <select value={discId} onChange={(e) => elegir(e.target.value ? Number(e.target.value) : "")} className={claseControl}>
                <option value="">Elegí…</option>
                {disciplinas.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Desde">
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={claseControl} disabled={!discId} />
            </Campo>
            <Campo etiqueta="Hasta">
              <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className={claseControl} disabled={!discId} />
            </Campo>
            <Boton onClick={calcular} pendiente={calculando} disabled={!discId || !desde || !hasta}>
              Calcular
            </Boton>
          </div>
          {disc?.ultimaLiquidacion && (
            <p className="text-xs text-muted-foreground">Última liquidación vigente hasta el {formatFecha(disc.ultimaLiquidacion)}.</p>
          )}

          <AnimatePresence mode="wait">
            {p && (
              <motion.div key={clave} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={easeSmooth} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Cifra etiqueta="Cobrado" valor={p.cobrado} texto="Lo aplicado a cuotas de la disciplina en el período (cobros y saldo a favor, por fecha de aplicación)." />
                  <Cifra etiqueta="Comisión" valor={p.comision} texto="Su parte de la comisión del débito Visa acreditado en el período." negativo />
                  <Cifra etiqueta="A liquidar" valor={p.importe} texto="Cobrado menos comisión: lo que le corresponde a la disciplina." fuerte />
                  <Cifra
                    etiqueta="Deuda con el club"
                    valor={p.deuda}
                    texto="Lo que la disciplina le debe al club: cuotas cobradas en su cuenta y pedidos de tienda a cuenta corriente."
                    alerta={p.deuda > 0}
                  />
                </div>
                {p.yaLiquidado && <Aviso titulo="Ese período ya se liquidó a la disciplina (total o parcialmente)">Elegí fechas posteriores a la última liquidación o anulala primero.</Aviso>}

                {puedeOperar && p.importe > 0 && !p.yaLiquidado && (
                  <div className="grid gap-4 rounded-2xl border border-bordo-100 bg-bordo-50/30 p-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Campo etiqueta="Compensar de su deuda ($)" ayuda={`Máximo ${formatImporte(maxComp)}: el menor entre lo liquidado y la deuda.`}>
                        <input inputMode="decimal" value={compensar} onChange={(e) => setCompensar(e.target.value.replace(/[^\d.,]/g, ""))} className={cn(claseControl, "text-right tabular-nums")} />
                      </Campo>
                      <Campo etiqueta="Fecha">
                        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={claseControl} />
                      </Campo>
                      <AnimatePresence initial={false}>
                        {transferir > 0 && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="sm:col-span-2">
                            <Campo etiqueta="Se transfiere desde">
                              <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className={claseControl}>
                                {cuentas.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.codigo} · {c.nombre}
                                  </option>
                                ))}
                              </select>
                            </Campo>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <AnimatePresence initial={false}>
                        {montoComp > 0 && planesDisc.length > 0 && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="sm:col-span-2">
                            <Campo
                              etiqueta="Imputar a un plan de pago"
                              ayuda={
                                planElegido
                                  ? `Lo compensado se aplica a las cuotas más viejas del plan (saldo ${formatImporte(planElegido.saldo)}${planElegido.saldo_vencido > 0 ? `, ${formatImporte(planElegido.saldo_vencido)} vencido` : ""}).`
                                  : "Opcional: lo compensado baja la deuda igual; elegí un plan para que cuente como pago de sus cuotas."
                              }
                            >
                              <select value={planId} onChange={(e) => setPlanId(e.target.value ? Number(e.target.value) : "")} className={claseControl}>
                                <option value="">No imputar a un plan</option>
                                {planesDisc.map((pl) => (
                                  <option key={pl.id} value={pl.id}>
                                    {pl.descripcion} · saldo {formatImporte(pl.saldo)}
                                  </option>
                                ))}
                              </select>
                            </Campo>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <Campo etiqueta="Notas" className="sm:col-span-2">
                        <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" className={claseControl} maxLength={500} />
                      </Campo>
                      {disc?.datos_transferencia && <Explicacion className="sm:col-span-2">Datos para la transferencia: {disc.datos_transferencia}</Explicacion>}
                    </div>
                    <div className="space-y-2 rounded-xl border border-linea bg-white p-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">A liquidar</span>
                        <span className="tabular-nums">{formatImporte(p.importe)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Compensado</span>
                        <ImporteAnimado valor={-montoComp} />
                      </div>
                      <div className="flex items-baseline justify-between border-t border-linea pt-2">
                        <span className="font-medium">Se transfiere</span>
                        <ImporteAnimado valor={transferir} moneda="UYU" className="font-heading text-lg text-bordo-800" />
                      </div>
                      <Explicacion>Gasto de la disciplina (5.2.09) contra su deuda y el banco.</Explicacion>
                      <Boton className="w-full" disabled={errores.length > 0} onClick={() => setConfirmar(true)}>
                        <Send className="size-4" />
                        Liquidar
                      </Boton>
                      {errores.length > 0 && <p className="text-center text-[11px] text-rose-700">{errores[0]}</p>}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Panel>

      <Panel titulo="Configuración por disciplina" icono={Settings2} delay={0.08}>
        <ul className="divide-y divide-linea">
          {disciplinas.map((d, i) => (
            <motion.li
              key={d.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...easeSmooth, delay: Math.min(i, 14) * 0.02 }}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm sm:grid-cols-[minmax(0,12rem)_8rem_minmax(0,1fr)_9rem_auto]"
            >
              <div className="truncate font-medium">{d.nombre}</div>
              <div className="text-right sm:text-left">
                <Pastilla tono={d.configurada ? "info" : "neutro"}>{d.porcentaje}% comisión</Pastilla>
              </div>
              <div className="col-span-2 truncate text-xs text-muted-foreground sm:col-span-1">{d.datos_transferencia ?? "Sin datos de transferencia"}</div>
              <div className={cn("text-xs tabular-nums sm:text-right sm:text-sm", (d.deuda ?? 0) > 0 && "text-rose-700")}>
                {d.deuda == null ? "" : d.deuda > 0 ? `Debe ${formatImporte(d.deuda)}` : <span className="text-muted-foreground">Sin deuda</span>}
              </div>
              <div className="flex justify-end">
                {puedeOperar && (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setEditar(d)}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-superficie hover:text-bordo-800"
                    aria-label={`Editar ${d.nombre}`}
                  >
                    <Pencil className="size-4" />
                  </motion.button>
                )}
              </div>
            </motion.li>
          ))}
        </ul>
        <div className="border-t border-linea px-4 py-2">
          <Explicacion>Porcentaje: qué parte de la comisión del débito sobre las cuotas de la disciplina se le descuenta (100 % si no se configuró).</Explicacion>
        </div>
      </Panel>

      <Panel titulo="Liquidaciones" icono={History} delay={0.12}>
        {liquidaciones.length === 0 ? (
          <div className="p-4">
            <Vacio icono={Receipt} titulo="Todavía no se liquidó a ninguna disciplina" />
          </div>
        ) : (
          <ul className="divide-y divide-linea">
            {liquidaciones.map((l, i) => (
              <motion.li
                key={l.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...easeSmooth, delay: Math.min(i, 10) * 0.03 }}
                className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_9rem_auto]", l.estado === "anulada" && "opacity-60")}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{l.disciplina}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatFecha(l.desde)} – {formatFecha(l.hasta)}
                  </div>
                </div>
                <div className="col-span-2 row-start-2 text-xs text-muted-foreground sm:col-span-1 sm:row-start-auto">
                  Cobrado {formatImporte(l.cobrado)} · comisión {formatImporte(l.comision)} · compensado {formatImporte(l.compensado)}
                  {l.notas && <div className="truncate">{l.notas}</div>}
                  {l.motivo_anulacion && <div className="text-rose-700">Anulada: {l.motivo_anulacion}</div>}
                </div>
                <div className="text-right">
                  <div className="font-heading tabular-nums">{formatImporte(l.transferido, "UYU")}</div>
                  <div className="text-[11px] text-muted-foreground">transferido el {formatFecha(l.fecha)}</div>
                </div>
                <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 sm:col-span-1">
                  <BadgeEstado estado={l.estado} />
                  <LinkAsiento id={l.asiento_id} />
                  {puedeOperar && l.estado === "vigente" && (
                    <Boton variante="peligro" className="h-8 px-3 text-xs" onClick={() => setAnular(l)}>
                      <Ban className="size-3.5" />
                      Anular
                    </Boton>
                  )}
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </Panel>

      {p && disc && (
        <DialogoAccion
          open={confirmar}
          onOpenChange={setConfirmar}
          icono={Send}
          titulo={`Liquidar a ${disc.nombre}`}
          descripcion={
            <span>
              Del {formatFecha(desde)} al {formatFecha(hasta)}: {formatImporte(p.importe, "UYU")} a liquidar,{" "}
              {formatImporte(montoComp, "UYU")} compensados de su deuda
              {planElegido ? ` (imputados a "${planElegido.descripcion}")` : ""} y {formatImporte(transferir, "UYU")} transferidos. Después no
              se pueden registrar cobros de la disciplina con fecha dentro del período.
            </span>
          }
          textoAccion="Liquidar"
          mensaje="Liquidación registrada"
          alTerminar={() => {
            setPrevia(null);
            setNotas("");
            setPlanId("");
            router.refresh();
          }}
          ejecutar={async () => {
            const r = await liquidarDisciplina({
              disciplina_id: disc.id,
              desde,
              hasta,
              fecha,
              compensar: montoComp,
              cuenta_id: transferir > 0 ? cuentaId || null : null,
              notas: notas.trim() || null,
              plan_id: planElegido?.id ?? null,
            });
            return r.ok ? { ok: true } : r;
          }}
        />
      )}

      {editar && <EditarDisciplina key={editar.id} disciplina={editar} onClose={() => setEditar(null)} />}

      <DialogoAnular
        open={!!anular}
        onOpenChange={(o) => !o && setAnular(null)}
        titulo={`Anular la liquidación a ${anular?.disciplina ?? ""}`}
        descripcion="Se revierte el asiento: la deuda compensada vuelve a la disciplina y el período queda libre para liquidarse de nuevo."
        anular={(motivo) => anularLiquidacionDisciplina({ id: anular!.id, motivo })}
      />
    </div>
  );
}

function Cifra({
  etiqueta,
  valor,
  texto,
  fuerte,
  alerta,
  negativo,
}: {
  etiqueta: string;
  valor: number;
  texto: string;
  fuerte?: boolean;
  alerta?: boolean;
  negativo?: boolean;
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className={cn(
        "space-y-1 rounded-2xl border bg-white p-3",
        fuerte ? "border-emerald-200 bg-emerald-50/40" : alerta ? "border-rose-200" : "border-linea"
      )}
    >
      <div className="text-[10px] uppercase tracking-editorial text-muted-foreground">{etiqueta}</div>
      <ImporteAnimado
        valor={negativo ? -valor : valor}
        moneda="UYU"
        className={cn("font-heading text-lg", fuerte && "text-emerald-800", alerta && "text-rose-700")}
      />
      <Explicacion>{texto}</Explicacion>
    </motion.div>
  );
}

function EditarDisciplina({ disciplina, onClose }: { disciplina: DisciplinaCobranza; onClose: () => void }) {
  const [porcentaje, setPorcentaje] = useState(String(disciplina.porcentaje));
  const [datos, setDatos] = useState(disciplina.datos_transferencia ?? "");
  const n = Number(porcentaje.replace(",", "."));
  return (
    <DialogoAccion
      open
      onOpenChange={(o) => !o && onClose()}
      icono={Settings2}
      titulo={disciplina.nombre}
      descripcion="Cómo se le liquidan las cuotas a la disciplina."
      textoAccion="Guardar"
      mensaje="Guardado"
      deshabilitado={!Number.isFinite(n) || n < 0 || n > 100}
      ejecutar={async () => {
        const r = await guardarDisciplinaCobranza({ disciplina_id: disciplina.id, porcentaje: n, datos_transferencia: datos.trim() || null });
        return r.ok ? { ok: true } : r;
      }}
    >
      <Campo etiqueta="Parte de la comisión del débito (%)" ayuda="Sobre lo cobrado de sus cuotas por débito Visa. El resto lo absorbe el club.">
        <input inputMode="decimal" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} className={cn(claseControl, "text-right")} />
      </Campo>
      <Campo etiqueta="Datos para la transferencia" ayuda="Titular, banco y número de cuenta.">
        <textarea value={datos} onChange={(e) => setDatos(e.target.value)} rows={3} className={cn(claseControl, "h-auto py-2")} />
      </Campo>
    </DialogoAccion>
  );
}
