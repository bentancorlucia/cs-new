export interface ComprobanteExtractionResult {
  monto: number | null;
  moneda: string | null;
  fecha: string | null;
  cuenta_destino: string | null;
  banco_destino: string | null;
  beneficiario: string | null;
  banco_origen: string | null;
  referencia: string | null;
  confianza: number;
}

const BANCOS = [
  "Santander",
  "Itaú",
  "Itau",
  "ITAU",
  "Prex",
  "HSBC",
  "BROU",
  "Scotiabank",
  "BBVA",
];

// --- Text extraction ---

async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string }>;
  const result = await pdfParse(buffer);
  return result.text || "";
}

async function extractTextFromImage(buffer: Buffer): Promise<string> {
  const Tesseract = await import("tesseract.js");
  const worker = await Tesseract.createWorker("spa");
  try {
    const { data } = await worker.recognize(buffer);
    return data.text || "";
  } finally {
    await worker.terminate();
  }
}

export async function extractText(
  buffer: Buffer,
  tipo: "imagen" | "pdf"
): Promise<string> {
  if (tipo === "pdf") {
    return extractTextFromPDF(buffer);
  }
  return extractTextFromImage(buffer);
}

// --- Field extraction via regex ---

function extractMonto(text: string): { monto: number | null; moneda: string | null } {
  // Look for amounts near keywords
  const keywords = /(?:monto|importe|transferido|acreditar|total|giro|envía|envia)/i;
  const lines = text.split("\n");

  // Strategy 1: find amount on same line or adjacent to keywords
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (keywords.test(line)) {
      // Try to find amount in this line or next
      const searchText = line + " " + (lines[i + 1] || "");
      const match = searchText.match(
        /(?:UYU|U\$S|\$)\s*([\d.,]+)/i
      );
      if (match) {
        const monto = parseAmount(match[1]);
        if (monto !== null && monto > 0) {
          const moneda = /U\$S/i.test(searchText) ? "USD" : "UYU";
          return { monto, moneda };
        }
      }
      // Try without currency symbol
      const matchNum = searchText.match(
        /(?:monto|importe|transferido|acreditar|total|giro)[:\s]*\$?\s*([\d.,]+)/i
      );
      if (matchNum) {
        const monto = parseAmount(matchNum[1]);
        if (monto !== null && monto > 0) {
          return { monto, moneda: "UYU" };
        }
      }
    }
  }

  // Strategy 2: find any currency + amount pattern
  const globalMatch = text.match(/(?:UYU|U\$S|\$)\s*([\d.,]+)/i);
  if (globalMatch) {
    const monto = parseAmount(globalMatch[1]);
    if (monto !== null && monto > 0) {
      const moneda = /U\$S/i.test(globalMatch[0]) ? "USD" : "UYU";
      return { monto, moneda };
    }
  }

  return { monto: null, moneda: null };
}

function parseAmount(raw: string): number | null {
  if (!raw) return null;
  // Handle formats: "2.840,00" -> 2840.00 | "2,840.00" -> 2840.00 | "2840" -> 2840
  let cleaned = raw.trim();

  // If format is "X.XXX,XX" (Spanish format)
  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }
  // If format is "X,XXX.XX" (English format)
  else if (/^\d{1,3}(,\d{3})*(\.\d{1,2})?$/.test(cleaned)) {
    cleaned = cleaned.replace(/,/g, "");
  }
  // If format is "XXXX,XX" (simple comma decimal)
  else if (/^\d+(,\d{1,2})$/.test(cleaned)) {
    cleaned = cleaned.replace(",", ".");
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function extractCuentaDestino(text: string): string | null {
  const keywords = /(?:destino|hacia|reciben|cuenta\s+(?:de\s+)?destino)/i;
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    if (keywords.test(lines[i])) {
      const searchText = lines[i] + " " + (lines[i + 1] || "");
      const match = searchText.match(/(\d{5,20})/);
      if (match) return match[1];
    }
  }

  // Look for "9500100" anywhere
  const cuentaMatch = text.match(/9500100/);
  if (cuentaMatch) return "9500100";

  return null;
}

function extractBancoDestino(text: string): string | null {
  const keywords = /(?:destino|hacia|reciben|banco\s+(?:de\s+)?destino)/i;
  const lines = text.split("\n");

  // Check near destination keywords
  for (let i = 0; i < lines.length; i++) {
    if (keywords.test(lines[i])) {
      const searchText = lines[i] + " " + (lines[i + 1] || "") + " " + (lines[i + 2] || "");
      if (/ITAU|Itaú|Itau/i.test(searchText)) return "ITAU";
    }
  }

  // Check for "Banco de destino: ITAU" pattern
  const bancoDestinoMatch = text.match(
    /banco\s+(?:de\s+)?destino[:\s]*(\w+)/i
  );
  if (bancoDestinoMatch) {
    if (/ITAU|Itaú|Itau/i.test(bancoDestinoMatch[1])) return "ITAU";
    return bancoDestinoMatch[1];
  }

  return null;
}

