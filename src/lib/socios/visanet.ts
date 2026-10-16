/**
 * Archivos que devuelve Visanet después de procesar el débito automático
 * (ancho fijo, una línea por cargo):
 *
 * - RESULTADO_VISANET.TXT: todos los cargos enviados, aprobados (A00) y
 *   rechazados (R + código), con los totales al final (TE enviados, TA
 *   aprobados, TR rechazados).
 * - arch_rech.txt: solo los rechazados (otro ancho), con los mismos totales.
 * - list_rech.txt: el listado de rechazos para imprimir (columnas separadas por
 *   espacios).
 * - arch_cambio.txt: cambios de tarjeta informados por los emisores (cuando no
 *   hay, trae el texto "No existen cambios de tarjeta").
 *
 * Se lee en el navegador: el número completo de la tarjeta nunca sale de acá;
 * solo los últimos 4, el vencimiento y una clave para agrupar los cargos de la
 * misma tarjeta (BIN + últimos 4).
 */

export type TipoArchivoVisanet = "resultado" | "rechazos" | "listado_rechazos" | "cambios";

export interface LineaVisanet {
  /** Número de línea en el lote de Visa. */
  secuencia: number;
  /** Agrupa los cargos de una misma tarjeta sin guardar el número (BIN + últimos 4). */
  grupo: string;
  ultimos4: string;
  /** Primer día del mes de vencimiento (YYYY-MM-01), si el archivo lo trae. */
  vencimiento: string | null;
  /** Fecha en que Visa procesó el cargo (YYYY-MM-DD). */
  fecha: string | null;
  importe: number;
  aprobado: boolean;
  /** Código de respuesta del emisor ("00" aprobado; 38, 54, 88… rechazos). */
  codigo: string | null;
  motivo: string;
  autorizacion: string | null;
  /** Referencia cargada en el portal: la cédula, sin ceros a la izquierda. */
  referencia: string;
  /** Período del cargo (YYYY-MM-01). */
  periodo: string | null;
}

export interface TotalVisanet {
  cantidad: number;
  importe: number;
}

export interface ArchivoVisanet {
  tipo: TipoArchivoVisanet;
  nombre: string | null;
  lineas: LineaVisanet[];
  /** Período de los cargos (el más repetido). */
  periodo: string | null;
  comercio: string | null;
  /** Totales del pie del archivo (TE, TA, TR), si vienen. */
  totales: { enviados: TotalVisanet | null; aprobados: TotalVisanet | null; rechazados: TotalVisanet | null };
  /** Diferencias entre las líneas y los totales del pie. */
  descuadres: string[];
  /** Líneas que no se pudieron leer (número de línea del archivo). */
  ilegibles: number[];
  /** Solo en "cambios": el texto del archivo (cuando no hay cambios) o sus líneas. */
  texto: string[];
}

const MESES: Record<string, string> = {
  ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
  jul: "07", ago: "08", set: "09", sep: "09", oct: "10", nov: "11", dic: "12",
};

