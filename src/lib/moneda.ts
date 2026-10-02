export type Moneda = "UYU" | "USD";

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
