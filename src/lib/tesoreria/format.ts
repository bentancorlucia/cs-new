/**
 * Format a monetary amount for display.
 * @param monto - The amount to format
 * @param moneda - "UYU" or "USD"
 * @param showSign - Whether to show +/- prefix
 */
export function formatMonto(
  monto: number,
  moneda: "UYU" | "USD" = "UYU",
  showSign = false
): string {
  const prefix = moneda === "USD" ? "U$" : "$";
  const sign = showSign ? (monto >= 0 ? "+" : "") : "";
  return `${sign}${prefix}${monto.toLocaleString("es-UY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

/**
 * Format a date string (YYYY-MM-DD) to dd/mm/yy.
 */
export function formatFecha(fecha: string): string {
  const [year, month, day] = fecha.split("-");
  return `${day}/${month}/${year?.slice(2)}`;
}

/**
 * Get the first day of the current month as YYYY-MM-DD.
 */
export function primerDiaMes(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Get today's date as YYYY-MM-DD.
 */
export function hoy(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Get the Spanish name for a month (1-indexed).
 */
export function nombreMes(mes: number): string {
  const meses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  return meses[mes - 1] || "";
}

/**
 * Account type labels in Spanish.
 */
export const TIPO_CUENTA_LABELS: Record<string, string> = {
  bancaria: "Bancaria",
  mercadopago: "MercadoPago",
  caja_chica: "Caja Chica",
  virtual: "Virtual",
};
