"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Ban, ChevronDown, FileMinus, Loader2, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth } from "@/lib/motion";
import {
  NOMBRE_TIPO_CREDITO,
  nombrePersona,
  r2,
  type CreditoLista,
  type CuentaPersona,
  type Persona,
} from "@/lib/socios/cuotas";
import { anularCredito, leerCuentaPersona, registrarCredito } from "@/app/(dashboard)/cuotas/actions";
import {
  BadgeEstado,
  Boton,
  BotonLink,
  BuscadorPersona,
  Campo,
  DialogoAccion,
  DialogoAnular,
  EncabezadoPagina,
  Explicacion,
  Filtros,
  ImporteAnimado,
  Kpi,
  LinkAsiento,
  NumeroAnimado,
  Panel,
  Pastilla,
  Vacio,
  claseControl,
} from "./ui";

type Filtro = "vigente" | "anulado" | "todas";

export function NotasCreditoLista({ creditos, puedeOperar }: { creditos: CreditoLista[]; puedeOperar: boolean }) {
  const [filtro, setFiltro] = useState<Filtro>("vigente");
  const [texto, setTexto] = useState("");
  const [abierta, setAbierta] = useState<number | null>(null);
  const [anular, setAnular] = useState<CreditoLista | null>(null);
  const q = useDeferredValue(texto.trim().toLowerCase());
  const lista = useMemo(
    () =>
      creditos
        .filter((c) => filtro === "todas" || c.estado === filtro)
        .filter((c) => !q || `${c.persona} ${c.cedula} ${c.motivo}`.toLowerCase().includes(q)),
    [creditos, filtro, q]
  );
  const vigentes = creditos.filter((c) => c.estado === "vigente");

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Cuotas y cobranza"
        titulo="Notas de crédito"
        descripcion="Bonificaciones y anulaciones de cuotas: bajan el ingreso y la deuda. Las de baja las genera Secretaría al dar de baja."
      >
        {puedeOperar && (
          <BotonLink href="/cuotas/notas-credito/nueva">
            <Plus className="size-4" />
            Nueva nota de crédito
          </BotonLink>
        )}
      </EncabezadoPagina>

      <div className="grid grid-cols-2 gap-3">
        <Kpi etiqueta="Notas vigentes" delay={0.03}>
          <NumeroAnimado valor={vigentes.length} />
        </Kpi>
        <Kpi etiqueta="Total acreditado" delay={0.06}>
          <ImporteAnimado valor={r2(vigentes.reduce((s, c) => s + c.importe, 0))} moneda="UYU" />
        </Kpi>
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...easeSmooth, delay: 0.05 }} className="space-y-3 rounded-2xl border border-linea bg-white p-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Persona, cédula o motivo…" className={cn(claseControl, "pl-9")} />
        </div>
        <Filtros<Filtro>
          id="nc"
          valor={filtro}
          onChange={setFiltro}
          opciones={[
            { valor: "vigente", etiqueta: "Vigentes", cantidad: vigentes.length },
            { valor: "anulado", etiqueta: "Anuladas", cantidad: creditos.length - vigentes.length },
            { valor: "todas", etiqueta: "Todas", cantidad: creditos.length },
          ]}
        />
      </motion.div>

      {lista.length === 0 ? (
        <Vacio icono={FileMinus} titulo="No hay notas de crédito con ese filtro" />
      ) : (
        <ul className="space-y-2">
          {lista.map((c, i) => {
            const open = abierta === c.id;
            return (
              <motion.li
                key={c.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...easeSmooth, delay: Math.min(i, 12) * 0.03 }}
                className={cn("rounded-2xl border border-linea bg-white transition-shadow hover:shadow-card-hover", c.estado === "anulado" && "opacity-60")}
              >
                <button
                  type="button"
                  onClick={() => setAbierta(open ? null : c.id)}
                  aria-expanded={open}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left sm:grid-cols-[6.5rem_minmax(0,1fr)_8rem_9rem_auto]"
                >
                  <div className="text-xs text-muted-foreground tabular-nums sm:text-sm sm:text-foreground">{formatFecha(c.fecha)}</div>
                  <div className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:row-start-auto">
                    <div className="truncate text-sm font-medium">{c.persona}</div>
                    <div className="truncate text-xs text-muted-foreground">{c.motivo}</div>
                  </div>
                  <div className="hidden sm:block">
                    <Pastilla tono={c.tipo === "bonificacion" ? "info" : "neutro"}>{NOMBRE_TIPO_CREDITO[c.tipo] ?? c.tipo}</Pastilla>
                  </div>
                  <div className="row-start-1 text-right font-heading tabular-nums sm:row-start-auto">{formatImporte(c.importe)}</div>
                  <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
                    <span className="sm:hidden">
                      <Pastilla tono={c.tipo === "bonificacion" ? "info" : "neutro"}>{NOMBRE_TIPO_CREDITO[c.tipo] ?? c.tipo}</Pastilla>
                    </span>
                    <span className="flex items-center gap-2">
                      {c.estado === "anulado" && <BadgeEstado estado="anulado" />}
                      <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
                    </span>
                  </div>
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="space-y-3 border-t border-linea px-4 py-3">
                        <ul className="space-y-1 text-sm">
                          {c.cuotas.map((q, j) => (
                            <li key={j} className="flex justify-between gap-3">
                              <span className="min-w-0 truncate">{q.concepto}</span>
                              <span className="tabular-nums">{formatImporte(q.importe)}</span>
                            </li>
                          ))}
                        </ul>
                        {c.motivo_anulacion && <p className="text-xs text-rose-700">Anulada: {c.motivo_anulacion}</p>}
                        <div className="flex flex-wrap items-center gap-2">
                          <LinkAsiento id={c.asiento_id} />
                          <div className="flex-1" />
                          {puedeOperar && c.estado === "vigente" && (
                            <Boton variante="peligro" className="h-8 px-3 text-xs" onClick={() => setAnular(c)}>
                              <Ban className="size-3.5" />
                              Anular
                            </Boton>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </ul>
      )}

      <DialogoAnular
        open={!!anular}
        onOpenChange={(o) => !o && setAnular(null)}
        titulo={`Anular la nota de crédito de ${anular?.persona ?? ""}`}
        descripcion={`${formatImporte(anular?.importe ?? 0, "UYU")}: se revierte el asiento y las cuotas vuelven a tener ese saldo.`}
        anular={(motivo) => anularCredito({ id: anular!.id, motivo })}
      />
    </div>
  );
}

// ------------------------------------------------------------
// Nueva
// ------------------------------------------------------------

export function NotaCreditoForm({ hoy, inicial }: { hoy: string; inicial: CuentaPersona | null }) {
  const router = useRouter();
  const [persona, setPersona] = useState<Persona | null>(inicial?.persona ?? null);
  const [cuenta, setCuenta] = useState<CuentaPersona | null>(inicial);
  const [cargando, setCargando] = useState(false);
  const [tipo, setTipo] = useState<"bonificacion" | "anulacion">("bonificacion");
  const [motivo, setMotivo] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [sel, setSel] = useState<Record<number, { on: boolean; importe: string }>>({});
  const [confirmar, setConfirmar] = useState(false);

  async function cargar(p: Persona | null) {
    setPersona(p);
    setCuenta(null);
    setSel({});
    if (!p) return;
    setCargando(true);
    const r = await leerCuentaPersona(p.id);
    setCargando(false);
    if (r.ok) setCuenta(r.data);
  }

  const elegidas = (cuenta?.cuotas ?? [])
    .filter((c) => sel[c.id]?.on)
    .map((c) => ({ cuota: c, importe: Number((sel[c.id]?.importe ?? "").replace(",", ".")) || 0 }));
  const total = r2(elegidas.reduce((s, e) => s + e.importe, 0));
  const errores: string[] = [];
  if (!persona) errores.push("Elegí a la persona");
  if (elegidas.length === 0) errores.push("Elegí al menos una cuota");
  if (elegidas.some((e) => e.importe <= 0 || e.importe > e.cuota.saldo)) errores.push("Cada importe tiene que estar entre 0 y el saldo de la cuota");
  if (elegidas.some((e) => e.cuota.fecha_emision > fecha)) errores.push("Hay cuotas emitidas después de la fecha de la nota");
  if (motivo.trim().length < 3) errores.push("Indicá el motivo");

  return (
    <div className="space-y-5">
      <EncabezadoPagina eyebrow="Notas de crédito" titulo="Nueva nota de crédito" descripcion="Acredita parte o todo el saldo de cuotas emitidas (Debe ingreso / Haber cuotas a cobrar).">
        <Link href="/cuotas/notas-credito" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-bordo-800">
          <ArrowLeft className="size-4" /> Volver
        </Link>
      </EncabezadoPagina>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <Panel titulo="Persona" delay={0.03}>
            <div className="space-y-2 p-4">
              <BuscadorPersona valor={persona} onElegir={cargar} autoFocus={!persona} />
              {cargando && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Leyendo sus cuotas…
                </div>
              )}
            </div>
          </Panel>

          <Panel
            titulo="Cuotas a acreditar"
            delay={0.06}
            accion={
              cuenta && cuenta.cuotas.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSel(Object.fromEntries(cuenta.cuotas.map((c) => [c.id, { on: true, importe: String(c.saldo) }])))}
                  className="text-xs text-bordo-800 hover:underline"
                >
                  Todo el saldo
                </button>
              ) : undefined
            }
          >
            {!cuenta ? (
              <p className="p-4 text-sm text-muted-foreground">Elegí una persona para ver sus cuotas con saldo.</p>
            ) : cuenta.cuotas.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No tiene cuotas con saldo.</p>
            ) : (
              <ul className="divide-y divide-linea">
                {cuenta.cuotas.map((c, i) => {
                  const x = sel[c.id] ?? { on: false, importe: "" };
                  return (
                    <motion.li
                      key={c.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ ...easeSmooth, delay: Math.min(i, 12) * 0.03 }}
                      className={cn("grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-2.5 text-sm sm:grid-cols-[auto_minmax(0,1fr)_8rem_9rem]", x.on && "bg-bordo-50/40")}
                    >
                      <input
                        type="checkbox"
                        checked={x.on}
                        onChange={(e) => setSel((s) => ({ ...s, [c.id]: { on: e.target.checked, importe: x.importe || String(c.saldo) } }))}
                        className="size-4 accent-bordo-800"
                        aria-label={`Acreditar ${c.concepto}`}
                      />
                      <div className="min-w-0">
                        <div className="truncate">{c.concepto}</div>
                        <div className="text-[11px] text-muted-foreground">Emitida {formatFecha(c.fecha_emision)}</div>
                      </div>
                      <div className="col-start-2 text-xs text-muted-foreground tabular-nums sm:col-start-auto sm:text-right sm:text-sm sm:text-foreground">
                        Saldo {formatImporte(c.saldo)}
                      </div>
                      <input
                        inputMode="decimal"
                        disabled={!x.on}
                        value={x.on ? x.importe : ""}
                        onChange={(e) => setSel((s) => ({ ...s, [c.id]: { on: true, importe: e.target.value.replace(/[^\d.,]/g, "") } }))}
                        className={cn(claseControl, "col-start-2 h-9 text-right tabular-nums sm:col-start-auto")}
                        aria-label="Importe a acreditar"
                        placeholder="0,00"
                      />
                    </motion.li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <Panel titulo="Nota de crédito" icono={FileMinus} delay={0.09}>
            <div className="space-y-3 p-4">
              <div className="grid grid-cols-2 gap-2">
                {(["bonificacion", "anulacion"] as const).map((t) => (
                  <motion.button
                    key={t}
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setTipo(t)}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-sm transition-colors",
                      tipo === t ? "border-bordo-700 bg-bordo-50 text-bordo-900" : "border-linea hover:border-bordo-200"
                    )}
                    aria-pressed={tipo === t}
                  >
                    {NOMBRE_TIPO_CREDITO[t]}
                  </motion.button>
                ))}
              </div>
              <Explicacion>
                {tipo === "bonificacion" ? "Bonificación: se perdona parte o toda la cuota (beca, acuerdo)." : "Anulación: la cuota no correspondía (error de emisión de una sola persona)."}
              </Explicacion>
              <Campo etiqueta="Fecha">
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={claseControl} />
              </Campo>
              <Campo etiqueta="Motivo">
                <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} className={cn(claseControl, "h-auto py-2")} placeholder="Queda en el asiento" />
              </Campo>
              <div className="flex items-baseline justify-between border-t border-linea pt-3">
                <span className="text-sm text-muted-foreground">Total a acreditar</span>
                <ImporteAnimado valor={total} moneda="UYU" className="font-heading text-lg" />
              </div>
              <Boton className="w-full" disabled={errores.length > 0} onClick={() => setConfirmar(true)}>
                <FileMinus className="size-4" />
                Registrar
              </Boton>
              {errores.length > 0 && persona && <p className="text-center text-[11px] text-muted-foreground">{errores[0]}</p>}
            </div>
          </Panel>
        </div>
      </div>

      {persona && (
        <DialogoAccion
          open={confirmar}
          onOpenChange={setConfirmar}
          icono={FileMinus}
          titulo="Confirmar nota de crédito"
          descripcion={`${NOMBRE_TIPO_CREDITO[tipo]} a ${nombrePersona(persona)} por ${formatImporte(total, "UYU")} el ${formatFecha(fecha)}.`}
          textoAccion="Registrar"
          mensaje="Nota de crédito registrada"
          alTerminar={() => router.push("/cuotas/notas-credito")}
          ejecutar={async () => {
            const r = await registrarCredito({
              persona_id: persona.id,
              fecha,
              tipo,
              motivo: motivo.trim(),
              cuotas: elegidas.map((e) => ({ cuota_id: e.cuota.id, importe: r2(e.importe) })),
            });
            return r.ok ? { ok: true } : r;
          }}
        >
          <ul className="divide-y divide-linea rounded-xl border border-linea text-sm">
            {elegidas.map((e) => (
              <li key={e.cuota.id} className="flex justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate">{e.cuota.concepto}</span>
                <span className="tabular-nums">{formatImporte(e.importe)}</span>
              </li>
            ))}
          </ul>
        </DialogoAccion>
      )}
    </div>
  );
}
