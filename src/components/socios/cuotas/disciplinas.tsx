"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  Calculator,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  History,
  Loader2,
  Pencil,
  Send,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth } from "@/lib/motion";
import {
  inicioMes,
  nombrePeriodo,
  r2,
  sumarMeses,
  type CuentaDisponible,
  type DisciplinaCobranza,
  type FilaLiquidacionMes,
  type LiquidacionDisciplinaLista,
} from "@/lib/socios/cuotas";
import type { PlanVigente } from "@/lib/socios/disciplinas";
import { guardarDisciplinaCobranza, liquidarMes, type ResultadoLiquidarMes } from "@/app/(dashboard)/cuotas/actions";
import {
  Aviso,
  Boton,
  Campo,
  DialogoAccion,
  EncabezadoPagina,
  Explicacion,
  ImporteAnimado,
  Kpi,
  NumeroAnimado,
  Panel,
  Pastilla,
  claseControl,
} from "./ui";
import { HojaLiquidacion, ListaLiquidaciones, ResultadoLiquidacion, avisarResultadoMail } from "./liquidaciones";

/** Hay algo para liquidar: cobros, social a cargo o gastos. */
const conMovimiento = (f: FilaLiquidacionMes) =>
  f.visa_cobrado > 0 || f.otros_cobrado > 0 || f.social_a_cargo > 0 || f.gastos_comision + f.gastos_iva > 0 || f.resultado !== 0;

