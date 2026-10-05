"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Building2, CheckCircle2, CreditCard, Landmark, Lock, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Campo, claseControl } from "@/components/socios/cuotas/ui";
import {
  EMISORES_TARJETA,
  luhnValido,
  mascaraTarjeta,
  mascaraVencimientoCorto,
  vencimientoCorto,
  type MedioCobro,
  type MedioInput,
} from "@/lib/socios/esquemas";

/**
 * Medio de cobro del socio, igual en secretaría (alta y ficha) y en el
 * panel de la disciplina. Solo dos opciones:
 *  - Débito automático (Visa), con el número completo de la tarjeta.
 *  - Transferencia: la cuota de cada disciplina, en la cuenta de esa
 *    disciplina. La disciplina elegida (`disciplina_id`) es la cuenta donde
 *    paga la cuota social (si está en varias, elige entre las suyas). Si no
 *    está en ninguna disciplina (solo socio social): transferencia al club.
 * Los medios que ya estaban cargados (efectivo, etc.) se siguen mostrando
 * en fichas y listas, pero no se ofrecen para elegir.
 */

export interface DisciplinaSocio {
  id: number;
  nombre: string;
}

/** Tarjeta que el socio ya tiene cargada (nunca el número completo: no se tiene). */
export interface TarjetaActual {
  ultimos4: string;
  vencimiento: string | null;
  emisor: string | null;
  titular: string | null;
  titular_documento: string | null;
}

export interface MedioActual {
  medio: string;
  disciplina_id: number | null;
  tarjeta: TarjetaActual | null;
}

export interface MedioCobroForm {
  medio: MedioCobro | "";
  disciplina_id: number | null;
  /** false: se mantiene la tarjeta actual (cambia vencimiento, emisor o titular). */
  tarjeta_nueva: boolean;
  tarjeta_numero: string;
  /** "MM/AA" */
  tarjeta_vencimiento: string;
  tarjeta_emisor: string;
  titular_otro: boolean;
  titular_nombre: string;
  titular_documento: string;
}

/** Formulario a partir del medio actual (o vacío con `nuevo`). */
export function medioCobroInicial(actual: MedioActual | null | undefined, nuevo = false): MedioCobroForm {
  const t = actual?.medio === "debito_visa" ? actual.tarjeta : null;
  return {
    medio: nuevo || !actual ? "" : (actual.medio as MedioCobro),
    disciplina_id: nuevo ? null : (actual?.disciplina_id ?? null),
    tarjeta_nueva: !t,
    tarjeta_numero: "",
    tarjeta_vencimiento: t ? vencimientoCorto(t.vencimiento) : "",
    tarjeta_emisor: t?.emisor ?? "",
    titular_otro: !!t?.titular,
    titular_nombre: t?.titular ?? "",
    titular_documento: t?.titular_documento ?? "",
  };
}

/** Las opciones según las disciplinas del socio. */
export function opcionesMedio(disciplinas: DisciplinaSocio[]): MedioCobro[] {
  return disciplinas.length > 0 ? ["debito_visa", "transferencia_disciplina"] : ["debito_visa", "transferencia_club"];
}

/**
 * El medio y la disciplina que valen de verdad: un medio que ya no se
 * ofrece queda sin elegir, una transferencia va a la disciplina del socio
 * (o al club si no tiene) y la disciplina elegida siempre es una de las suyas.
 */
export function medioEfectivo(
  valor: Pick<MedioCobroForm, "medio" | "disciplina_id">,
  disciplinas: DisciplinaSocio[]
): { medio: MedioCobro | ""; disciplina_id: number | null } {
  const opciones = opcionesMedio(disciplinas);
  let medio: MedioCobro | "" = valor.medio;
  if (medio === "transferencia_club" || medio === "transferencia_disciplina") {
    medio = disciplinas.length > 0 ? "transferencia_disciplina" : "transferencia_club";
  }
  if (medio && !opciones.includes(medio)) medio = "";
  const disciplina_id =
    medio === "transferencia_disciplina"
      ? disciplinas.some((d) => d.id === valor.disciplina_id)
        ? valor.disciplina_id
        : (disciplinas[0]?.id ?? null)
      : null;
  return { medio, disciplina_id };
}

