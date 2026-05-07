import { createHash } from "crypto";

export type MovimientoParsed = {
  fecha: string; // YYYY-MM-DD
  descripcion: string;
  referencia: string | null;
  monto: number; // siempre positivo
  tipo: "ingreso" | "egreso";
  saldo_post: number | null;
  hash_dedupe: string;
};

export type ResultadoParseo = {
  movimientos: MovimientoParsed[];
  fecha_desde: string | null;
  fecha_hasta: string | null;
  saldo_inicial: number | null;
  saldo_final: number | null;
  moneda_detectada: "UYU" | "USD" | null;
};

const MESES_EN: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

const MONEDA_MAP: Record<string, "UYU" | "USD"> = {
  URGP: "UYU", // pesos uruguayos
  USDP: "USD", // dólares (ITAÚ usa "USDP" o similar; ajustable)
  USD: "USD",
  UYU: "UYU",
};

/**
 * Parser del CSV de extracto ITAÚ Uruguay (formato real).
 *
 * Encabezado esperado:
 *   CUENTA,MONEDA,FECHA,XX,DEBE,HABER,CONCEPTO,SALDO,REFERENCIA
 *
 * - Fecha: DDMMMYY en inglés (ej: "06APR26" → 2026-04-06).
 * - DEBE/HABER: numéricos con padding de ceros y dos decimales.
 * - Filas SALDO INICIAL y SALDO FINAL se ignoran como movimientos pero
 *   se usan para reportar saldos del extracto.
 * - REFERENCIA y CONCEPTO se trimean (vienen con padding de espacios).
 */
export function parsearItauCSV(
  contenido: string,
  cuentaId: number
): ResultadoParseo {
  const lineas = contenido
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean);

  if (lineas.length === 0) {
    return {
      movimientos: [],
      fecha_desde: null,
      fecha_hasta: null,
      saldo_inicial: null,
      saldo_final: null,
      moneda_detectada: null,
    };
  }

  // Primer fila debe ser el header
  const headerCampos = parseCsvLine(lineas[0]);
  const idxCuenta = headerCampos.findIndex((c) => /^cuenta$/i.test(c));
  const idxMoneda = headerCampos.findIndex((c) => /^moneda$/i.test(c));
  const idxFecha = headerCampos.findIndex((c) => /^fecha$/i.test(c));
  const idxDebe = headerCampos.findIndex((c) => /^debe$/i.test(c));
  const idxHaber = headerCampos.findIndex((c) => /^haber$/i.test(c));
  const idxConcepto = headerCampos.findIndex((c) => /^concepto$/i.test(c));
  const idxSaldo = headerCampos.findIndex((c) => /^saldo$/i.test(c));
  const idxRef = headerCampos.findIndex((c) => /^referencia$/i.test(c));

  if (idxFecha < 0 || idxDebe < 0 || idxHaber < 0 || idxConcepto < 0) {
    return {
      movimientos: [],
      fecha_desde: null,
      fecha_hasta: null,
      saldo_inicial: null,
      saldo_final: null,
      moneda_detectada: null,
    };
  }

  const movimientos: MovimientoParsed[] = [];
  let fechaMin: string | null = null;
  let fechaMax: string | null = null;
  let saldoInicial: number | null = null;
  let saldoFinal: number | null = null;
  let monedaDetectada: "UYU" | "USD" | null = null;

  for (let i = 1; i < lineas.length; i++) {
    const campos = parseCsvLine(lineas[i]);
    if (campos.length < 7) continue;

    const monedaRaw = idxMoneda >= 0 ? campos[idxMoneda]?.trim().toUpperCase() : "";
    const moneda = MONEDA_MAP[monedaRaw] ?? null;
    if (!monedaDetectada && moneda) monedaDetectada = moneda;

    const fechaRaw = (campos[idxFecha] ?? "").trim();
    const fecha = parsearFechaItau(fechaRaw);
    if (!fecha) continue;

    const concepto = (campos[idxConcepto] ?? "").trim();
    const referencia = idxRef >= 0 ? (campos[idxRef] ?? "").trim() || null : null;
    const debe = parsearMontoItau(campos[idxDebe]);
    const haber = parsearMontoItau(campos[idxHaber]);
    const saldo = idxSaldo >= 0 ? parsearMontoItau(campos[idxSaldo]) : null;

    // Detectar SALDO INICIAL / FINAL (no son movimientos reales)
    const conceptoLower = concepto.toLowerCase();
    if (conceptoLower.startsWith("saldo")) {
      if (conceptoLower.includes("inicial")) {
        saldoInicial = saldo;
      } else if (conceptoLower.includes("final")) {
        saldoFinal = saldo;
      }
      continue;
    }

    const monto = haber > 0 ? haber : debe;
    if (monto === 0) continue;
    const tipo: "ingreso" | "egreso" = haber > 0 ? "ingreso" : "egreso";

    // Descripción combinada: concepto + referencia (si hay)
    const descripcion =
      referencia && referencia.length > 0
        ? `${concepto} — ${referencia}`
        : concepto;

    const hash_dedupe = computarHash(cuentaId, fecha, concepto, monto, tipo, saldo);

    movimientos.push({
      fecha,
      descripcion,
      referencia,
      monto,
      tipo,
      saldo_post: saldo,
      hash_dedupe,
    });

    if (!fechaMin || fecha < fechaMin) fechaMin = fecha;
    if (!fechaMax || fecha > fechaMax) fechaMax = fecha;
  }

  return {
    movimientos,
    fecha_desde: fechaMin,
    fecha_hasta: fechaMax,
    saldo_inicial: saldoInicial,
    saldo_final: saldoFinal,
    moneda_detectada: monedaDetectada,
  };
}

/**
 * Parsea una línea CSV simple. ITAÚ no usa comillas, pero por las dudas las soporta.
 */
function parseCsvLine(linea: string): string[] {
  const result: string[] = [];
  let actual = "";
  let inQuotes = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (c === "," && !inQuotes) {
      result.push(actual);
      actual = "";
      continue;
    }
    actual += c;
  }
  result.push(actual);
  return result;
}

/**
 * "06APR26" → "2026-04-06"
 */
function parsearFechaItau(s: string): string | null {
  const t = s.trim().toUpperCase();
  const m = t.match(/^(\d{2})([A-Z]{3})(\d{2,4})$/);
  if (!m) return null;
  const [, dd, mes, yy] = m;
  const mm = MESES_EN[mes];
  if (!mm) return null;
  const yyyy = yy.length === 2 ? `20${yy}` : yy;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * "000000001600.00" → 1600
 */
function parsearMontoItau(s: string | undefined): number {
  if (!s) return 0;
  const limpio = s.trim().replace(/^0+(?=\d)/, "");
  const n = parseFloat(limpio);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function computarHash(
  cuentaId: number,
  fecha: string,
  concepto: string,
  monto: number,
  tipo: string,
  saldo: number | null
): string {
  // Incluir saldo_post hace el hash más estable cuando hay 2 movimientos idénticos
  // el mismo día (ITAÚ los diferencia por orden y saldo resultante).
  return createHash("md5")
    .update(
      `${cuentaId}|${fecha}|${concepto.trim().toLowerCase()}|${monto.toFixed(2)}|${tipo}|${saldo ?? ""}`
    )
    .digest("hex");
}