const MOTIVOS: Record<string, string> = {
  "38": "Tar. no autorizada",
  "54": "Vencida, no renovada",
  "88": "No autorizado emisor",
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** "Set/26" → "2026-09-01". */
function periodoVisa(v: string): string | null {
  const m = /^([A-Za-z]{3})\/(\d{2})$/.exec(v.trim());
  const mes = m ? MESES[m[1].toLowerCase()] : undefined;
  return m && mes ? `20${m[2]}-${mes}-01` : null;
}

/** "2804" (AAMM) → "2028-04-01". */
function vencimientoVisa(v: string): string | null {
  if (!/^\d{4}$/.test(v)) return null;
  const mes = Number(v.slice(2));
  return mes >= 1 && mes <= 12 ? `20${v.slice(0, 2)}-${v.slice(2)}-01` : null;
}

/** "20260926" → "2026-09-26". */
function fechaVisa(v: string): string | null {
  return /^20\d{6}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : null;
}

/** Importe en centésimos, sin separadores ("000000000255000" → 2550). */
const centesimos = (v: string) => r2(Number(v) / 100);

/** "1.925,00" → 1925. */
const importeTexto = (v: string) => r2(Number(v.replace(/\./g, "").replace(",", ".")));

const sinCeros = (v: string) => v.replace(/\D/g, "").replace(/^0+/, "");

function tarjeta(numero: string) {
  const n = numero.replace(/\D/g, "");
  return { grupo: `${n.slice(0, 6)}··${n.slice(-4)}`, ultimos4: n.slice(-4) };
}

// Posiciones (desde 0) de RESULTADO_VISANET.TXT.
function lineaResultado(l: string): LineaVisanet | null {
  if (l.length < 172 || !l.startsWith("DE")) return null;
  const numero = l.slice(39, 58).trim();
  const estado = l[139];
  if (!/^\d{13,19}$/.test(numero) || (estado !== "A" && estado !== "R")) return null;
  const importe = l.slice(70, 85);
  if (!/^\d{15}$/.test(importe)) return null;
  const codigo = l.slice(140, 142);
  const aprobado = estado === "A";
  const autorizacion = l.slice(85, 91).trim();
  return {
    secuencia: Number(l.slice(9, 16)),
    ...tarjeta(numero),
    vencimiento: vencimientoVisa(l.slice(58, 62)),
    fecha: fechaVisa(l.slice(62, 70)),
    importe: centesimos(importe),
    aprobado,
    codigo,
    motivo: aprobado ? "" : l.slice(142, 172).trim() || MOTIVOS[codigo] || `Rechazo ${codigo}`,
    autorizacion: aprobado && autorizacion && !/^0+$/.test(autorizacion) ? autorizacion : null,
    referencia: sinCeros(l.slice(97, 107)),
    periodo: periodoVisa(l.slice(91, 97)),
  };
}

// Posiciones de arch_rech.txt.
function lineaRechazo(l: string): LineaVisanet | null {
  if (l.length < 91 || !l.startsWith("DE")) return null;
  const numero = l.slice(33, 52).trim();
  const importe = l.slice(60, 75);
  if (!/^\d{13,19}$/.test(numero) || !/^\d{15}$/.test(importe)) return null;
  return {
    secuencia: Number(l.slice(9, 16)),
    ...tarjeta(numero),
    vencimiento: null,
    fecha: fechaVisa(l.slice(52, 60)),
    importe: centesimos(importe),
    aprobado: false,
    codigo: null,
    motivo: l.slice(91).trim() || "Rechazado",
    autorizacion: null,
    referencia: sinCeros(l.slice(81, 91)),
    periodo: periodoVisa(l.slice(75, 81)),
  };
}

// list_rech.txt: lote, secuencia, tarjeta, moneda, tipo, importe, código, motivo, período, referencia.
const RE_LISTADO = /^\s*\d+\s+(\d+)\s+(\d{13,19})\s+\d{3}\s+\d+\s+([\d.]+,\d{2})\s+(\d{2})\s+(.+?)\s+([A-Za-z]{3}\/\d{2})\s+(\d+)\s*$/;

function lineaListado(l: string): LineaVisanet | null {
  const m = RE_LISTADO.exec(l);
  if (!m) return null;
  return {
    secuencia: Number(m[1]),
    ...tarjeta(m[2]),
    vencimiento: null,
    fecha: null,
    importe: importeTexto(m[3]),
    aprobado: false,
    codigo: m[4],
    motivo: m[5].trim(),
    autorizacion: null,
    referencia: sinCeros(m[7]),
    periodo: periodoVisa(m[6]),
  };
}

/** Pie: "TE" + establecimiento (6) + cantidad (7) + importe en centésimos (15). */
function total(l: string): TotalVisanet | null {
  const m = /^T[EAR]\d{6}(\d{7})(\d{15})/.exec(l);
  return m ? { cantidad: Number(m[1]), importe: centesimos(m[2]) } : null;
}

function masRepetido(xs: (string | null)[]): string | null {
  const n = new Map<string, number>();
  for (const x of xs) if (x) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * Lee un archivo de Visanet. Devuelve null si el texto no tiene ese formato
 * (entonces se trata como una planilla común).
 */
export function leerArchivoVisanet(texto: string, nombre: string | null = null): ArchivoVisanet | null {
  const filas = texto.replace(/^﻿/, "").split(/\r?\n/);
  const llenas = filas.map((f) => f.replace(/\s+$/, "")).filter((f) => f.trim() !== "");
  if (llenas.length === 0) return null;

  const base = {
    nombre,
    comercio: null as string | null,
    totales: { enviados: null, aprobados: null, rechazados: null } as ArchivoVisanet["totales"],
    descuadres: [] as string[],
    ilegibles: [] as number[],
    texto: [] as string[],
  };

  if (/cambio/i.test(nombre ?? "") || llenas.some((l) => /cambios? de tarjeta/i.test(l))) {
    return { ...base, tipo: "cambios", lineas: [], periodo: null, texto: llenas.map((l) => l.trim()) };
  }

  const detalle = llenas.filter((l) => l.startsWith("DE"));
  let tipo: TipoArchivoVisanet;
  let leer: (l: string) => LineaVisanet | null;
  if (detalle.length > 0) {
    // El resultado trae la marca A/R en la posición 139; el de rechazos es más corto.
    const esResultado = detalle.some((l) => l.length >= 172 && /^[AR]\d{2}$/.test(l.slice(139, 142)));
    tipo = esResultado ? "resultado" : "rechazos";
    leer = esResultado ? lineaResultado : lineaRechazo;
  } else if (llenas.some((l) => RE_LISTADO.test(l))) {
    tipo = "listado_rechazos";
    leer = lineaListado;
  } else {
    return null;
  }

  const lineas: LineaVisanet[] = [];
  llenas.forEach((l, i) => {
    if (tipo === "listado_rechazos" ? false : !l.startsWith("DE")) {
      if (l.startsWith("TE")) base.totales.enviados = total(l);
      else if (l.startsWith("TA")) base.totales.aprobados = total(l);
      else if (l.startsWith("TR")) base.totales.rechazados = total(l);
      return;
    }
    const x = leer(l);
    if (x) lineas.push(x);
    else base.ilegibles.push(i + 1);
  });
  if (lineas.length === 0) return null;
  if (tipo !== "listado_rechazos") base.comercio = detalle[0]?.slice(16, 24) ?? null;

  // Control contra el pie.
  const suma = (xs: LineaVisanet[]): TotalVisanet => ({ cantidad: xs.length, importe: r2(xs.reduce((s, x) => s + x.importe, 0)) });
  const comparar = (que: string, t: TotalVisanet | null, real: TotalVisanet) => {
    if (!t) return;
    if (t.cantidad !== real.cantidad || Math.abs(t.importe - real.importe) > 0.004) {
      base.descuadres.push(`${que}: el pie dice ${t.cantidad} por ${t.importe.toFixed(2)} y las líneas suman ${real.cantidad} por ${real.importe.toFixed(2)}`);
    }
  };
  if (tipo === "resultado") {
    comparar("Enviados", base.totales.enviados, suma(lineas));
    comparar("Aprobados", base.totales.aprobados, suma(lineas.filter((x) => x.aprobado)));
  }
  comparar("Rechazados", base.totales.rechazados, suma(lineas.filter((x) => !x.aprobado)));

  return { ...base, tipo, lineas, periodo: masRepetido(lineas.map((x) => x.periodo)) };
}

export const NOMBRE_TIPO_VISANET: Record<TipoArchivoVisanet, string> = {
  resultado: "Resultado del débito",
  rechazos: "Archivo de rechazos",
  listado_rechazos: "Listado de rechazos",
  cambios: "Cambios de tarjeta",
};