export function DisciplinasVista({
  periodo,
  previa,
  errorPrevia,
  disciplinas,
  liquidaciones,
  cuentas,
  cuentaDefecto,
  hoy,
  puedeOperar,
  planesPago = [],
  deudas = {},
}: {
  /** Mes que se está liquidando ("YYYY-MM-01"). */
  periodo: string;
  previa: FilaLiquidacionMes[] | null;
  errorPrevia: string | null;
  disciplinas: DisciplinaCobranza[];
  liquidaciones: LiquidacionDisciplinaLista[];
  cuentas: CuentaDisponible[];
  cuentaDefecto: string | null;
  hoy: string;
  puedeOperar: boolean;
  /** Planes de pago vigentes con saldo: lo compensado al pagar se puede imputar a sus cuotas. */
  planesPago?: PlanVigente[];
  /** Lo que cada disciplina le debe al club (tope de la compensación al pagar). */
  deudas?: Record<number, number>;
}) {
  const [editar, setEditar] = useState<DisciplinaCobranza | null>(null);
  const [ver, setVer] = useState<number | null>(null);
  const [filtroMes, setFiltroMes] = useState<string>("");
  const [filtroDisc, setFiltroDisc] = useState<number | "">("");

  const pendientes = liquidaciones.filter((l) => l.estado === "vigente" && l.saldo > 0);
  const totalPendiente = r2(pendientes.reduce((s, l) => s + l.saldo, 0));
  const meses = useMemo(() => [...new Set(liquidaciones.map((l) => l.periodo))].sort().reverse(), [liquidaciones]);
  const filtradas = liquidaciones.filter(
    (l) => (!filtroMes || l.periodo === filtroMes) && (!filtroDisc || l.disciplina_id === filtroDisc)
  );
  const liqVer = ver != null ? liquidaciones.find((l) => l.id === ver) ?? null : null;

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Cuotas y cobranza"
        titulo="Liquidación a disciplinas"
        descripcion="Todos los meses, como en la planilla: a cada disciplina se le paga lo que se cobró de sus cuotas, menos la cuota social del club y los gastos del débito. Si da negativo, la disciplina tiene que depositar la diferencia."
      />

      <LiquidacionMes
        key={periodo}
        periodo={periodo}
        previa={previa}
        error={errorPrevia}
        hoy={hoy}
        puedeOperar={puedeOperar}
        onVer={setVer}
      />

      <Panel
        titulo="Liquidaciones"
        icono={History}
        delay={0.08}
        accion={
          pendientes.length > 0 ? (
            <span className="text-xs text-amber-700">
              {pendientes.length} pendiente{pendientes.length === 1 ? "" : "s"} de pago · {formatImporte(totalPendiente, "UYU")}
            </span>
          ) : undefined
        }
      >
        <div className="grid grid-cols-1 gap-3 border-b border-linea p-4 sm:grid-cols-2 lg:max-w-xl">
          <Campo etiqueta="Mes">
            <select value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} className={claseControl}>
              <option value="">Todos</option>
              {meses.map((m) => (
                <option key={m} value={m}>
                  {nombrePeriodo(m)}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Disciplina">
            <select value={filtroDisc} onChange={(e) => setFiltroDisc(e.target.value ? Number(e.target.value) : "")} className={claseControl}>
              <option value="">Todas</option>
              {disciplinas.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <ListaLiquidaciones
          liquidaciones={filtradas}
          cuentas={cuentas}
          cuentaDefecto={cuentaDefecto}
          planes={planesPago}
          deudas={deudas}
          hoy={hoy}
          puedeOperar={puedeOperar}
        />
      </Panel>

      <Panel titulo="Configuración por disciplina" icono={Settings2} delay={0.12}>
        <ul className="divide-y divide-linea">
          {disciplinas.map((d, i) => {
            const deuda = deudas[d.id] ?? d.deuda;
            return (
              <motion.li
                key={d.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...easeSmooth, delay: Math.min(i, 14) * 0.02 }}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm sm:grid-cols-[minmax(0,12rem)_8rem_minmax(0,1fr)_9rem_auto]"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{d.nombre}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {d.ultimoPeriodo ? `Última liquidada: ${nombrePeriodo(d.ultimoPeriodo).toLowerCase()}` : "Nunca se le liquidó"}
                  </div>
                </div>
                <div className="text-right sm:text-left">
                  <Pastilla tono={d.configurada ? "info" : "neutro"}>{d.porcentaje}% de los gastos</Pastilla>
                </div>
                <div className="col-span-2 truncate text-xs text-muted-foreground sm:col-span-1">{d.datos_transferencia ?? "Sin datos de transferencia"}</div>
                <div className={cn("text-xs tabular-nums sm:text-right sm:text-sm", (deuda ?? 0) > 0 && "text-rose-700")}>
                  {deuda == null ? "" : deuda > 0 ? `Debe ${formatImporte(deuda)}` : <span className="text-muted-foreground">Sin deuda</span>}
                </div>
                <div className="flex justify-end">
                  {puedeOperar && (
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.9 }}
                      whileHover={{ scale: 1.05 }}
                      onClick={() => setEditar(d)}
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-superficie hover:text-bordo-800"
                      aria-label={`Editar ${d.nombre}`}
                    >
                      <Pencil className="size-4" />
                    </motion.button>
                  )}
                </div>
              </motion.li>
            );
          })}
        </ul>
        <div className="border-t border-linea px-4 py-2">
          <Explicacion>
            Porcentaje: qué parte de los gastos del débito (comisión + IVA) sobre lo cobrado a sus socios se le descuenta a la disciplina (100 % si no se
            configuró). El resto lo absorbe el club.
          </Explicacion>
        </div>
      </Panel>

      <HojaLiquidacion
        liquidacion={liqVer}
        onClose={() => setVer(null)}
        cuentas={cuentas}
        cuentaDefecto={cuentaDefecto}
        planes={planesPago}
        deudas={deudas}
        hoy={hoy}
        puedeOperar={puedeOperar}
      />

      {editar && <EditarDisciplina key={editar.id} disciplina={editar} onClose={() => setEditar(null)} />}
    </div>
  );
}

// ------------------------------------------------------------
// Liquidación del mes
// ------------------------------------------------------------

