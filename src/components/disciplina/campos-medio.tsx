"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Banknote, Building2, CheckCircle2, CreditCard, Landmark, Lock, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Campo, claseControl } from "@/components/socios/cuotas/ui";
import {
  EMISORES_TARJETA,
  NOMBRE_MEDIO_DISC,
  luhnValido,
  mascaraTarjeta,
  mascaraVencimientoCorto,
  vencimientoCorto,
  type MedioCobroDisc,
  type MedioDiscInput,
  type MedioSocio,
} from "@/lib/socios/panel-disciplina";

export interface MedioFormDisc {
  medio: MedioCobroDisc | "";
  /** false: se mantiene la tarjeta actual (cambia vencimiento, emisor o titular). */
  tarjeta_nueva: boolean;
  tarjeta_numero: string;
  tarjeta_vencimiento: string;
  tarjeta_emisor: string;
  titular_otro: boolean;
  titular_nombre: string;
  titular_documento: string;
}

/** Formulario a partir del medio actual del socio (sin número completo: nunca se tiene). */
export function medioInicial(actual: MedioSocio | null | undefined, nuevo = false): MedioFormDisc {
  const visa = actual?.medio === "debito_visa" && !!actual.tarjeta;
  return {
    medio: nuevo ? "" : (actual?.medio ?? ""),
    tarjeta_nueva: !visa,
    tarjeta_numero: "",
    tarjeta_vencimiento: visa ? vencimientoCorto(actual?.vencimiento) : "",
    tarjeta_emisor: visa ? (actual?.emisor ?? "") : "",
    titular_otro: visa && !!actual?.titular,
    titular_nombre: visa ? (actual?.titular ?? "") : "",
    titular_documento: visa ? (actual?.titular_documento ?? "") : "",
  };
}

export function medioFormAInput(m: MedioFormDisc, disciplinaId: number, actual: MedioSocio | null | undefined): MedioDiscInput {
  const usarActual = m.medio === "debito_visa" && !m.tarjeta_nueva && actual?.medio === "debito_visa" && !!actual.tarjeta;
  return {
    medio: m.medio as MedioCobroDisc,
    disciplina_id: m.medio === "transferencia_disciplina" ? disciplinaId : null,
    tarjeta_numero: usarActual ? null : m.tarjeta_numero,
    tarjeta_ultimos4: usarActual ? actual?.tarjeta : null,
    tarjeta_vencimiento: m.tarjeta_vencimiento,
    tarjeta_emisor: m.tarjeta_emisor,
    titular_nombre: m.titular_otro ? m.titular_nombre : null,
    titular_documento: m.titular_otro ? m.titular_documento : null,
  };
}

const OPCIONES: { valor: MedioCobroDisc; texto: string; icono: LucideIcon }[] = [
  { valor: "debito_visa", texto: "Débito automático de la tarjeta", icono: CreditCard },
  { valor: "transferencia_disciplina", texto: "Paga en la cuenta de la disciplina", icono: Building2 },
  { valor: "transferencia_club", texto: "Transferencia a la cuenta del club", icono: Landmark },
  { valor: "efectivo", texto: "Paga en secretaría", icono: Banknote },
];

export function MedioCampos({
  valor,
  onChange,
  errores,
  actual,
  permitirNinguno,
}: {
  valor: MedioFormDisc;
  onChange: (m: MedioFormDisc) => void;
  errores: Record<string, string>;
  actual?: MedioSocio | null;
  permitirNinguno?: boolean;
}) {
  const set = <K extends keyof MedioFormDisc>(k: K, v: MedioFormDisc[K]) => onChange({ ...valor, [k]: v });
  const tieneTarjeta = actual?.medio === "debito_visa" && !!actual.tarjeta;
  const digitos = valor.tarjeta_numero.replace(/\D/g, "");
  const luhn = digitos.length >= 13 ? luhnValido(digitos) : null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {OPCIONES.map((o) => {
          const activo = valor.medio === o.valor;
          const Icono = o.icono;
          return (
            <motion.button
              key={o.valor}
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => set("medio", activo && permitirNinguno ? "" : o.valor)}
              aria-pressed={activo}
              className={cn(
                "flex items-start gap-2 rounded-xl border p-2.5 text-left transition-colors",
                activo ? "border-bordo-700 bg-bordo-50/60" : "border-linea bg-white hover:border-bordo-200"
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                  activo ? "bg-bordo-800 text-white" : "bg-superficie text-bordo-700"
                )}
              >
                <Icono className="size-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-foreground sm:text-sm">{NOMBRE_MEDIO_DISC[o.valor]}</span>
                <span className="hidden text-[11px] text-muted-foreground sm:block">{o.texto}</span>
              </span>
            </motion.button>
          );
        })}
      </div>
      {errores.medio && <p className="px-0.5 text-xs text-rose-700">{errores.medio}</p>}
      {permitirNinguno && !valor.medio && (
        <p className="px-0.5 text-[11px] text-muted-foreground">Sin elegir: lo podés cargar después desde la lista de socios.</p>
      )}

      <AnimatePresence initial={false}>
        {valor.medio === "debito_visa" && (
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
                    { v: false, t: `Misma tarjeta ****${actual?.tarjeta}` },
                    { v: true, t: "Tarjeta nueva" },
                  ].map((o) => (
                    <button
                      key={String(o.v)}
                      type="button"
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
                    </button>
                  ))}
                </div>
              )}

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
                    {luhn === false && !errores.tarjeta_numero && (
                      <p className="mt-1 px-0.5 text-xs text-rose-700">El número no cierra: revisá que esté bien copiado.</p>
                    )}
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
                El número completo lo ve solo tesorería para cargarlo en Visa y se borra después. En el panel queda solo
                el final de la tarjeta.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
