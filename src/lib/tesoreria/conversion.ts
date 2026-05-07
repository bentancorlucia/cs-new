import type { Cotizacion } from "./bcu";

export type Moneda = "UYU" | "USD";

/**
 * Convert an amount from one currency to another using the BCU mid rate
 * ((compra+venta)/2). Returns null if currencies require conversion but no
 * rate is available.
 */
export function convertir(
  monto: number,
  desde: Moneda,
  hasta: Moneda,
  cotizacion: Cotizacion | null
): number | null {
  if (desde === hasta) return monto;
  if (!cotizacion) return null;

  const tc = (Number(cotizacion.compra) + Number(cotizacion.venta)) / 2;
  if (desde === "USD" && hasta === "UYU") return monto * tc;
  if (desde === "UYU" && hasta === "USD") return monto / tc;
  return null;
}

const FORMATTERS: Record<Moneda, Intl.NumberFormat> = {
  UYU: new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "UYU",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
  USD: new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
};

export function formatearMoneda(monto: number, moneda: Moneda): string {
  return FORMATTERS[moneda].format(monto);
}

export function formatearMonedaCompacta(monto: number, moneda: Moneda): string {
  const abs = Math.abs(monto);
  const signo = monto < 0 ? "-" : "";
  const simbolo = moneda === "UYU" ? "$" : "US$";
  if (abs >= 1_000_000) return `${signo}${simbolo} ${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${signo}${simbolo} ${(abs / 1_000).toFixed(1)}K`;
  return formatearMoneda(monto, moneda);
}
