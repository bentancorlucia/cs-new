import Papa from "papaparse";
import * as XLSX from "xlsx";

// ============================================
// Parseo de extractos bancarios (CSV / Excel / PDF)
// y matching automático con movimientos del sistema
// ============================================

export interface MovimientoBanco {
  fecha: string; // YYYY-MM-DD
  descripcion: string;
  monto: number; // positivo = ingreso, negativo = egreso
  tipo: "ingreso" | "egreso";
  referencia?: string;
}

export interface MovimientoSistema {
  id: number;
  fecha: string;
  descripcion: string;
  monto: number;
  tipo: "ingreso" | "egreso";
  categoria_nombre?: string;
  conciliado: boolean;
}

export interface MatchResult {
  matched: Array<{
    sistema: MovimientoSistema;
    banco: MovimientoBanco;
    confianza: number; // 0-100
  }>;
  sinMatchSistema: MovimientoSistema[];
  sinMatchBanco: MovimientoBanco[];
}

// --- Formatos de bancos uruguayos ---

type FormatoBanco = "brou" | "itau" | "santander" | "scotiabank" | "generico";

interface ColumnaConfig {
  fecha: string;
  descripcion: string;
  monto?: string; // columna única con signo
  ingreso?: string; // columna separada de créditos
  egreso?: string; // columna separada de débitos
  referencia?: string;
  formatoFecha: "DD/MM/YYYY" | "YYYY-MM-DD" | "MM/DD/YYYY" | "DD-MM-YYYY";
}

const FORMATOS: Record<FormatoBanco, ColumnaConfig> = {
  brou: {
    fecha: "Fecha",
    descripcion: "Concepto",
    ingreso: "Crédito",
    egreso: "Débito",
    referencia: "Comprobante",
    formatoFecha: "DD/MM/YYYY",
  },
  itau: {
    fecha: "Fecha",
    descripcion: "Concepto",
    egreso: "Débitos",
    ingreso: "Créditos",
    referencia: "Referencia",
    formatoFecha: "DD/MM/YYYY",
  },
  santander: {
    fecha: "Fecha Valor",
    descripcion: "Descripcion",
    ingreso: "Credito",
    egreso: "Debito",
    referencia: "Referencia",
    formatoFecha: "DD/MM/YYYY",
  },
  scotiabank: {
    fecha: "Date",
    descripcion: "Description",
    monto: "Amount",
    referencia: "Reference",
    formatoFecha: "DD/MM/YYYY",
  },
  generico: {
    fecha: "fecha",
    descripcion: "descripcion",
    monto: "monto",
    referencia: "referencia",
    formatoFecha: "DD/MM/YYYY",
  },
};

export const FORMATO_OPTIONS: { value: FormatoBanco; label: string }[] = [
  { value: "brou", label: "BROU" },
  { value: "itau", label: "Itaú" },
  { value: "santander", label: "Santander" },
  { value: "scotiabank", label: "Scotiabank" },
  { value: "generico", label: "Genérico (CSV)" },
];

// --- Parseo de fecha ---

function parsearFecha(fecha: string, formato: string): string {
  const cleaned = fecha.trim();
  let day: string, month: string, year: string;

  switch (formato) {
    case "DD/MM/YYYY": {
      const parts = cleaned.split(/[\/\-\.]/);
      [day, month, year] = parts;
      break;
    }
    case "YYYY-MM-DD": {
      const parts = cleaned.split("-");
      [year, month, day] = parts;
      break;
    }
    case "MM/DD/YYYY": {
      const parts = cleaned.split(/[\/\-\.]/);
      [month, day, year] = parts;
      break;
    }
    case "DD-MM-YYYY": {
      const parts = cleaned.split("-");
      [day, month, year] = parts;
      break;
    }
    default: {
      const parts = cleaned.split(/[\/\-\.]/);
      [day, month, year] = parts;
    }
  }

  // Normalizar año de 2 dígitos
  if (year && year.length === 2) {
    year = `20${year}`;
  }

  return `${year}-${month?.padStart(2, "0")}-${day?.padStart(2, "0")}`;
}

// --- Parseo de monto ---