function extractBeneficiario(text: string): string | null {
  const match = text.match(
    /(?:beneficiari[oa]|nombre\s+de\s+cuenta|titular)[:\s]+([^\n]+)/i
  );
  if (match) return match[1].trim();
  return null;
}

function extractFecha(text: string): string | null {
  // DD/MM/YYYY
  const match1 = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match1) {
    const [, day, month, year] = match1;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  // DD de Mes de YYYY
  const months: Record<string, string> = {
    enero: "01", febrero: "02", marzo: "03", abril: "04",
    mayo: "05", junio: "06", julio: "07", agosto: "08",
    septiembre: "09", octubre: "10", noviembre: "11", diciembre: "12",
  };
  const match2 = text.match(
    /(\d{1,2})\s+de\s+(\w+)\s+(?:de\s+)?(\d{4})/i
  );
  if (match2) {
    const [, day, monthName, year] = match2;
    const monthNum = months[monthName.toLowerCase()];
    if (monthNum) {
      return `${year}-${monthNum}-${day.padStart(2, "0")}`;
    }
  }

  // DD-MM-YYYY
  const match3 = text.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (match3) {
    const [, day, month, year] = match3;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return null;
}

function extractReferencia(text: string): string | null {
  const match = text.match(
    /(?:referencia|operaci[oó]n|transacci[oó]n|n[uú]mero|nro)[:\s#]*(\d{7,})/i
  );
  if (match) return match[1];

  // Any long number that could be a reference
  const longNumMatch = text.match(/\b(\d{8,})\b/);
  if (longNumMatch) return longNumMatch[1];

  return null;
}

function extractBancoOrigen(text: string): string | null {
  for (const banco of BANCOS) {
    const regex = new RegExp(banco, "i");
    if (regex.test(text)) {
      // Normalize
      if (/itau|itaú/i.test(banco)) return "Itaú";
      return banco;
    }
  }
  return null;
}

// --- Confidence calculation ---

function calcularConfianza(result: ComprobanteExtractionResult): number {
  let confianza = 0;

  const hasMonto = result.monto !== null;
  const hasFecha = result.fecha !== null;
  const hasItau = result.banco_destino?.toUpperCase() === "ITAU";
  const hasCuenta = result.cuenta_destino?.includes("9500100") || false;
  const hasBeneficiario =
    result.beneficiario !== null &&
    /seminario|bordo/i.test(result.beneficiario);

  if (!hasMonto && !hasFecha && !hasItau) return 0;

  if (hasMonto || hasFecha) confianza = 0.3;
  if (hasMonto && hasItau) confianza = 0.6;
  if (hasMonto && hasItau && hasBeneficiario) confianza = 0.8;
  if (hasMonto && hasItau && hasCuenta && hasFecha) confianza = 1.0;

  return confianza;
}

// --- Main extraction function ---

export async function extractComprobanteData(
  buffer: Buffer,
  tipo: "imagen" | "pdf"
): Promise<ComprobanteExtractionResult> {
  try {
    const text = await extractText(buffer, tipo);

    if (!text || text.trim().length < 10) {
      return {
        monto: null,
        moneda: null,
        fecha: null,
        cuenta_destino: null,
        banco_destino: null,
        beneficiario: null,
        banco_origen: null,
        referencia: null,
        confianza: 0,
      };
    }

    const { monto, moneda } = extractMonto(text);
    const cuenta_destino = extractCuentaDestino(text);
    const banco_destino = extractBancoDestino(text);
    const beneficiario = extractBeneficiario(text);
    const fecha = extractFecha(text);
    const referencia = extractReferencia(text);
    const banco_origen = extractBancoOrigen(text);

    const result: ComprobanteExtractionResult = {
      monto,
      moneda,
      fecha,
      cuenta_destino,
      banco_destino,
      beneficiario,
      banco_origen,
      referencia,
      confianza: 0,
    };

    result.confianza = calcularConfianza(result);

    return result;
  } catch (error) {
    console.error("Error en extracción de comprobante:", error);
    return {
      monto: null,
      moneda: null,
      fecha: null,
      cuenta_destino: null,
      banco_destino: null,
      beneficiario: null,
      banco_origen: null,
      referencia: null,
      confianza: 0,
    };
  }
}
