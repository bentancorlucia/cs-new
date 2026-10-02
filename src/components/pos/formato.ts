// Formatos y utilidades del POS (sirven en cliente y servidor).

const enteros = new Intl.NumberFormat("es-UY", { maximumFractionDigits: 0 });
const conCentesimos = new Intl.NumberFormat("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1234.5 → "$ 1.234,50"; 1500 → "$ 1.500". */
export function pesos(n: number | null | undefined): string {
  const v = Math.round(Number(n ?? 0) * 100) / 100;
  return `$ ${Number.isInteger(v) ? enteros.format(v) : conCentesimos.format(v)}`;
}

/** "1.234,50" / "1234.5" / "1234,5" → 1234.5 (entrada del teclado numérico). */
export function parseMonto(texto: string): number {
  const limpio = texto.trim().replace(/\s|\$/g, "");
  if (!limpio) return 0;
  // Con coma decimal, o con puntos agrupando de a tres ("1.500"): los puntos son de miles.
  const normal = limpio.includes(",")
    ? limpio.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(limpio)
      ? limpio.replace(/\./g, "")
      : limpio;
  const n = Number(normal);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** UUID v4 para la clave de idempotencia (con respaldo si no hay crypto.randomUUID). */
export function nuevaClave(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** "2026-10-02T14:05:00Z" → "02/10/2026 11:05" en hora de Uruguay. */
export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("es-UY", {
    timeZone: "America/Montevideo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(iso))
    .replace(",", "");
}

/** Solo la hora (HH:MM) en Uruguay. */
export function hora(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("es-UY", {
    timeZone: "America/Montevideo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
