"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Banknote, Building2, HandCoins, Landmark, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth } from "@/lib/motion";
import {
  NOMBRE_MEDIO,
  nombrePersona,
  r2,
  repartir,
  type CuentaDisponible,
  type CuentaPersona,
  type Disciplina,
  type Persona,
} from "@/lib/socios/cuotas";
import { leerCuentaPersona, registrarCobro } from "@/app/(dashboard)/cuotas/actions";
import {
  Aviso,
  Boton,
  BuscadorPersona,
  Campo,
  DialogoAccion,
  EncabezadoPagina,
  Explicacion,
  ImporteAnimado,
  Panel,
  Pastilla,
  claseControl,
} from "./ui";

type MedioCobro = "transferencia_club" | "transferencia_disciplina" | "efectivo";

const OPCIONES: { valor: MedioCobro; etiqueta: string; icono: typeof Landmark; ayuda: string }[] = [
  { valor: "transferencia_club", etiqueta: "Transferencia al club", icono: Landmark, ayuda: "Entra al banco del club" },
  { valor: "transferencia_disciplina", etiqueta: "A la cuenta de una disciplina", icono: Users, ayuda: "Queda como deuda de la disciplina con el club" },
  { valor: "efectivo", etiqueta: "Efectivo", icono: Banknote, ayuda: "Entra a la caja" },
];

