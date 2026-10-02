import type { Database } from "@/types/contabilidad";

export type ClaseCuenta = Database["contabilidad"]["Enums"]["clase_cuenta"];
export type TipoAsiento = Database["contabilidad"]["Enums"]["tipo_asiento"];
export type EstadoAsiento = Database["contabilidad"]["Enums"]["estado_asiento"];

const formatos = new Map<string, Intl.NumberFormat>();

/** 1234.5 → "1.234,50" (con símbolo si se pide moneda). */
export function formatImporte(valor: number | string | null | undefined, moneda?: string): string {
  const n = Number(valor ?? 0);
  const clave = moneda ?? "";
  let f = formatos.get(clave);
  if (!f) {
    f = new Intl.NumberFormat("es-UY", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    formatos.set(clave, f);
  }
  const texto = f.format(n);
  if (!moneda) return texto;
  return `${moneda === "USD" ? "US$" : "$"} ${texto}`;
}

/** "2026-01-31" → "31/01/2026" sin pasar por Date (evita corrimientos de zona horaria). */
export function formatFecha(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Fecha de hoy en Uruguay como "YYYY-MM-DD". */
export function hoyUruguay(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Montevideo" }).format(new Date());
}

/**
 * Saldo con el signo de presentación de la clase:
 * activo y egreso → debe − haber; pasivo, patrimonio e ingreso → haber − debe.
 * Así las regularizadoras (amortizaciones, previsiones) restan solas.
 */
export function saldoPresentacion(clase: ClaseCuenta, debe: number, haber: number): number {
  return clase === "activo" || clase === "egreso" ? debe - haber : haber - debe;
}

export const NOMBRE_CLASE: Record<ClaseCuenta, string> = {
  activo: "Activo",
  pasivo: "Pasivo",
  patrimonio: "Patrimonio",
  ingreso: "Ingresos",
  egreso: "Egresos",
};

export const NOMBRE_TIPO_ASIENTO: Record<TipoAsiento, string> = {
  manual: "Manual",
  automatico: "Automático",
  apertura: "Apertura",
  cierre: "Cierre",
  refundicion: "Refundición",
  revaluacion: "Revaluación",
  reversion: "Reversión",
};

export const NOMBRE_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** Mensaje legible a partir del error de Postgres/PostgREST (las reglas ya hablan en español). */
export function mensajeError(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return "Error desconocido";
  if (error.code === "42501") return "No tenés permiso para esta operación";
  return error.message ?? "Error desconocido";
}
