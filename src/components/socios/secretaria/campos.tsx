"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Banknote, Building2, CreditCard, Landmark, Plus, Trash2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { cedulaValida, type MedioCobro, type MedioInput, type PersonaInput } from "@/lib/socios/esquemas";
import type { Disciplina, PlanConPrecio } from "@/lib/socios/padron";
import { Aviso, Boton, Campo, claseControl } from "./ui";

/** Issues de Zod → { campo: mensaje } (el primero de cada campo). */
export function erroresPorCampo(issues: { path: PropertyKey[]; message: string }[], prefijo?: string) {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const path = i.path.map(String);
    if (prefijo && path[0] !== prefijo) continue;
    const k = (prefijo ? path.slice(1) : path).join(".");
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

// ------------------------------------------------------------
// Datos personales
// ------------------------------------------------------------

export interface PersonaForm {
  cedula: string;
  nombre: string;
  apellido: string;
  fecha_nacimiento: string;
  telefono: string;
  email: string;
  direccion: string;
  numero_socio: string;
  notas: string;
}

export const PERSONA_VACIA: PersonaForm = {
  cedula: "",
  nombre: "",
  apellido: "",
  fecha_nacimiento: "",
  telefono: "",
  email: "",
  direccion: "",
  numero_socio: "",
  notas: "",
};

export function personaAInput(p: PersonaForm): PersonaInput {
  return {
    cedula: p.cedula,
    nombre: p.nombre,
    apellido: p.apellido,
    fecha_nacimiento: p.fecha_nacimiento || null,
    telefono: p.telefono,
    email: p.email,
    direccion: p.direccion,
    numero_socio: p.numero_socio.trim() || null,
    notas: p.notas,
  };
}

export function PersonaCampos({
  valor,
  onChange,
  errores,
  ayudaNumero,
  conCedula = false,
  conNotas = true,
}: {
  valor: PersonaForm;
  onChange: (p: PersonaForm) => void;
  errores: Record<string, string>;
  ayudaNumero?: string;
  conCedula?: boolean;
  conNotas?: boolean;
}) {
  const set = (k: keyof PersonaForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...valor, [k]: e.target.value });
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {conCedula && (
        <Campo etiqueta="Cédula" error={errores.cedula}>
          <input value={valor.cedula} onChange={set("cedula")} inputMode="numeric" className={claseControl} />
        </Campo>
      )}
      <Campo etiqueta="Nombre" error={errores.nombre}>
        <input value={valor.nombre} onChange={set("nombre")} autoComplete="off" aria-invalid={!!errores.nombre || undefined} className={claseControl} />
      </Campo>
      <Campo etiqueta="Apellido" error={errores.apellido}>
        <input value={valor.apellido} onChange={set("apellido")} autoComplete="off" aria-invalid={!!errores.apellido || undefined} className={claseControl} />
      </Campo>
      <Campo etiqueta="Fecha de nacimiento" error={errores.fecha_nacimiento}>
        <input type="date" value={valor.fecha_nacimiento} onChange={set("fecha_nacimiento")} className={claseControl} />
      </Campo>
      <Campo etiqueta="Número de socio" error={errores.numero_socio} ayuda={ayudaNumero}>
        <input
          value={valor.numero_socio}
          onChange={(e) => onChange({ ...valor, numero_socio: e.target.value.replace(/\D/g, "") })}
          inputMode="numeric"
          placeholder="Automático"
          aria-invalid={!!errores.numero_socio || undefined}
          className={claseControl}
        />
      </Campo>
      <Campo etiqueta="Teléfono" error={errores.telefono}>
        <input value={valor.telefono} onChange={set("telefono")} inputMode="tel" autoComplete="off" className={claseControl} />
      </Campo>
      <Campo etiqueta="Email" error={errores.email}>
        <input type="email" value={valor.email} onChange={set("email")} autoComplete="off" aria-invalid={!!errores.email || undefined} className={claseControl} />
      </Campo>
      <Campo etiqueta="Dirección" error={errores.direccion} className="sm:col-span-2">
        <input value={valor.direccion} onChange={set("direccion")} autoComplete="off" className={claseControl} />
      </Campo>
      {conNotas && (
        <Campo etiqueta="Notas internas" error={errores.notas} className="sm:col-span-2">
          <textarea value={valor.notas} onChange={set("notas")} rows={2} className={cn(claseControl, "h-auto py-2")} />
        </Campo>
      )}
    </div>
  );
}