function parsearMonto(valor: string | number | undefined | null): number {
  if (valor === undefined || valor === null || valor === "") return 0;
  if (typeof valor === "number") return valor;

  // Limpiar formato uruguayo: 1.234,56 → 1234.56
  const cleaned = valor
    .replace(/[$ U]/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  return parseFloat(cleaned) || 0;
}

// --- Parseo CSV ---

function parsearCSVConFormato(
  csv: string,
  formato: FormatoBanco
): MovimientoBanco[] {
  const config = FORMATOS[formato];
  const result = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  if (result.errors.length > 0) {
    console.warn("CSV parse warnings:", result.errors);
  }

  return result.data
    .filter((row) => {
      // Al menos fecha y algún monto deben existir
      const fecha = row[config.fecha];
      const tieneMonto = config.monto
        ? row[config.monto]
        : row[config.ingreso!] || row[config.egreso!];
      return fecha && tieneMonto;
    })
    .map((row) => {
      const fecha = parsearFecha(row[config.fecha] || "", config.formatoFecha);
      const descripcion = (row[config.descripcion] || "").trim();
      const referencia = config.referencia
        ? (row[config.referencia] || "").trim()
        : undefined;

      let monto: number;
      let tipo: "ingreso" | "egreso";

      if (config.monto) {
        monto = parsearMonto(row[config.monto]);
        tipo = monto >= 0 ? "ingreso" : "egreso";
        monto = Math.abs(monto);
      } else {
        const credito = parsearMonto(row[config.ingreso!]);
        const debito = parsearMonto(row[config.egreso!]);
        if (credito > 0) {
          monto = credito;
          tipo = "ingreso";
        } else {
          monto = Math.abs(debito);
          tipo = "egreso";
        }
      }

      return { fecha, descripcion, monto, tipo, referencia };
    })
    .filter((m) => m.monto > 0);
}

// --- Parseo Excel ---

function parsearExcel(buffer: ArrayBuffer, formato: FormatoBanco): MovimientoBanco[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const csv = XLSX.utils.sheet_to_csv(firstSheet);
  return parsearCSVConFormato(csv, formato);
}

// --- Parseo PDF ---

// Meses abreviados en extractos Itaú: 05MAR, 16MAR, etc.
const MESES_ABBR: Record<string, string> = {
  ENE: "01", JAN: "01",
  FEB: "02",
  MAR: "03",
  ABR: "04", APR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AGO: "08", AUG: "08",
  SEP: "09", SET: "09",
  OCT: "10",
  NOV: "11",
  DIC: "12", DEC: "12",
};

// Regex: línea que empieza con DDMMM (ej: 05MAR, 16MAR)
const REGEX_DDMMM = /^(\d{2})([A-Z]{3})\s+/;

// Regex para extraer el año del header: 31MAR2026
const REGEX_FECHA_CIERRE = /(\d{2}[A-Z]{3})(\d{4})/;

// Regex para montos en formato uruguayo al final de línea: 1.309,00 o 31,11-
const REGEX_MONTO_PDF = /[\d.]+,\d{2}-?/g;

// Conceptos que indican crédito (ingreso)
const CONCEPTOS_CREDITO = /^(CRE\.|REDIVA|TRASPASO DE|ABONO|DEP[OÓ]S|TRANSFERENCIA REC)/i;

/**
 * Parsear extracto bancario PDF de Itaú Uruguay.
 *
 * Formato texto extraído (pdf-parse):
 * 05MAR DEB. CAMBIOS TOLD28911582 322,00 104,82
 * 05MAR CRE. CAMBIOS TOLC19430523 200,00 304,82
 * 06MAR COMPRA LAS DELICIAS 280,00 29,41
 * 20MAR COMPRA LA CAMPEONA 1.309,00 1.011,16-
 *
 * Cada línea: DDMMM concepto+referencia monto saldo
 * - El último número es siempre el saldo (se ignora)
 * - El penúltimo es el monto del movimiento
 * - Saldos negativos usan "-" al final: 31,11-
 * - El tipo (ingreso/egreso) se determina por el concepto
 */
async function parsearPDF(
  buffer: ArrayBuffer,
  _formato: FormatoBanco
): Promise<MovimientoBanco[]> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  await parser.destroy();
  const text: string = result.text;
  const lines = text.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);

  // Extraer el año del encabezado (ej: "31MAR2026")
  let year = new Date().getFullYear().toString();
  for (const line of lines) {
    const yearMatch = line.match(REGEX_FECHA_CIERRE);
    if (yearMatch) {
      year = yearMatch[2];
      break;
    }
  }

  const movimientos: MovimientoBanco[] = [];

  for (const line of lines) {
    // Debe empezar con DDMMM (ej: 05MAR)
    const fechaMatch = line.match(REGEX_DDMMM);
    if (!fechaMatch) continue;

    const dia = fechaMatch[1];
    const mesAbr = fechaMatch[2].toUpperCase();
    const mes = MESES_ABBR[mesAbr];
    if (!mes) continue;

    const fecha = `${year}-${mes}-${dia}`;

    // Resto de la línea después de la fecha
    const resto = line.substring(fechaMatch[0].length);

    // Ignorar líneas de saldo apertura/cierre
    if (/^SDO\.|^SIN MOVIMIENTO/i.test(resto)) continue;

    // Extraer todos los montos (formato: 322,00 o 1.309,00 o 31,11-)
    const montosRaw = resto.match(REGEX_MONTO_PDF);
    if (!montosRaw || montosRaw.length < 2) continue; // necesitamos al menos monto + saldo

    // Extraer descripción: todo antes del primer monto
    const primerMontoIdx = resto.indexOf(montosRaw[0]);
    const descripcion = resto.substring(0, primerMontoIdx).trim();

    if (!descripcion) continue;

    // Parsear montos: el último es saldo, el penúltimo es el monto del movimiento
    const montos = montosRaw.map((m: string) => {
      const esNegativo = m.endsWith("-");
      const limpio = m.replace(/-$/, "");
      const valor = parsearMonto(limpio);
      return esNegativo ? -valor : valor;
    });

    // Monto = penúltimo, saldo = último
    const monto = montos[montos.length - 2];

    // Determinar tipo por el concepto
    const esCredito = CONCEPTOS_CREDITO.test(descripcion);
    const tipo: "ingreso" | "egreso" = esCredito ? "ingreso" : "egreso";

    movimientos.push({
      fecha,
      descripcion,
      monto: Math.abs(monto),
      tipo,
      referencia: undefined,
    });
  }

  return movimientos.filter((m) => m.monto > 0);
}