export function CobroForm({
  hoy,
  inicial,
  disciplinas,
  cuentas,
  defecto,
  eligeCuenta,
}: {
  hoy: string;
  inicial: CuentaPersona | null;
  disciplinas: Disciplina[];
  cuentas: CuentaDisponible[];
  defecto: { banco: string | null; caja: string | null };
  eligeCuenta: boolean;
}) {
  const router = useRouter();
  const [persona, setPersona] = useState<Persona | null>(inicial?.persona ?? null);
  const [cuenta, setCuenta] = useState<CuentaPersona | null>(inicial);
  const [cargando, setCargando] = useState(false);
  const [importe, setImporte] = useState(inicial ? String(saldoTotal(inicial) || "") : "");
  const [fecha, setFecha] = useState(hoy);
  const [medio, setMedio] = useState<MedioCobro>(medioInicial(inicial));
  const [disciplina, setDisciplina] = useState<number | "">(inicial?.medio?.disciplina_id ?? "");
  const [cuentaElegida, setCuentaElegida] = useState<{ medio: MedioCobro; id: string } | null>(null);
  const [referencia, setReferencia] = useState("");
  const [elegir, setElegir] = useState(false);
  const [elegidas, setElegidas] = useState<Set<number>>(new Set());
  const [confirmar, setConfirmar] = useState(false);

  async function cargarPersona(p: Persona | null) {
    setPersona(p);
    setCuenta(null);
    setElegidas(new Set());
    setElegir(false);
    if (!p) return;
    setCargando(true);
    const r = await leerCuentaPersona(p.id);
    setCargando(false);
    if (r.ok && r.data) {
      setCuenta(r.data);
      setImporte(String(saldoTotal(r.data) || ""));
      setMedio(medioInicial(r.data));
      setDisciplina(r.data.medio?.disciplina_id ?? "");
    }
  }

  // La cuenta por defecto depende del medio (caja o banco) hasta que se elija otra.
  const cuentaId =
    cuentaElegida?.medio === medio ? cuentaElegida.id : ((medio === "efectivo" ? defecto.caja : defecto.banco) ?? "");

  const monto = Number(importe.replace(",", ".")) || 0;
  // En la cuenta de una disciplina se pagan sus cuotas y la social que tiene a cargo.
  const cuotas = useMemo(
    () =>
      !cuenta
        ? []
        : medio === "transferencia_disciplina" && disciplina
          ? cuenta.cuotas.filter((c) => c.cuenta_disciplina === disciplina)
          : cuenta.cuotas,
    [cuenta, medio, disciplina]
  );
  const reparto = useMemo(
    () => (cuenta ? repartir(cuotas, monto, fecha, elegir ? [...elegidas].filter((id) => cuotas.some((c) => c.id === id)) : null) : null),
    [cuenta, cuotas, monto, fecha, elegir, elegidas]
  );
  const deuda = cuenta ? saldoTotal(cuenta) : 0;

  const errores: string[] = [];
  if (!persona) errores.push("Elegí a la persona");
  if (monto <= 0) errores.push("Indicá el importe");
  if (!fecha || fecha > hoy) errores.push("La fecha no puede ser futura");
  if (medio === "transferencia_disciplina" && !disciplina) errores.push("Elegí la disciplina");
  if (elegir && elegidas.size === 0) errores.push("Elegí al menos una cuota o desmarcá la opción");

  const nombreCuenta = cuentas.find((c) => c.id === cuentaId);
  const nombreDisc = disciplinas.find((d) => d.id === disciplina)?.nombre;

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Cobros"
        titulo="Registrar cobro"
        descripcion="Se aplica a las cuotas más viejas con saldo (o a las que elijas). Lo que sobra queda como saldo a favor."
      >
        <Link href="/cuotas/cobros" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-bordo-800">
          <ArrowLeft className="size-4" /> Volver a cobros
        </Link>
      </EncabezadoPagina>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <Panel titulo="Persona" delay={0.03}>
            <div className="space-y-3 p-4">
              <BuscadorPersona valor={persona} onElegir={cargarPersona} autoFocus={!persona} />
              <AnimatePresence mode="wait">
                {cargando && (
                  <motion.div key="c" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Leyendo sus cuotas…
                  </motion.div>
                )}
                {cuenta && !cargando && (
                  <motion.div key={cuenta.persona.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-wrap gap-2">
                    <Pastilla tono={deuda > 0 ? "alerta" : "bueno"}>Debe {formatImporte(deuda, "UYU")}</Pastilla>
                    {cuenta.saldoAFavor > 0 && <Pastilla tono="info">Saldo a favor {formatImporte(cuenta.saldoAFavor, "UYU")}</Pastilla>}
                    {cuenta.medio && <Pastilla>Medio habitual: {NOMBRE_MEDIO[cuenta.medio.medio]}</Pastilla>}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </Panel>

          <Panel titulo="Cobro" delay={0.06}>
            <div className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo etiqueta="Importe ($)">
                  <input
                    inputMode="decimal"
                    value={importe}
                    onChange={(e) => setImporte(e.target.value.replace(/[^\d.,]/g, ""))}
                    placeholder="0,00"
                    className={cn(claseControl, "text-right font-heading text-base tabular-nums")}
                  />
                </Campo>
                <Campo etiqueta="Fecha del cobro">
                  <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className={claseControl} />
                </Campo>
              </div>

              <div className="space-y-1.5">
                <span className="px-0.5 text-[10px] uppercase tracking-editorial text-muted-foreground">Medio</span>
                <div className="grid gap-2 sm:grid-cols-3">
                  {OPCIONES.map((o) => {
                    const on = medio === o.valor;
                    const Icono = o.icono;
                    return (
                      <motion.button
                        key={o.valor}
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        whileHover={{ y: -1 }}
                        onClick={() => setMedio(o.valor)}
                        className={cn(
                          "relative flex items-start gap-2 rounded-xl border p-3 text-left text-sm transition-colors",
                          on ? "border-bordo-700 bg-bordo-50 text-bordo-900" : "border-linea bg-white hover:border-bordo-200"
                        )}
                        aria-pressed={on}
                      >
                        <Icono className={cn("mt-0.5 size-4 shrink-0", on ? "text-bordo-800" : "text-muted-foreground")} />
                        <span>
                          <span className="block font-medium">{o.etiqueta}</span>
                          <span className="block text-[11px] text-muted-foreground">{o.ayuda}</span>
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <AnimatePresence mode="popLayout" initial={false}>
                  {medio === "transferencia_disciplina" ? (
                    <motion.div key="d" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                      <Campo etiqueta="Disciplina">
                        <select value={disciplina} onChange={(e) => setDisciplina(e.target.value ? Number(e.target.value) : "")} className={claseControl}>
                          <option value="">Elegí…</option>
                          {disciplinas.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.nombre}
                            </option>
                          ))}
                        </select>
                      </Campo>
                    </motion.div>
                  ) : eligeCuenta && cuentas.length > 0 ? (
                    <motion.div key={`c-${medio}`} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                      <Campo etiqueta={medio === "efectivo" ? "Caja" : "Cuenta bancaria"}>
                        <select value={cuentaId} onChange={(e) => setCuentaElegida({ medio, id: e.target.value })} className={claseControl}>
                          {cuentas.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.codigo} · {c.nombre}
                            </option>
                          ))}
                        </select>
                      </Campo>
                    </motion.div>
                  ) : (
                    <motion.div key="n" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-end">
                      <Explicacion>
                        {medio === "efectivo" ? "Entra a la caja configurada del club." : "Entra a la cuenta bancaria configurada del club."}
                      </Explicacion>
                    </motion.div>
                  )}
                </AnimatePresence>
                <Campo etiqueta="Referencia bancaria" ayuda="Número de la transferencia: la misma no entra dos veces.">
                  <input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Opcional" className={claseControl} maxLength={120} />
                </Campo>
              </div>
            </div>
          </Panel>

          <Panel
            titulo="Cuotas con saldo"
            delay={0.09}
            accion={
              cuenta && cuotas.length > 0 ? (
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={elegir} onChange={(e) => setElegir(e.target.checked)} className="size-4 accent-bordo-800" />
                  Elegir a qué cuotas aplicar
                </label>
              ) : undefined
            }
          >
            {!cuenta ? (
              <p className="p-4 text-sm text-muted-foreground">Elegí una persona para ver sus cuotas.</p>
            ) : cuotas.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {cuenta.cuotas.length > 0 && medio === "transferencia_disciplina"
                  ? `No tiene cuotas que se paguen en la cuenta de ${nombreDisc ?? "esa disciplina"}: todo el cobro quedaría como saldo a favor, para sus próximas cuotas de esa cuenta.`
                  : "No tiene cuotas con saldo: todo el cobro quedaría como saldo a favor."}
              </p>
            ) : (
              <ul className="divide-y divide-linea">
                {cuotas.map((c, i) => {
                  const aplica = reparto?.aplicaciones.find((a) => a.cuota.id === c.id)?.importe ?? 0;
                  const posterior = c.fecha_emision > fecha;
                  const vencida = c.fecha_vencimiento < hoy;
                  return (
                    <motion.li
                      key={c.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ ...easeSmooth, delay: Math.min(i, 12) * 0.03 }}
                      className={cn(
                        "grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-2.5 text-sm transition-colors",
                        aplica > 0 && "bg-emerald-50/50",
                        posterior && "opacity-50"
                      )}
                    >
                      {elegir ? (
                        <input
                          type="checkbox"
                          disabled={posterior}
                          checked={elegidas.has(c.id)}
                          onChange={(e) =>
                            setElegidas((s) => {
                              const n = new Set(s);
                              if (e.target.checked) n.add(c.id);
                              else n.delete(c.id);
                              return n;
                            })
                          }
                          className="mt-1 size-4 accent-bordo-800"
                          aria-label={`Aplicar a ${c.concepto}`}
                        />
                      ) : (
                        <span className={cn("mt-1.5 size-2 rounded-full", vencida ? "bg-rose-500" : "bg-dorado-400")} />
                      )}
                      <div className="min-w-0">
                        <div className="truncate">{c.concepto}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {vencida ? "Venció" : "Vence"} {formatFecha(c.fecha_vencimiento)}
                          {c.pagado + c.acreditado > 0 && ` · de ${formatImporte(c.importe)}`}
                          {posterior && " · emitida después de la fecha del cobro"}
                        </div>
                      </div>
                      <div className="text-right tabular-nums">
                        <div>{formatImporte(c.saldo)}</div>
                        <AnimatePresence>
                          {aplica > 0 && (
                            <motion.div initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[11px] text-emerald-700">
                              cobra {formatImporte(aplica)}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <Panel titulo="Cómo se aplica" icono={HandCoins} delay={0.12}>
            <div className="space-y-3 p-4">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">Cobro</span>
                <ImporteAnimado valor={monto} moneda="UYU" className="font-heading text-lg" />
              </div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">Se aplica a cuotas</span>
                <ImporteAnimado valor={reparto?.aplicado ?? 0} className="text-emerald-700" />
              </div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">Queda saldo a favor</span>
                <ImporteAnimado valor={reparto?.aFavor ?? monto} className={(reparto?.aFavor ?? monto) > 0 ? "text-sky-700" : ""} />
              </div>
              {cuenta && (
                <div className="flex items-baseline justify-between border-t border-linea pt-2 text-sm">
                  <span className="text-muted-foreground">Deuda después</span>
                  <ImporteAnimado valor={r2(deuda - (reparto?.aplicado ?? 0))} />
                </div>
              )}
              <AnimatePresence>
                {(reparto?.aFavor ?? 0) > 0 && monto > 0 && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                    <Explicacion>El saldo a favor se aplica solo cuando se emitan sus próximas cuotas.</Explicacion>
                  </motion.div>
                )}
              </AnimatePresence>
              <Boton className="w-full" disabled={errores.length > 0} onClick={() => setConfirmar(true)}>
                <HandCoins className="size-4" />
                Registrar cobro
              </Boton>
              {errores.length > 0 && persona && <p className="text-center text-[11px] text-muted-foreground">{errores[0]}</p>}
            </div>
          </Panel>
        </div>
      </div>

      {persona && reparto && (
        <DialogoAccion
          open={confirmar}
          onOpenChange={setConfirmar}
          icono={HandCoins}
          titulo="Confirmar cobro"
          ancho="sm:max-w-lg"
          descripcion={
            <span>
              {nombrePersona(persona)} · {formatImporte(monto, "UYU")} el {formatFecha(fecha)} ·{" "}
              {medio === "transferencia_disciplina" ? `cuenta de ${nombreDisc}` : NOMBRE_MEDIO[medio]}
              {nombreCuenta && medio !== "transferencia_disciplina" && ` (${nombreCuenta.nombre})`}
              {referencia.trim() && ` · ref. ${referencia.trim()}`}
            </span>
          }
          textoAccion="Registrar"
          mensaje="Cobro registrado"
          alTerminar={() => router.push(`/cuotas/cobros?persona=${persona.id}`)}
          ejecutar={async () => {
            const r = await registrarCobro({
              persona_id: persona.id,
              fecha,
              medio,
              importe: monto,
              cuenta_id: eligeCuenta && medio !== "transferencia_disciplina" ? cuentaId || null : null,
              disciplina_id: medio === "transferencia_disciplina" ? Number(disciplina) : null,
              referencia: referencia.trim() || null,
              cuotas: elegir ? [...elegidas].filter((id) => cuotas.some((c) => c.id === id)) : null,
            });
            return r.ok ? { ok: true } : r;
          }}
        >
          <ul className="divide-y divide-linea rounded-xl border border-linea text-sm">
            {reparto.aplicaciones.map((a) => (
              <li key={a.cuota.id} className="flex items-baseline justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate">{a.cuota.concepto}</span>
                <span className="shrink-0 tabular-nums">{formatImporte(a.importe)}</span>
              </li>
            ))}
            {reparto.aFavor > 0 && (
              <li className="flex items-baseline justify-between gap-3 bg-sky-50/60 px-3 py-2 text-sky-800">
                <span>Saldo a favor</span>
                <span className="tabular-nums">{formatImporte(reparto.aFavor)}</span>
              </li>
            )}
          </ul>
          {medio === "transferencia_disciplina" && (
            <Aviso tono="info" titulo="Queda como deuda de la disciplina">
              <span className="inline-flex items-center gap-1">
                <Building2 className="size-3" />
                {nombreDisc} recibió la plata: se descuenta en su próxima liquidación.
              </span>
            </Aviso>
          )}
        </DialogoAccion>
      )}
    </div>
  );
}

function saldoTotal(c: CuentaPersona): number {
  return r2(c.cuotas.reduce((s, q) => s + q.saldo, 0));
}

function medioInicial(c: CuentaPersona | null): MedioCobro {
  const m = c?.medio?.medio;
  return m === "transferencia_disciplina" || m === "efectivo" ? m : "transferencia_club";
}
