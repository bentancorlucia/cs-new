/**
 * Extractos bancarios: lectura del CSV de Itaú y verificación del cuadre.
 *
 * Funciones puras (sin base ni APIs del navegador): se usan en el
 * importador de /contabilidad/conciliacion (cliente) y desde el servidor
 * MCP. El cuadre replica lo que exige `contabilidad.importar_extracto`
 * para mostrar los errores antes de llamar a la base:
 *   saldo inicial + Σ movimientos = saldo final, y cada saldo informado
 *   por fila = acumulado hasta esa fila.
 *
 * Formato Itaú Uruguay (exportación "movimientos a CSV"):
 *   CUENTA,MONEDA,FECHA,XX,DEBE,HABER,CONCEPTO,SALDO,REFERENCIA
 *   - FECHA: DDMMMYY con el mes en inglés ("06APR26" → 2026-04-06).
 *   - DEBE (sale de la cuenta) / HABER (entra): con ceros a la izquierda.
 *   - Filas "SALDO INICIAL" y "SALDO FINAL": no son movimientos; traen
 *     los saldos del período en la columna SALDO.
 */

/** Movimiento tal como lo recibe `importar_extracto` (importe + entra / − sale). */
export type MovimientoExtracto = {
  fecha: string; // YYYY-MM-DD
  concepto: string;
  referencia: string | null;
  importe: number;
  saldo: number | null;
};

export type ResultadoItau = {
  movimientos: MovimientoExtracto[];
  /** Número de cuenta del banco (primera fila con dato). */
  cuenta: string | null;
  moneda: "UYU" | "USD" | null;
  /** Primera y última fecha del archivo (incluye las filas de saldo). */
  fechaDesde: string | null;
  fechaHasta: string | null;
  saldoInicial: number | null;
  saldoFinal: number | null;
  /** Fechas de las filas SALDO INICIAL / FINAL, si vienen. */
  fechaSaldoInicial: string | null;
  fechaSaldoFinal: string | null;
  /** Filas que no se pudieron leer (número de línea del archivo, 1 = encabezado). */
  ignoradas: { linea: number; motivo: string }[];
};

const MESES_EN: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

const MONEDAS: Record<string, "UYU" | "USD"> = {
  URGP: "UYU",
  UYU: "UYU",
  "$": "UYU",
  USDP: "USD",
  USD: "USD",
  "U$S": "USD",
  "US$": "USD",
};

export class ErrorFormatoExtracto extends Error {}

/** Lee el CSV de Itaú. Lanza `ErrorFormatoExtracto` si no tiene el encabezado esperado. */
export function parsearItauCSV(contenido: string): ResultadoItau {
  const lineas = contenido.replace(/^﻿/, "").split(/\r?\n/);
  const primera = lineas.findIndex((l) => l.trim() !== "");
  if (primera < 0) throw new ErrorFormatoExtracto("El archivo está vacío");

  const sep = detectarSeparador(lineas[primera]);
  const encabezado = separarCampos(lineas[primera], sep).map((c) => c.trim().toUpperCase());
  const col = (nombre: string) => encabezado.indexOf(nombre);
  const idx = {
    cuenta: col("CUENTA"),
    moneda: col("MONEDA"),
    fecha: col("FECHA"),
    debe: col("DEBE"),
    haber: col("HABER"),
    concepto: col("CONCEPTO"),
    saldo: col("SALDO"),
    referencia: col("REFERENCIA"),
  };
  if (idx.fecha < 0 || idx.debe < 0 || idx.haber < 0 || idx.concepto < 0) {
    throw new ErrorFormatoExtracto(
      "No parece un extracto de Itaú: el encabezado tiene que incluir FECHA, DEBE, HABER y CONCEPTO"
    );
  }

  const r: ResultadoItau = {
    movimientos: [],
    cuenta: null,
    moneda: null,
    fechaDesde: null,
    fechaHasta: null,
    saldoInicial: null,
    saldoFinal: null,
    fechaSaldoInicial: null,
    fechaSaldoFinal: null,
    ignoradas: [],
  };

  const verFecha = (f: string) => {
    if (!r.fechaDesde || f < r.fechaDesde) r.fechaDesde = f;
    if (!r.fechaHasta || f > r.fechaHasta) r.fechaHasta = f;
  };

  for (let i = primera + 1; i < lineas.length; i++) {
    const texto = lineas[i];
    if (!texto.trim()) continue;
    const nro = i + 1;
    const campos = separarCampos(texto, sep);
    const campo = (j: number) => (j >= 0 ? (campos[j] ?? "").trim() : "");

    if (!r.cuenta && campo(idx.cuenta)) r.cuenta = campo(idx.cuenta);
    if (!r.moneda) r.moneda = MONEDAS[campo(idx.moneda).toUpperCase()] ?? null;

    const concepto = campo(idx.concepto).replace(/\s+/g, " ");
    const fecha = parsearFechaItau(campo(idx.fecha));
    const saldo = idx.saldo >= 0 ? parsearMonto(campo(idx.saldo)) : null;
    const conceptoMin = concepto.toLowerCase();

    if (conceptoMin.startsWith("saldo") && (conceptoMin.includes("inicial") || conceptoMin.includes("anterior"))) {
      r.saldoInicial = saldo;
      r.fechaSaldoInicial = fecha;
      if (fecha) verFecha(fecha);
      continue;
    }
    if (conceptoMin.startsWith("saldo") && (conceptoMin.includes("final") || conceptoMin.includes("actual"))) {
      r.saldoFinal = saldo;
      r.fechaSaldoFinal = fecha;
      if (fecha) verFecha(fecha);
      continue;
    }

    if (!fecha) {
      r.ignoradas.push({ linea: nro, motivo: `fecha ilegible "${campo(idx.fecha)}"` });
      continue;
    }
    const debe = parsearMonto(campo(idx.debe)) ?? 0;
    const haber = parsearMonto(campo(idx.haber)) ?? 0;
    const importe = redondear(Math.abs(haber) - Math.abs(debe));
    if (importe === 0) {
      r.ignoradas.push({ linea: nro, motivo: "sin importe" });
      continue;
    }
    const referencia = campo(idx.referencia).replace(/\s+/g, " ") || null;
    r.movimientos.push({
      fecha,
      concepto: concepto || referencia || "Movimiento",
      referencia,
      importe,
      saldo,
    });
    verFecha(fecha);
  }

  return r;
}