/** Advertencia (no bloquea) si el dígito verificador no cierra. */
export function AvisoCedula({ cedula }: { cedula: string }) {
  const d = cedula.replace(/\D/g, "");
  return (
    <Aviso visible={d.length >= 7 && !cedulaValida(d)}>
      El dígito verificador no coincide: revisá la cédula. Si es correcta (o es un documento extranjero) podés seguir igual.
    </Aviso>
  );
}

// ------------------------------------------------------------
// Medio de cobro
// ------------------------------------------------------------

export interface MedioForm {
  medio: MedioCobro | "";
  disciplina_id: number | null;
  tarjeta_ultimos4: string;
  tarjeta_vencimiento: string;
  titular_otro: boolean;
  titular_documento: string;
  titular_nombre: string;
}

export const MEDIO_VACIO: MedioForm = {
  medio: "",
  disciplina_id: null,
  tarjeta_ultimos4: "",
  tarjeta_vencimiento: "",
  titular_otro: false,
  titular_documento: "",
  titular_nombre: "",
};

export function medioAInput(m: MedioForm): MedioInput {
  return {
    medio: m.medio as MedioCobro,
    disciplina_id: m.disciplina_id,
    tarjeta_ultimos4: m.tarjeta_ultimos4,
    tarjeta_vencimiento: m.tarjeta_vencimiento,
    titular_otro: m.titular_otro,
    titular_documento: m.titular_documento,
    titular_nombre: m.titular_nombre,
  };
}

const OPCIONES_MEDIO: { valor: MedioCobro; titulo: string; texto: string; icono: LucideIcon }[] = [
  { valor: "debito_visa", titulo: "Débito Visa", texto: "Débito automático de la tarjeta", icono: CreditCard },
  { valor: "transferencia_club", titulo: "Transferencia al club", texto: "Depósito o transferencia a la cuenta del club", icono: Landmark },
  { valor: "transferencia_disciplina", titulo: "Cuenta de una disciplina", texto: "Paga en la cuenta de su disciplina", icono: Building2 },
  { valor: "efectivo", titulo: "Efectivo", texto: "Paga en secretaría", icono: Banknote },
];

