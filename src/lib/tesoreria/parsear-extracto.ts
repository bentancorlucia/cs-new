import Papa from "papaparse";
import * as XLSX from "xlsx";

// ============================================
// Parseo de extractos bancarios (CSV / Excel)
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
    descripcion: "Descripción",
    monto: "Importe",
    referencia: "Nro. Comprobante",
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

// --- Función principal de parseo ---

export function parsearExtracto(
  fileContent: string | ArrayBuffer,
  fileName: string,
  formato: FormatoBanco
): MovimientoBanco[] {
  const isExcel =
    fileName.endsWith(".xlsx") ||
    fileName.endsWith(".xls") ||
    fileName.endsWith(".xlsm");

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