function detectarSeparador(encabezado: string): string {
  const comas = (encabezado.match(/,/g) ?? []).length;
  const puntoComa = (encabezado.match(/;/g) ?? []).length;
  return puntoComa > comas ? ";" : ",";
}

/** Una línea CSV; Itaú no usa comillas, pero se aceptan (con "" como comilla escapada). */
function separarCampos(linea: string, sep: string): string[] {
  const salida: string[] = [];
  let actual = "";
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (comillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else {
        comillas = !comillas;
      }
      continue;
    }
    if (c === sep && !comillas) {
      salida.push(actual);
      actual = "";
      continue;
    }
    actual += c;
  }
  salida.push(actual);
  return salida;
}

/** "06APR26" → "2026-04-06". También acepta "06/04/2026" y "2026-04-06". */
export function parsearFechaItau(s: string): string | null {
  const t = s.trim().toUpperCase();
  let y: number, m: number, d: number;
  let r = t.match(/^(\d{1,2})([A-Z]{3})(\d{2}|\d{4})$/);
  if (r) {
    const mm = MESES_EN[r[2]];
    if (!mm) return null;
    d = Number(r[1]);
    m = Number(mm);
    y = r[3].length === 2 ? 2000 + Number(r[3]) : Number(r[3]);
  } else if ((r = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) {
    d = Number(r[1]);
    m = Number(r[2]);
    y = Number(r[3]);
  } else if ((r = t.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
    y = Number(r[1]);
    m = Number(r[2]);
    d = Number(r[3]);
  } else {
    return null;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * "000000001600.00" → 1600; "-000000000050.00" o "000000000050.00-" → −50.
 * Acepta también coma decimal ("1.600,50"). Vacío → null.
 */
export function parsearMonto(s: string | undefined): number | null {
  let t = (s ?? "").replace(/\s|\$|U\$S|US\$/gi, "");
  if (!t) return null;
  let negativo = false;
  if (/^\(.*\)$/.test(t)) {
    negativo = true;
    t = t.slice(1, -1);
  }
  if (t.startsWith("-")) {
    negativo = true;
    t = t.slice(1);
  } else if (t.endsWith("-")) {
    negativo = true;
    t = t.slice(0, -1);
  } else if (t.startsWith("+")) {
    t = t.slice(1);
  }
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return redondear(negativo ? -n : n);
}

// ------------------------------------------------------------
// Cuadre
// ------------------------------------------------------------

/** A centavos sin ruido de coma flotante. */
export function aCentavos(n: number): number {
  return Math.round(Number((n * 100).toPrecision(15)));
}

export function redondear(n: number): number {
  return aCentavos(n) / 100;
}

export type FilaCuadre = {
  /** Acumulado después de la fila (saldo inicial + movimientos hasta acá). */
  acumulado: number;
  /** Saldo informado − acumulado; null si la fila no trae saldo. */
  diferenciaSaldo: number | null;
  /**
   * "nuevo": la diferencia de saldo aparece en esta fila (el error está acá
   * o justo antes); "arrastra": es la misma diferencia de una fila anterior.
   */
  errorSaldo: "nuevo" | "arrastra" | null;
  fueraDePeriodo: boolean;
  sinImporte: boolean;
  sinConcepto: boolean;
};

export type ProblemaCuadre = { fila: number | null; mensaje: string };

export type CuadreExtracto = {
  filas: FilaCuadre[];
  entradas: number;
  salidas: number;
  /** saldo inicial + Σ movimientos */
  saldoCalculado: number;
  /** saldo final informado − saldo calculado (0 = cierra). */
  diferenciaFinal: number | null;
  problemas: ProblemaCuadre[];
  ok: boolean;
};

/**
 * Verifica un extracto antes de importarlo. `fila` en los problemas es el
 * índice base 0 del movimiento (null = el extracto en general).
 */
export function verificarCuadre(input: {
  desde: string | null;
  hasta: string | null;
  saldoInicial: number | null;
  saldoFinal: number | null;
  movimientos: { fecha: string | null; concepto: string; importe: number | null; saldo: number | null }[];
  moneda?: string;
}): CuadreExtracto {
  const problemas: ProblemaCuadre[] = [];
  const fmt = (n: number) => formatoSimple(n);
  const desde = input.desde;
  const hasta = input.hasta;
  if (!desde || !hasta) problemas.push({ fila: null, mensaje: "Indicá el período del extracto" });
  else if (hasta < desde) problemas.push({ fila: null, mensaje: "La fecha final es anterior a la inicial" });
  if (input.saldoInicial === null) problemas.push({ fila: null, mensaje: "Falta el saldo inicial" });
  if (input.saldoFinal === null) problemas.push({ fila: null, mensaje: "Falta el saldo final" });

  let acum = aCentavos(input.saldoInicial ?? 0);
  let entradas = 0;
  let salidas = 0;
  let difAnterior = 0;
  const filas: FilaCuadre[] = input.movimientos.map((m, i) => {
    const imp = m.importe === null || !Number.isFinite(m.importe) ? 0 : aCentavos(m.importe);
    acum += imp;
    if (imp > 0) entradas += imp;
    else salidas -= imp;

    const fueraDePeriodo = !m.fecha || (!!desde && m.fecha < desde) || (!!hasta && m.fecha > hasta);
    const sinImporte = imp === 0;
    const sinConcepto = !m.concepto.trim();
    if (!m.fecha) problemas.push({ fila: i, mensaje: `Movimiento ${i + 1}: falta la fecha` });
    else if (fueraDePeriodo)
      problemas.push({ fila: i, mensaje: `Movimiento ${i + 1}: la fecha está fuera del período del extracto` });
    if (sinImporte) problemas.push({ fila: i, mensaje: `Movimiento ${i + 1}: falta el importe` });
    if (sinConcepto) problemas.push({ fila: i, mensaje: `Movimiento ${i + 1}: falta el concepto` });

    let diferenciaSaldo: number | null = null;
    let errorSaldo: FilaCuadre["errorSaldo"] = null;
    if (m.saldo !== null && Number.isFinite(m.saldo) && input.saldoInicial !== null) {
      const dif = aCentavos(m.saldo) - acum;
      diferenciaSaldo = dif / 100;
      if (dif !== 0) {
        errorSaldo = dif === difAnterior ? "arrastra" : "nuevo";
        if (errorSaldo === "nuevo") {
          const salto = (dif - difAnterior) / 100;
          problemas.push({
            fila: i,
            mensaje:
              `Movimiento ${i + 1} (${m.concepto.trim() || "sin concepto"}): el banco informa saldo ${fmt(m.saldo)} ` +
              `y el acumulado da ${fmt(acum / 100)}` +
              (i === 0 && difAnterior === 0
                ? ` — revisá el saldo inicial (diferencia ${fmt(salto)}) o este importe`
                : ` — falta un movimiento de ${fmt(salto)} o este importe está mal`),
          });
        }
      }
      difAnterior = dif;
    }
    return {
      acumulado: acum / 100,
      diferenciaSaldo,
      errorSaldo,
      fueraDePeriodo,
      sinImporte,
      sinConcepto,
    };
  });

  let diferenciaFinal: number | null = null;
  if (input.saldoFinal !== null && input.saldoInicial !== null) {
    const dif = aCentavos(input.saldoFinal) - acum;
    diferenciaFinal = dif / 100;
    if (dif !== 0) {
      problemas.push({
        fila: null,
        mensaje:
          `No cierra: saldo inicial ${fmt(input.saldoInicial)} + movimientos ${fmt((acum - aCentavos(input.saldoInicial)) / 100)} ` +
          `= ${fmt(acum / 100)}, pero el saldo final es ${fmt(input.saldoFinal)} (diferencia ${fmt(dif / 100)})`,
      });
    }
  }

  return {
    filas,
    entradas: entradas / 100,
    salidas: salidas / 100,
    saldoCalculado: acum / 100,
    diferenciaFinal,
    problemas,
    ok: problemas.length === 0,
  };
}

function formatoSimple(n: number): string {
  return new Intl.NumberFormat("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
