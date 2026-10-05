"use client";

import { Banknote, Building2, Clock, CreditCard, Landmark, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import {
  NOMBRE_TIPO_CAMBIO,
  textoMedio,
  type CambioDisciplina,
  type MedioSocio,
  type SocioDisciplina,
  type TipoCambio,
} from "@/lib/socios/panel-disciplina";
import { NOMBRE_FUNCION_STAFF, type FuncionStaff } from "@/lib/socios/staff";

const pill =
  "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap";

const ICONO_MEDIO: Record<string, LucideIcon> = {
  debito_visa: CreditCard,
  transferencia_club: Landmark,
  transferencia_disciplina: Building2,
  efectivo: Banknote,
};

/** "Visa ****1234 · ITAU · vence 02/29" con ícono; en rojo si la tarjeta venció. */
export function MedioSocioTexto({ medio, vencida, className }: { medio: MedioSocio | null; vencida?: boolean; className?: string }) {
  const Icono = medio ? (ICONO_MEDIO[medio.medio] ?? Landmark) : CreditCard;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", !medio && "text-muted-foreground", vencida && "text-rose-700", className)}>
      <Icono className="size-3.5 shrink-0 opacity-70" />
      <span className="truncate tabular-nums">{textoMedio(medio)}</span>
      {vencida && <span className={cn(pill, "border-rose-200 bg-rose-50 text-rose-700")}>Vencida</span>}
    </span>
  );
}

/** Al día / N cuotas vencidas $. */
export function SituacionSocio({ s }: { s: Pick<SocioDisciplina, "al_dia" | "cuotas_vencidas" | "deuda_vencida"> }) {
  if (s.al_dia && s.cuotas_vencidas === 0)
    return <span className={cn(pill, "border-emerald-200 bg-emerald-50 text-emerald-700")}>Al día</span>;
  return (
    <span
      className={cn(
        pill,
        s.al_dia ? "border-dorado-300 bg-dorado-100 text-dorado-800" : "border-rose-200 bg-rose-50 text-rose-700"
      )}
    >
      {s.cuotas_vencidas} vencida{s.cuotas_vencidas === 1 ? "" : "s"} · {formatImporte(s.deuda_vencida)}
    </span>
  );
}

export function BadgePendienteTesoreria({ cantidad }: { cantidad: number }) {
  if (!cantidad) return null;
  return (
    <span className={cn(pill, "border-amber-200 bg-amber-50 text-amber-800")} title="Tesorería todavía no lo cargó en el débito">
      <Clock className="size-3" />
      {cantidad === 1 ? "Cambio pendiente" : `${cantidad} cambios pendientes`}
    </span>
  );
}

const ESTILO_CAMBIO: Partial<Record<TipoCambio, string>> = {
  alta: "border-emerald-200 bg-emerald-50 text-emerald-700",
  reingreso: "border-emerald-200 bg-emerald-50 text-emerald-700",
  inscripcion: "border-emerald-200 bg-emerald-50 text-emerald-700",
  baja_club: "border-rose-200 bg-rose-50 text-rose-700",
  fin_inscripcion: "border-rose-200 bg-rose-50 text-rose-700",
  baja_anulada: "border-sky-200 bg-sky-50 text-sky-800",
  medio_cobro: "border-violet-200 bg-violet-50 text-violet-800",
  tarjeta: "border-violet-200 bg-violet-50 text-violet-800",
  plan_nuevo: "border-dorado-300 bg-dorado-100 text-dorado-800",
  precio: "border-dorado-300 bg-dorado-100 text-dorado-800",
  cobro: "border-teal-200 bg-teal-50 text-teal-800",
  staff_alta: "border-emerald-200 bg-emerald-50 text-emerald-700",
  staff_baja: "border-rose-200 bg-rose-50 text-rose-700",
  staff_cambio: "border-sky-200 bg-sky-50 text-sky-800",
};

export function BadgeTipoCambio({ tipo }: { tipo: TipoCambio }) {
  return <span className={cn(pill, ESTILO_CAMBIO[tipo] ?? "border-linea bg-superficie text-muted-foreground")}>{NOMBRE_TIPO_CAMBIO[tipo] ?? tipo}</span>;
}

export function BadgeOrigen({ origen }: { origen: CambioDisciplina["origen"] }) {
  return (
    <span className={cn(pill, origen === "representante" ? "border-bordo-100 bg-bordo-50 text-bordo-800" : "border-slate-200 bg-slate-50 text-slate-700")}>
      {origen === "representante" ? "Disciplina" : "Club"}
    </span>
  );
}

/** Estado del cambio para tesorería (carga en el portal del débito). */
export function EstadoDebito({ c }: { c: CambioDisciplina }) {
  if (c.estado_debito === "no_aplica") return null;
  if (c.estado_debito === "pendiente")
    return (
      <span className={cn(pill, "border-amber-200 bg-amber-50 text-amber-800")}>
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
        Pendiente de cargar en Visa
      </span>
    );
  if (c.estado_debito === "aplicado")
    return (
      <span className={cn(pill, "border-emerald-200 bg-emerald-50 text-emerald-700")}>
        Cargado en Visa{c.aplicado_at ? ` el ${formatFecha(c.aplicado_at.slice(0, 10))}` : ""}
      </span>
    );
  return (
    <span className={cn(pill, "max-w-full border-slate-200 bg-slate-100 text-slate-600")}>
      <span className="truncate">Descartado{c.notas_aplicacion ? `: ${c.notas_aplicacion}` : ""}</span>
    </span>
  );
}

/** Valor de un campo de antes/después, legible. */
export function valorCambio(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : formatImporte(v);
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return formatFecha(v);
    return v;
  }
  return JSON.stringify(v);
}

const ETIQUETA_CAMPO: Record<string, string> = {
  email: "Email",
  telefono: "Teléfono",
  direccion: "Dirección",
  fecha_nacimiento: "Nacimiento",
  medio: "Medio",
  tarjeta: "Tarjeta",
  tarjeta_ultimos4: "Tarjeta",
  tarjeta_vencimiento: "Vencimiento",
  vencimiento: "Vencimiento",
  tarjeta_emisor: "Emisor",
  emisor: "Emisor",
  titular_nombre: "Titular",
  titular: "Titular",
  titular_documento: "Doc. titular",
  plan: "Plan",
  importe: "Importe",
  desde: "Desde",
  hasta: "Hasta",
  motivo: "Motivo",
  referencia: "Referencia",
  con_debito: "Con débito",
  funcion: "Función",
  detalle: "Detalle",
};

const OCULTOS = new Set(["plan_id", "persona_id", "suscripcion_id", "cobro_id", "disciplina_id", "id"]);

export function etiquetaCampo(k: string) {
  return ETIQUETA_CAMPO[k] ?? k.replace(/_/g, " ");
}

/** La función del staff con su nombre ("Entrenador/a", no "entrenador"). */
const legible = (campo: string, v: unknown) =>
  campo === "funcion" && typeof v === "string" ? (NOMBRE_FUNCION_STAFF[v as FuncionStaff] ?? v) : v;

/** Pares campo: antes → después (solo los que cambiaron o son nuevos). */
export function diferencias(antes: Record<string, unknown> | null, despues: Record<string, unknown> | null) {
  const claves = [...new Set([...Object.keys(antes ?? {}), ...Object.keys(despues ?? {})])].filter((k) => !OCULTOS.has(k));
  return claves
    .map((k) => ({ campo: k, antes: legible(k, antes?.[k]), despues: legible(k, despues?.[k]) }))
    .filter((d) => JSON.stringify(d.antes) !== JSON.stringify(d.despues));
}