/** Formulario → lo que recibe el esquema (null si no eligió medio). */
export function medioCobroAInput(
  m: MedioCobroForm,
  disciplinas: DisciplinaSocio[],
  tarjetaActual: TarjetaActual | null | undefined
): MedioInput | null {
  const { medio, disciplina_id } = medioEfectivo(m, disciplinas);
  if (!medio) return null;
  if (medio !== "debito_visa") return { medio, disciplina_id };
  const usarActual = !m.tarjeta_nueva && !!tarjetaActual;
  return {
    medio,
    disciplina_id: null,
    tarjeta_numero: usarActual ? null : m.tarjeta_numero,
    tarjeta_ultimos4: usarActual ? tarjetaActual.ultimos4 : null,
    tarjeta_vencimiento: m.tarjeta_vencimiento,
    tarjeta_emisor: m.tarjeta_emisor,
    titular_nombre: m.titular_otro ? m.titular_nombre : null,
    titular_documento: m.titular_otro ? m.titular_documento : null,
  };
}

const ICONOS: Partial<Record<MedioCobro, LucideIcon>> = {
  debito_visa: CreditCard,
  transferencia_disciplina: Building2,
  transferencia_club: Landmark,
};

export function MedioCobroCampos({
  valor,
  onChange,
  errores,
  disciplinas,
  tarjetaActual,
  permitirNinguno,
  textoNinguno = "Sin elegir: lo podés cargar después.",
  ayudaSinDisciplina,
}: {
  valor: MedioCobroForm;
  onChange: (m: MedioCobroForm) => void;
  errores: Record<string, string>;
  /** Las disciplinas DEL SOCIO (no todas las del club). */
  disciplinas: DisciplinaSocio[];
  tarjetaActual?: TarjetaActual | null;
  permitirNinguno?: boolean;
  textoNinguno?: string;
  /** Aclaración cuando todavía no tiene disciplina (por ejemplo en el alta, antes de elegir el plan). */
  ayudaSinDisciplina?: string;
}) {
  const set = <K extends keyof MedioCobroForm>(k: K, v: MedioCobroForm[K]) => onChange({ ...valor, [k]: v });
  const { medio, disciplina_id } = medioEfectivo(valor, disciplinas);
  const discElegida = disciplinas.find((d) => d.id === disciplina_id) ?? disciplinas[0] ?? null;
  const tieneTarjeta = !!tarjetaActual;
  const digitos = valor.tarjeta_numero.replace(/\D/g, "");
  const luhn = digitos.length >= 13 ? luhnValido(digitos) : null;

  const textos: Record<string, { titulo: string; texto: string }> = {
    debito_visa: { titulo: "Débito automático (Visa)", texto: "Se debita de la tarjeta todos los meses" },
    transferencia_disciplina:
      disciplinas.length > 1
        ? {
            titulo: "Transferencia a la cuenta de cada disciplina",
            texto: `Cada cuota en la cuenta de su disciplina; la social, en la de ${discElegida?.nombre ?? "una de ellas"}`,
          }
        : { titulo: `Transferencia a la cuenta de ${discElegida?.nombre ?? "la disciplina"}`, texto: "Paga en la cuenta de su disciplina" },
    transferencia_club: { titulo: "Transferencia al club", texto: "No está en ninguna disciplina: paga en la cuenta del club" },
  };

  function elegir(o: MedioCobro) {
    const activo = medio === o;
    if (activo && permitirNinguno) {
      onChange({ ...valor, medio: "" });
      return;
    }
    onChange({ ...valor, medio: o, disciplina_id: o === "transferencia_disciplina" ? (discElegida?.id ?? null) : valor.disciplina_id });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {opcionesMedio(disciplinas).map((o) => {
          const activo = medio === o;
          const Icono = ICONOS[o] ?? Landmark;
          return (
            <motion.button
              key={o}
              type="button"
              layout
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => elegir(o)}
              aria-pressed={activo}
              className={cn(
                "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors",
                activo ? "border-bordo-700 bg-bordo-50/60" : "border-linea bg-white hover:border-bordo-200"
              )}
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                  activo ? "bg-bordo-800 text-white" : "bg-superficie text-bordo-700"
                )}
              >
                <Icono className="size-4" />
              </span>
              <span className="min-w-0">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={textos[o].titulo}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    transition={{ duration: 0.15 }}
                    className="block text-sm font-medium text-foreground"
                  >
                    {textos[o].titulo}
                  </motion.span>
                </AnimatePresence>
                <span className="block text-[11px] text-muted-foreground">{textos[o].texto}</span>
              </span>
            </motion.button>
          );
        })}
      </div>
      {errores.medio && <p className="px-0.5 text-xs text-rose-700">{errores.medio}</p>}
      <AnimatePresence initial={false}>
        {disciplinas.length === 0 && ayudaSinDisciplina && (
          <motion.p
            key="sin-disc"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden px-0.5 text-[11px] text-muted-foreground"
          >
            {ayudaSinDisciplina}
          </motion.p>
        )}
        {permitirNinguno && !medio && (
          <motion.p
            key="ninguno"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden px-0.5 text-[11px] text-muted-foreground"
          >
            {textoNinguno}
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {medio === "transferencia_disciplina" && disciplinas.length > 1 && (
          <motion.div
            key="disc"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5">
              <div className="px-0.5 text-[11px] text-muted-foreground">
                ¿En qué cuenta paga la cuota social? La cuota de cada disciplina va a la cuenta de esa disciplina.
              </div>
              <div className="flex flex-wrap gap-1.5">
                {disciplinas.map((d) => {
                  const activa = d.id === disciplina_id;
                  return (
                    <motion.button
                      key={d.id}
                      type="button"
                      whileTap={{ scale: 0.95 }}
                      onClick={() => set("disciplina_id", d.id)}
                      aria-pressed={activa}
                      className={cn(
                        "relative rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        activa ? "border-bordo-700 text-white" : "border-linea bg-white text-muted-foreground hover:border-bordo-200 hover:text-foreground"
                      )}
                    >
                      {activa && (
                        <motion.span
                          layoutId="medio-disciplina"
                          className="absolute inset-0 rounded-full bg-bordo-800"
                          transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        />
                      )}
                      <span className="relative">{d.nombre}</span>
                    </motion.button>
                  );
                })}
              </div>
              {errores.disciplina_id && <p className="px-0.5 text-xs text-rose-700">{errores.disciplina_id}</p>}
            </div>
          </motion.div>
        )}

        {medio === "debito_visa" && (
          <motion.div
            key="visa"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 rounded-xl border border-linea bg-superficie/40 p-3">
              {tieneTarjeta && (
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-white p-1 ring-1 ring-linea">
                  {[
                    { v: false, t: `Misma tarjeta ****${tarjetaActual?.ultimos4}` },
                    { v: true, t: "Tarjeta nueva" },
                  ].map((o) => (
                    <motion.button
                      key={String(o.v)}
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={() => onChange({ ...valor, tarjeta_nueva: o.v, tarjeta_numero: "" })}
                      className={cn(
                        "relative rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                        valor.tarjeta_nueva === o.v ? "text-bordo-900" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {valor.tarjeta_nueva === o.v && (
                        <motion.span layoutId="tarjeta-modo" className="absolute inset-0 rounded-md bg-bordo-50 ring-1 ring-bordo-100" />
                      )}
                      <span className="relative tabular-nums">{o.t}</span>
                    </motion.button>
                  ))}
                </div>
              )}
              <AnimatePresence initial={false}>
                {tieneTarjeta && !valor.tarjeta_nueva && (
                  <motion.p
                    key="misma"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden px-0.5 text-[11px] text-muted-foreground"
                  >
                    Se mantiene la tarjeta: cambiá solo el vencimiento, el emisor o el titular.
                  </motion.p>
                )}
              </AnimatePresence>

              <AnimatePresence initial={false} mode="popLayout">
                {(valor.tarjeta_nueva || !tieneTarjeta) && (
                  <motion.div key="numero" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
                    <Campo etiqueta="Número de la tarjeta" error={errores.tarjeta_numero}>
                      <div className="relative">
                        <input
                          value={valor.tarjeta_numero}
                          onChange={(e) => set("tarjeta_numero", mascaraTarjeta(e.target.value))}
                          inputMode="numeric"
                          autoComplete="off"
                          spellCheck={false}
                          name="numero-tarjeta-debito"
                          placeholder="#### #### #### ####"
                          aria-invalid={!!errores.tarjeta_numero || luhn === false || undefined}
                          className={cn(claseControl, "pr-9 font-mono tracking-wider")}
                        />
                        <AnimatePresence>
                          {luhn !== null && (
                            <motion.span
                              key={String(luhn)}
                              initial={{ opacity: 0, scale: 0.6 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.6 }}
                              className="absolute top-1/2 right-3 -translate-y-1/2"
                            >
                              {luhn ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-rose-600" />}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </div>
                    </Campo>
                    <AnimatePresence initial={false}>
                      {luhn === false && !errores.tarjeta_numero && (
                        <motion.p
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-1 overflow-hidden px-0.5 text-xs text-rose-700"
                        >
                          El número no cierra: revisá que esté bien copiado.
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Vencimiento" error={errores.tarjeta_vencimiento}>
                  <input
                    value={valor.tarjeta_vencimiento}
                    onChange={(e) => set("tarjeta_vencimiento", mascaraVencimientoCorto(e.target.value))}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="MM/AA"
                    aria-invalid={!!errores.tarjeta_vencimiento || undefined}
                    className={cn(claseControl, "tabular-nums")}
                  />
                </Campo>
                <Campo etiqueta="Emisor" error={errores.tarjeta_emisor}>
                  <select
                    value={valor.tarjeta_emisor}
                    onChange={(e) => set("tarjeta_emisor", e.target.value)}
                    aria-invalid={!!errores.tarjeta_emisor || undefined}
                    className={claseControl}
                  >
                    <option value="">Elegí…</option>
                    {[...new Set([...EMISORES_TARJETA, ...(valor.tarjeta_emisor ? [valor.tarjeta_emisor] : [])])].map((e) => (
                      <option key={e} value={e}>
                        {e === "OTRO" ? "Otro" : e}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={valor.titular_otro}
                  onChange={(e) => set("titular_otro", e.target.checked)}
                  className="size-4 accent-bordo-800"
                />
                La tarjeta es de otra persona (madre, padre…)
              </label>
              <AnimatePresence initial={false}>
                {valor.titular_otro && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="grid grid-cols-1 gap-3 overflow-hidden sm:grid-cols-2"
                  >
                    <Campo etiqueta="Titular" error={errores.titular_nombre}>
                      <input
                        value={valor.titular_nombre}
                        onChange={(e) => set("titular_nombre", e.target.value)}
                        placeholder="Nombre y apellido"
                        autoComplete="off"
                        className={claseControl}
                      />
                    </Campo>
                    <Campo etiqueta="Cédula del titular" error={errores.titular_documento}>
                      <input
                        value={valor.titular_documento}
                        onChange={(e) => set("titular_documento", e.target.value)}
                        inputMode="numeric"
                        autoComplete="off"
                        className={claseControl}
                      />
                    </Campo>
                  </motion.div>
                )}
              </AnimatePresence>

              <p className="flex items-start gap-1.5 rounded-lg bg-white px-2.5 py-2 text-[11px] leading-snug text-muted-foreground ring-1 ring-linea">
                <Lock className="mt-px size-3 shrink-0 text-bordo-700" />
                El número completo lo ve solo tesorería para cargarlo en Visa y se borra después. Acá queda solo el final de
                la tarjeta.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Errores del esquema del medio (con prefijo "medio") → { campo: mensaje }. */
export function erroresMedio(issues: { path: PropertyKey[]; message: string }[], prefijo = "medio"): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const path = i.path.map(String);
    if (path[0] !== prefijo) continue;
    const k = path.slice(1).join(".") || "medio";
    if (!out[k]) out[k] = i.message;
  }
  return out;
}