function LiquidacionMes({
  periodo,
  previa,
  error,
  hoy,
  puedeOperar,
  onVer,
}: {
  periodo: string;
  previa: FilaLiquidacionMes[] | null;
  error: string | null;
  hoy: string;
  puedeOperar: boolean;
  onVer: (liquidacionId: number) => void;
}) {
  const router = useRouter();
  const [navegando, startNav] = useTransition();
  const [fecha, setFecha] = useState(hoy);
  const [elegidas, setElegidas] = useState<Set<number>>(new Set());
  const [confirmar, setConfirmar] = useState(false);
  const mesActual = inicioMes(hoy);

  const filas = previa ?? [];
  const visaCargada = filas.length === 0 || filas.some((f) => f.visa_cargada);
  const liquidables = filas.filter((f) => !f.yaLiquidado && conMovimiento(f));
  const elegibles = new Set(liquidables.map((f) => f.disciplina_id));
  const seleccion = [...elegidas].filter((id) => elegibles.has(id));
  const aLiquidar = seleccion.length > 0 ? liquidables.filter((f) => elegidas.has(f.disciplina_id)) : liquidables;
  const yaLiquidadas = filas.filter((f) => f.yaLiquidado).length;

  const suma = (k: (f: FilaLiquidacionMes) => number, lista = filas) => r2(lista.reduce((s, f) => s + k(f), 0));
  const totalPagar = suma((f) => f.a_pagar, aLiquidar);
  const totalDepositar = suma((f) => f.a_depositar, aLiquidar);

  function irA(p: string) {
    startNav(() => router.push(`/cuotas/disciplinas?mes=${p.slice(0, 7)}`, { scroll: false }));
  }

  function alternar(id: number) {
    setElegidas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  const todas = liquidables.length > 0 && seleccion.length === liquidables.length;

  const errores: string[] = [];
  if (!fecha || fecha > hoy) errores.push("La fecha de liquidación no puede ser futura");
  if (aLiquidar.length === 0) errores.push("No hay disciplinas para liquidar en el mes");

  return (
    <Panel
      titulo={`Liquidación de ${nombrePeriodo(periodo).toLowerCase()}`}
      icono={Calculator}
      delay={0.04}
      accion={navegando ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : undefined}
    >
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Campo etiqueta="Mes del débito">
            <div className="flex items-center gap-1">
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={() => irA(sumarMeses(periodo, -1))}
                className="flex size-10 items-center justify-center rounded-lg border border-linea bg-white text-muted-foreground transition-colors hover:border-bordo-200 hover:text-bordo-800"
                aria-label="Mes anterior"
              >
                <ChevronLeft className="size-4" />
              </motion.button>
              <input
                type="month"
                value={periodo.slice(0, 7)}
                max={mesActual.slice(0, 7)}
                onChange={(e) => e.target.value && irA(`${e.target.value}-01`)}
                className={cn(claseControl, "w-40")}
              />
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={() => irA(sumarMeses(periodo, 1))}
                disabled={periodo >= mesActual}
                className="flex size-10 items-center justify-center rounded-lg border border-linea bg-white text-muted-foreground transition-colors hover:border-bordo-200 hover:text-bordo-800 disabled:opacity-40"
                aria-label="Mes siguiente"
              >
                <ChevronRight className="size-4" />
              </motion.button>
            </div>
          </Campo>
          {puedeOperar && (
            <Campo etiqueta="Fecha de liquidación" className="w-44">
              <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className={claseControl} />
            </Campo>
          )}
        </div>

        <Formula />

        <AnimatePresence>
          {!error && previa && !visaCargada && (
            <motion.div key="sin-visa" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <Aviso titulo="Todavía no se cargó el débito Visa de ese mes">
                Sin el débito, la liquidación sale solo con lo cobrado por otros medios y toda la cuota social queda a cargo de las disciplinas.{" "}
                <Link href="/cuotas/visa" className="font-medium underline underline-offset-2">
                  Cargar el débito
                </Link>
              </Aviso>
            </motion.div>
          )}
        </AnimatePresence>

        {error ? (
          <Aviso titulo="No se pudo calcular la liquidación del mes">{error}</Aviso>
        ) : (
          <motion.div
            animate={{ opacity: navegando ? 0.55 : 1 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi etiqueta="A pagar a disciplinas" detalle={seleccion.length ? "De las elegidas" : "De las que faltan liquidar"}>
                <ImporteAnimado valor={totalPagar} moneda="UYU" className="text-amber-700" />
              </Kpi>
              <Kpi etiqueta="A depositar al club" tono={totalDepositar > 0 ? "alerta" : "neutro"} delay={0.03} detalle="Disciplinas con resultado negativo">
                <ImporteAnimado valor={totalDepositar} moneda="UYU" />
              </Kpi>
              <Kpi etiqueta="Faltan liquidar" delay={0.06} detalle={`De ${filas.filter(conMovimiento).length} con movimiento`}>
                <NumeroAnimado valor={liquidables.length} />
              </Kpi>
              <Kpi etiqueta="Ya liquidadas" tono={yaLiquidadas > 0 ? "bueno" : "neutro"} delay={0.09} detalle={nombrePeriodo(periodo)}>
                <NumeroAnimado valor={yaLiquidadas} />
              </Kpi>
            </div>

            {filas.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-linea px-4 py-8 text-center text-sm text-muted-foreground">
                No hay disciplinas con socios en {nombrePeriodo(periodo).toLowerCase()}.
              </p>
            ) : (
              <>
                {/* Escritorio: tabla */}
                <div className="hidden max-w-full overflow-x-auto rounded-2xl border border-linea md:block">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead>
                      <tr className="border-b border-linea bg-superficie/50 text-[10px] uppercase tracking-editorial text-muted-foreground">
                        {puedeOperar && (
                          <th className="w-10 px-3 py-2">
                            <input
                              type="checkbox"
                              checked={todas}
                              disabled={liquidables.length === 0}
                              onChange={() => setElegidas(todas ? new Set() : new Set(liquidables.map((f) => f.disciplina_id)))}
                              className="size-4 accent-bordo-800"
                              aria-label="Elegir todas"
                            />
                          </th>
                        )}
                        <th className="px-3 py-2 text-left font-medium">Disciplina</th>
                        <th className="px-3 py-2 text-right font-medium">Socios</th>
                        <th className="px-3 py-2 text-right font-medium">Débito cobrado</th>
                        <th className="px-3 py-2 text-right font-medium">Social del club</th>
                        <th className="px-3 py-2 text-right font-medium">Gastos</th>
                        <th className="px-3 py-2 text-right font-medium">Otros medios</th>
                        <th className="px-3 py-2 text-right font-medium">Resultado</th>
                        <th className="px-3 py-2 text-right font-medium">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((f, i) => {
                        const elegible = elegibles.has(f.disciplina_id);
                        const on = elegidas.has(f.disciplina_id);
                        return (
                          <motion.tr
                            key={f.disciplina_id}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ ...easeSmooth, delay: Math.min(i, 16) * 0.02 }}
                            onClick={() => (elegible && puedeOperar ? alternar(f.disciplina_id) : f.liquidacion_id ? onVer(f.liquidacion_id) : undefined)}
                            className={cn(
                              "border-b border-linea/60 transition-colors last:border-0",
                              (elegible && puedeOperar) || f.liquidacion_id ? "cursor-pointer hover:bg-superficie/60" : "",
                              on && "bg-bordo-50/40",
                              !conMovimiento(f) && "text-muted-foreground"
                            )}
                          >
                            {puedeOperar && (
                              <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                {elegible && (
                                  <input
                                    type="checkbox"
                                    checked={on}
                                    onChange={() => alternar(f.disciplina_id)}
                                    className="size-4 accent-bordo-800"
                                    aria-label={`Elegir ${f.disciplina}`}
                                  />
                                )}
                              </td>
                            )}
                            <td className="px-3 py-2 font-medium">{f.disciplina}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{f.socios}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatImporte(f.visa_cobrado)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              <div>−{formatImporte(r2(f.visa_social + f.social_a_cargo))}</div>
                              {f.social_a_cargo > 0 && <div className="text-[11px] text-rose-700">a su cargo {formatImporte(f.social_a_cargo)}</div>}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              <div>−{formatImporte(r2(f.gastos_comision + f.gastos_iva))}</div>
                              {f.gastos_iva > 0 && <div className="text-[11px] text-muted-foreground">IVA {formatImporte(f.gastos_iva)}</div>}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{f.otros_cobrado > 0 ? `+${formatImporte(f.otros_cobrado)}` : "—"}</td>
                            <td className="px-3 py-2 text-right">
                              <ResultadoLiquidacion aPagar={f.a_pagar} aDepositar={f.a_depositar} />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <EstadoFila fila={f} onVer={onVer} />
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-linea bg-superficie/50 font-medium">
                        {puedeOperar && <td />}
                        <td className="px-3 py-2">Total</td>
                        <td className="px-3 py-2 text-right tabular-nums">{filas.reduce((s, f) => s + f.socios, 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatImporte(suma((f) => f.visa_cobrado))}</td>
                        <td className="px-3 py-2 text-right tabular-nums">−{formatImporte(suma((f) => f.visa_social + f.social_a_cargo))}</td>
                        <td className="px-3 py-2 text-right tabular-nums">−{formatImporte(suma((f) => f.gastos_comision + f.gastos_iva))}</td>
                        <td className="px-3 py-2 text-right tabular-nums">+{formatImporte(suma((f) => f.otros_cobrado))}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="text-xs tabular-nums text-amber-700">Pagar {formatImporte(suma((f) => f.a_pagar), "UYU")}</div>
                          <div className="text-xs tabular-nums text-rose-700">Depositar {formatImporte(suma((f) => f.a_depositar), "UYU")}</div>
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Celular: tarjetas */}
                <ul className="space-y-2 md:hidden">
                  {filas.map((f, i) => {
                    const elegible = elegibles.has(f.disciplina_id);
                    const on = elegidas.has(f.disciplina_id);
                    return (
                      <motion.li
                        key={f.disciplina_id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...easeSmooth, delay: Math.min(i, 12) * 0.03 }}
                        whileTap={elegible && puedeOperar ? { scale: 0.99 } : undefined}
                        onClick={() => (elegible && puedeOperar ? alternar(f.disciplina_id) : undefined)}
                        className={cn(
                          "rounded-2xl border bg-white p-3 transition-colors",
                          on ? "border-bordo-200 bg-bordo-50/40" : "border-linea",
                          !conMovimiento(f) && "opacity-70"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {puedeOperar && elegible && (
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => alternar(f.disciplina_id)}
                              onClick={(e) => e.stopPropagation()}
                              className="mt-0.5 size-4 accent-bordo-800"
                              aria-label={`Elegir ${f.disciplina}`}
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{f.disciplina}</div>
                            <div className="text-xs text-muted-foreground">{f.socios} socios</div>
                          </div>
                          <ResultadoLiquidacion aPagar={f.a_pagar} aDepositar={f.a_depositar} />
                        </div>
                        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                          <dt className="text-muted-foreground">Débito cobrado</dt>
                          <dd className="text-right tabular-nums">{formatImporte(f.visa_cobrado)}</dd>
                          <dt className="text-muted-foreground">Social del club</dt>
                          <dd className="text-right tabular-nums">−{formatImporte(r2(f.visa_social + f.social_a_cargo))}</dd>
                          <dt className="text-muted-foreground">Gastos (comisión + IVA)</dt>
                          <dd className="text-right tabular-nums">−{formatImporte(r2(f.gastos_comision + f.gastos_iva))}</dd>
                          <dt className="text-muted-foreground">Otros medios</dt>
                          <dd className="text-right tabular-nums">+{formatImporte(f.otros_cobrado)}</dd>
                        </dl>
                        <div className="mt-2 flex justify-end" onClick={(e) => e.stopPropagation()}>
                          <EstadoFila fila={f} onVer={onVer} />
                        </div>
                      </motion.li>
                    );
                  })}
                </ul>
              </>
            )}

            {puedeOperar && filas.length > 0 && (
              <div className="flex flex-col gap-3 rounded-2xl border border-bordo-100 bg-bordo-50/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  <div className="font-medium">
                    {seleccion.length > 0
                      ? `${seleccion.length} disciplina${seleccion.length === 1 ? "" : "s"} elegida${seleccion.length === 1 ? "" : "s"}`
                      : `Todas las que faltan (${liquidables.length})`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    El club les va a deber {formatImporte(totalPagar, "UYU")}
                    {totalDepositar > 0 ? ` y tienen que depositar ${formatImporte(totalDepositar, "UYU")}` : ""}. A cada representante le llega el
                    resumen por mail.
                  </div>
                </div>
                <div className="flex flex-col items-stretch gap-1 sm:items-end">
                  <Boton onClick={() => setConfirmar(true)} disabled={errores.length > 0}>
                    <Send className="size-4" />
                    Liquidar y avisar
                  </Boton>
                  {errores.length > 0 && <p className="text-center text-[11px] text-rose-700 sm:text-right">{errores[0]}</p>}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>

      <DialogoAccion
        open={confirmar}
        onOpenChange={setConfirmar}
        icono={Send}
        titulo={`Liquidar ${nombrePeriodo(periodo).toLowerCase()}`}
        descripcion={
          <div className="space-y-2">
            <p>
              Se liquida a {aLiquidar.length === 1 ? aLiquidar[0]?.disciplina : `${aLiquidar.length} disciplinas`} con fecha {formatFecha(fecha)}: el club
              les queda debiendo {formatImporte(totalPagar, "UYU")}
              {totalDepositar > 0 ? ` y las que dieron negativo tienen que depositar ${formatImporte(totalDepositar, "UYU")}` : ""}. El pago se registra
              después, desde cada liquidación.
            </p>
            <p>Les mandamos el resumen a sus representantes. Después no se pueden registrar cobros de esas disciplinas dentro del mes.</p>
          </div>
        }
        textoAccion="Liquidar y avisar"
        mensaje={`Liquidación de ${nombrePeriodo(periodo).toLowerCase()} registrada`}
        alTerminar={() => {
          setElegidas(new Set());
          router.refresh();
        }}
        ejecutar={async () => {
          const r = await liquidarMes({ periodo, fecha, disciplinas: seleccion.length > 0 ? seleccion : null });
          if (!r.ok) return r;
          const d: ResultadoLiquidarMes = r.data;
          // Después del toast de éxito, el del mail.
          setTimeout(() => avisarResultadoMail(d.aviso, d.errorAviso), 300);
          return { ok: true };
        }}
      />
    </Panel>
  );
}

function EstadoFila({ fila: f, onVer }: { fila: FilaLiquidacionMes; onVer: (id: number) => void }) {
  if (f.yaLiquidado && f.liquidacion_id) {
    return (
      <motion.button
        type="button"
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.95 }}
        onClick={(e) => {
          e.stopPropagation();
          onVer(f.liquidacion_id!);
        }}
        className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
      >
        <CheckCircle2 className="size-3" />
        Liquidada
        <Eye className="size-3 opacity-70" />
      </motion.button>
    );
  }
  if (f.yaLiquidado) return <Pastilla tono="bueno">Liquidada</Pastilla>;
  if (!conMovimiento(f)) return <Pastilla>Sin movimiento</Pastilla>;
  return <Pastilla tono="info">Por liquidar</Pastilla>;
}

/** La cuenta de la planilla de tesorería, en una línea. */
function Formula() {
  const pasos: { signo: string; texto: string; tono?: string }[] = [
    { signo: "", texto: "Débito Visa cobrado a sus socios" },
    { signo: "−", texto: "cuota social del club" },
    { signo: "−", texto: "gastos del débito (comisión + IVA)" },
    { signo: "+", texto: "cuotas cobradas por otros medios" },
    { signo: "=", texto: "a pagar a la disciplina", tono: "text-amber-700" },
  ];
  return (
    <div className="space-y-2 rounded-2xl border border-linea bg-superficie/40 p-3">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.05 } } }}
        className="flex flex-wrap items-center gap-1.5 text-xs"
      >
        {pasos.map((p) => (
          <motion.span
            key={p.texto}
            variants={{ hidden: { opacity: 0, y: 4 }, visible: { opacity: 1, y: 0 } }}
            className="inline-flex items-center gap-1.5"
          >
            {p.signo && <span className="font-heading text-muted-foreground">{p.signo}</span>}
            <span className={cn("rounded-full border border-linea bg-white px-2 py-0.5", p.tono)}>{p.texto}</span>
          </motion.span>
        ))}
      </motion.div>
      <Explicacion>
        Se cobra la cuota entera por el débito (social + disciplina); la social es del club. La de los socios que no pagaron (tarjeta rechazada u otro
        medio) la pone la disciplina, que se la cobra al socio. Los gastos se reparten en proporción a lo cobrado. Si da negativo, la disciplina
        deposita la diferencia.{" "}
        <Link href="/cuotas/cambios?estado=debito" className="inline-flex items-center gap-0.5 font-medium text-bordo-800 hover:underline">
          Cambios para el débito
          <ArrowUpRight className="size-3" />
        </Link>
      </Explicacion>
    </div>
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
      <Campo etiqueta="Parte de los gastos del débito (%)" ayuda="Comisión e IVA sobre lo cobrado a sus socios por débito Visa. El resto lo absorbe el club.">
        <input inputMode="decimal" value={porcentaje} onChange={(e) => setPorcentaje(e.target.value)} className={cn(claseControl, "text-right")} />
      </Campo>
      <Campo etiqueta="Datos para la transferencia" ayuda="Titular, banco y número de cuenta.">
        <textarea value={datos} onChange={(e) => setDatos(e.target.value)} rows={3} className={cn(claseControl, "h-auto py-2")} />
      </Campo>
    </DialogoAccion>
  );
}