// --- Función principal de parseo ---

export async function parsearExtracto(
  fileContent: string | ArrayBuffer,
  fileName: string,
  formato: FormatoBanco
): Promise<MovimientoBanco[]> {
  const isPDF = fileName.endsWith(".pdf");
  const isExcel =
    fileName.endsWith(".xlsx") ||
    fileName.endsWith(".xls") ||
    fileName.endsWith(".xlsm");

  if (isPDF && fileContent instanceof ArrayBuffer) {
    return parsearPDF(fileContent, formato);
  }

  if (isExcel && fileContent instanceof ArrayBuffer) {
    return parsearExcel(fileContent, formato);
  }

  const csvString =
    typeof fileContent === "string"
      ? fileContent
      : new TextDecoder("utf-8").decode(fileContent);

  return parsearCSVConFormato(csvString, formato);
}

// --- Matching automático ---

function diffDias(fecha1: string, fecha2: string): number {
  const d1 = new Date(fecha1);
  const d2 = new Date(fecha2);
  return Math.abs(
    Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24))
  );
}

export function matchearMovimientos(
  sistemaMovs: MovimientoSistema[],
  bancoMovs: MovimientoBanco[],
  toleranciaDias: number = 2
): MatchResult {
  const matched: MatchResult["matched"] = [];
  const usadosSistema = new Set<number>();
  const usadosBanco = new Set<number>();

  // Paso 1: Match exacto (mismo monto + misma fecha + mismo tipo)
  for (let b = 0; b < bancoMovs.length; b++) {
    if (usadosBanco.has(b)) continue;
    const banco = bancoMovs[b];

    for (let s = 0; s < sistemaMovs.length; s++) {
      if (usadosSistema.has(s)) continue;
      const sistema = sistemaMovs[s];

      if (
        sistema.tipo === banco.tipo &&
        Math.abs(sistema.monto - banco.monto) < 0.01 &&
        sistema.fecha === banco.fecha
      ) {
        matched.push({ sistema, banco, confianza: 100 });
        usadosSistema.add(s);
        usadosBanco.add(b);
        break;
      }
    }
  }

  // Paso 2: Match aproximado (mismo monto + fecha ± toleranciaDias + mismo tipo)
  for (let b = 0; b < bancoMovs.length; b++) {
    if (usadosBanco.has(b)) continue;
    const banco = bancoMovs[b];

    let bestMatch: { idx: number; dias: number } | null = null;

    for (let s = 0; s < sistemaMovs.length; s++) {
      if (usadosSistema.has(s)) continue;
      const sistema = sistemaMovs[s];

      if (
        sistema.tipo === banco.tipo &&
        Math.abs(sistema.monto - banco.monto) < 0.01
      ) {
        const dias = diffDias(sistema.fecha, banco.fecha);
        if (dias <= toleranciaDias && dias > 0) {
          if (!bestMatch || dias < bestMatch.dias) {
            bestMatch = { idx: s, dias };
          }
        }
      }
    }

    if (bestMatch) {
      const confianza = Math.round(
        100 - (bestMatch.dias / toleranciaDias) * 30
      );
      matched.push({
        sistema: sistemaMovs[bestMatch.idx],
        banco,
        confianza,
      });
      usadosSistema.add(bestMatch.idx);
      usadosBanco.add(b);
    }
  }

  // Lo que queda sin match
  const sinMatchSistema = sistemaMovs.filter(
    (_, i) => !usadosSistema.has(i) && !sistemaMovs[i].conciliado
  );
  const sinMatchBanco = bancoMovs.filter((_, i) => !usadosBanco.has(i));

  return { matched, sinMatchSistema, sinMatchBanco };
}
