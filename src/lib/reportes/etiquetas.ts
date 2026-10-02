import type { Canal } from "@/types/reportes";

/** Textos comunes a la pantalla, el Excel y el PDF de los reportes de tienda. */

export const NOMBRE_CANAL: Record<Canal, string> = {
  online: "Online",
  pos: "POS",
  disciplina: "Disciplinas",
};

export const NOMBRE_METODO: Record<string, string> = {
  transferencia: "Transferencia",
  efectivo: "Efectivo",
  mixto: "Efectivo + transferencia",
  cuenta_corriente: "Cuenta de la disciplina",
  mercadopago: "MercadoPago",
  mercadopago_qr: "MercadoPago QR",
  sin_metodo: "Sin método",
  devoluciones: "Devoluciones y cambios",
};

export const NOMBRE_ESTADO_DONACION: Record<string, string> = {
  pendiente_pago: "Pendiente de cobro",
  cobrada: "Cobrada, por transferir",
  transferida: "Transferida a la Olla",
  cancelada: "Cancelada",
};

export const NOMBRE_ESTADO_PEDIDO: Record<string, string> = {
  pendiente: "Pendiente",
  pendiente_verificacion: "Por verificar",
  pagado: "Pagado",
  encargado: "Encargado",
  preparando: "Preparando",
  listo_retiro: "Listo para retirar",
  retirado: "Retirado",
  cancelado: "Cancelado",
};

export const NOMBRE_SCOPE = {
  tienda: "General",
  donaciones: "Donaciones",
  promocodes: "Promocodes",
} as const;

export const nombreMetodo = (k: string) => NOMBRE_METODO[k] ?? k;

/** 12.345 → "12,3 %"; null → "—". */
export function formatPct(v: number | null | undefined, decimales = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toLocaleString("es-UY", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })} %`;
}

/** "2026-W40" → "Sem. 40 (2026)"; "2026-10-02" → "02/10". */
export function etiquetaBucket(clave: string): string {
  const sem = clave.match(/^(\d{4})-W(\d{2})$/);
  if (sem) return `Sem. ${Number(sem[2])}`;
  const [, m, d] = clave.split("-");
  return `${d}/${m}`;
}