/** "0326" → "03/2026"; deja escribir libremente y agrega la barra. */
function mascaraVencimiento(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 6);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}/${d.slice(2)}`;
}

export function MedioCobroCampos({
  valor,
  onChange,
  errores,
  disciplinas,
  permitirNinguno,
}: {
  valor: MedioForm;
  onChange: (m: MedioForm) => void;
  errores: Record<string, string>;
  disciplinas: Disciplina[];
  permitirNinguno?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {OPCIONES_MEDIO.map((o) => {
          const activo = valor.medio === o.valor;
          const Icono = o.icono;
          return (
            <motion.button
              key={o.valor}
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onChange({ ...valor, medio: activo && permitirNinguno ? "" : o.valor })}
              aria-pressed={activo}
              className={cn(
                "relative flex items-start gap-3 rounded-xl border p-3 text-left transition-colors",
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
                <span className="block text-sm font-medium text-foreground">{o.titulo}</span>
                <span className="block text-xs text-muted-foreground">{o.texto}</span>
              </span>
            </motion.button>
          );
        })}
      </div>
      {errores.medio && <p className="px-0.5 text-xs text-rose-700">{errores.medio}</p>}
      {permitirNinguno && !valor.medio && (
        <p className="px-0.5 text-xs text-muted-foreground">Sin elegir: el medio de cobro se puede cargar después desde la ficha.</p>
      )}

      <AnimatePresence initial={false} mode="popLayout">
        {valor.medio === "transferencia_disciplina" && (
          <motion.div key="disc" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
            <Campo etiqueta="Disciplina" error={errores.disciplina_id}>
              <select
                value={valor.disciplina_id ?? ""}
                onChange={(e) => onChange({ ...valor, disciplina_id: e.target.value ? Number(e.target.value) : null })}
                aria-invalid={!!errores.disciplina_id || undefined}
                className={claseControl}
              >
                <option value="">Elegí la disciplina…</option>
                {disciplinas.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </Campo>
          </motion.div>
        )}
        {valor.medio === "debito_visa" && (
          <motion.div
            key="visa"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="space-y-3 rounded-xl border border-linea bg-superficie/40 p-3"
          >
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Últimos 4 dígitos" error={errores.tarjeta_ultimos4}>
                <input
                  value={valor.tarjeta_ultimos4}
                  onChange={(e) => onChange({ ...valor, tarjeta_ultimos4: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                  inputMode="numeric"
                  placeholder="1234"
                  aria-invalid={!!errores.tarjeta_ultimos4 || undefined}
                  className={cn(claseControl, "tracking-[0.3em]")}
                />
              </Campo>
              <Campo etiqueta="Vencimiento" error={errores.tarjeta_vencimiento}>
                <input
                  value={valor.tarjeta_vencimiento}
                  onChange={(e) => onChange({ ...valor, tarjeta_vencimiento: mascaraVencimiento(e.target.value) })}
                  inputMode="numeric"
                  placeholder="MM/AAAA"
                  aria-invalid={!!errores.tarjeta_vencimiento || undefined}
                  className={claseControl}
                />
              </Campo>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Nunca se guarda el número completo de la tarjeta: solo los últimos 4 dígitos y el vencimiento.
            </p>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={valor.titular_otro}
                onChange={(e) => onChange({ ...valor, titular_otro: e.target.checked })}
                className="size-4 accent-bordo-800"
              />
              La tarjeta es de otra persona
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
                      onChange={(e) => onChange({ ...valor, titular_nombre: e.target.value })}
                      placeholder="Nombre y apellido"
                      className={claseControl}
                    />
                  </Campo>
                  <Campo etiqueta="Documento del titular" error={errores.titular_documento}>
                    <input
                      value={valor.titular_documento}
                      onChange={(e) => onChange({ ...valor, titular_documento: e.target.value })}
                      inputMode="numeric"
                      className={claseControl}
                    />
                  </Campo>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------------
// Planes (cuota social + disciplinas)
// ------------------------------------------------------------

export interface PlanElegido {
  plan_id: number;
  periodicidad: "mensual" | "anual";
}

export function PrecioPlan({ plan, periodicidad }: { plan: PlanConPrecio; periodicidad?: "mensual" | "anual" }) {
  if (!plan.precio) return <span className="text-[11px] text-rose-700">Sin precio cargado</span>;
  const anual = periodicidad === "anual";
  const importe = anual ? (plan.precio.importe_anual ?? plan.precio.importe_mensual * 12) : plan.precio.importe_mensual;
  return (
    <span className="text-[11px] text-muted-foreground tabular-nums">
      {formatImporte(importe, "UYU")} {anual ? "por año" : "por mes"}
    </span>
  );
}

function Periodicidad({
  valor,
  onChange,
  permiteAnual,
  id,
}: {
  valor: "mensual" | "anual";
  onChange: (v: "mensual" | "anual") => void;
  permiteAnual: boolean;
  id: string;
}) {
  if (!permiteAnual) return <span className="text-[11px] text-muted-foreground">Solo mensual</span>;
  return (
    <div className="inline-flex rounded-lg border border-linea bg-white p-0.5">
      {(["mensual", "anual"] as const).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={cn(
            "relative rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            valor === p ? "text-white" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {valor === p && (
            <motion.span
              layoutId={`periodicidad-${id}`}
              className="absolute inset-0 rounded-md bg-bordo-800"
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
            />
          )}
          <span className="relative">{p === "mensual" ? "Mensual" : "Anual"}</span>
        </button>
      ))}
    </div>
  );
}

export function PlanesCampos({
  planes,
  disciplinas,
  social,
  onSocial,
  elegidos,
  onElegidos,
}: {
  planes: PlanConPrecio[];
  disciplinas: Disciplina[];
  social: PlanElegido | null;
  onSocial: (p: PlanElegido | null) => void;
  elegidos: PlanElegido[];
  onElegidos: (l: PlanElegido[]) => void;
}) {
  const sociales = planes.filter((p) => p.tipo === "social" && p.activo);
  const deDisciplina = planes.filter((p) => p.tipo === "disciplina" && p.activo);
  const [disc, setDisc] = useState("");
  const [planNuevo, setPlanNuevo] = useState("");
  const porId = useMemo(() => new Map(planes.map((p) => [p.id, p])), [planes]);
  const conPlanes = disciplinas.filter((d) => deDisciplina.some((p) => p.disciplina_id === d.id));
  const categorias = deDisciplina.filter((p) => String(p.disciplina_id) === disc && !elegidos.some((e) => e.plan_id === p.id));

  function agregar(id: number) {
    const p = porId.get(id);
    if (!p) return;
    onElegidos([...elegidos, { plan_id: id, periodicidad: "mensual" }]);
    setPlanNuevo("");
    setDisc("");
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-editorial text-muted-foreground">Cuota social</div>
        {sociales.length === 0 ? (
          <p className="rounded-xl border border-dashed border-linea p-3 text-xs text-muted-foreground">
            No hay planes de cuota social activos. Crealos en Planes y cuotas.
          </p>
        ) : (
          <div className="space-y-2">
            {sociales.map((p) => {
              const activo = social?.plan_id === p.id;
              return (
                <motion.div
                  key={p.id}
                  layout
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 transition-colors",
                    activo ? "border-bordo-700 bg-bordo-50/60" : "border-linea bg-white"
                  )}
                >
                  <label className="flex min-w-0 cursor-pointer items-center gap-2.5">
                    <input
                      type="radio"
                      name="plan-social"
                      checked={activo}
                      onChange={() => onSocial({ plan_id: p.id, periodicidad: social?.periodicidad ?? "mensual" })}
                      className="size-4 accent-bordo-800"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{p.nombre}</span>
                      <PrecioPlan plan={p} periodicidad={activo ? social?.periodicidad : "mensual"} />
                    </span>
                  </label>
                  {activo && (
                    <Periodicidad
                      id="social"
                      valor={social.periodicidad}
                      permiteAnual={p.permite_anual}
                      onChange={(v) => onSocial({ plan_id: p.id, periodicidad: v })}
                    />
                  )}
                </motion.div>
              );
            })}
            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-1.5 text-sm text-muted-foreground">
              <input
                type="radio"
                name="plan-social"
                checked={social === null}
                onChange={() => onSocial(null)}
                className="size-4 accent-bordo-800"
              />
              Sin cuota social (exonerado)
            </label>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-editorial text-muted-foreground">Disciplinas</div>
        <AnimatePresence initial={false}>
          {elegidos.map((e) => {
            const p = porId.get(e.plan_id);
            if (!p) return null;
            return (
              <motion.div
                key={e.plan_id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-linea bg-white p-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {p.disciplina} <span className="font-normal text-muted-foreground">· {p.nombre}</span>
                  </div>
                  <PrecioPlan plan={p} periodicidad={e.periodicidad} />
                </div>
                <div className="flex items-center gap-2">
                  <Periodicidad
                    id={`d${p.id}`}
                    valor={e.periodicidad}
                    permiteAnual={p.permite_anual}
                    onChange={(v) => onElegidos(elegidos.map((x) => (x.plan_id === p.id ? { ...x, periodicidad: v } : x)))}
                  />
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    onClick={() => onElegidos(elegidos.filter((x) => x.plan_id !== p.id))}
                    aria-label={`Quitar ${p.nombre}`}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-rose-50 hover:text-rose-700"
                  >
                    <Trash2 className="size-4" />
                  </motion.button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {conPlanes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-linea p-3 text-xs text-muted-foreground">
            No hay planes de disciplina activos.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 rounded-xl border border-dashed border-linea p-3 sm:grid-cols-[1fr_1fr_auto]">
            <select
              value={disc}
              onChange={(e) => {
                setDisc(e.target.value);
                setPlanNuevo("");
              }}
              aria-label="Disciplina"
              className={claseControl}
            >
              <option value="">Disciplina…</option>
              {conPlanes.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
            <select
              value={planNuevo}
              onChange={(e) => setPlanNuevo(e.target.value)}
              disabled={!disc}
              aria-label="Categoría"
              className={claseControl}
            >
              <option value="">Categoría…</option>
              {categorias.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                  {p.precio ? ` — ${formatImporte(p.precio.importe_mensual, "UYU")}` : " — sin precio"}
                </option>
              ))}
            </select>
            <Boton variante="secundario" disabled={!planNuevo} onClick={() => agregar(Number(planNuevo))}>
              <Plus className="size-4" />
              Agregar
            </Boton>
          </div>
        )}
      </div>
    </div>
  );
}

/** Plan con su vigencia de precio, para listas compactas. */
export function DescripcionPrecio({ plan }: { plan: PlanConPrecio }) {
  if (!plan.precio) return <span className="text-rose-700">Sin precio</span>;
  return (
    <span className="tabular-nums">
      {formatImporte(plan.precio.importe_mensual, "UYU")}/mes
      {plan.precio.importe_anual ? ` · ${formatImporte(plan.precio.importe_anual, "UYU")}/año` : ""}
      <span className="text-muted-foreground"> desde {formatFecha(plan.precio.vigente_desde).slice(3)}</span>
    </span>
  );
}
