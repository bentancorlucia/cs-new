import type { RangoFechas } from "@/types/reportes";
import { uruguayDateKey, uruguayNowParts } from "@/lib/timezone";

// Uruguay es UTC-3 todo el año (sin horario de verano desde 2015).
const UY_OFFSET = "-03:00";

export function parseRango(searchParams: URLSearchParams): RangoFechas {
  const { year, month, day } = uruguayNowParts();
  const hoy = `${year}-${pad(month)}-${pad(day)}`;

  // Default: últimos 30 días (en calendario uruguayo).
  const hoyDate = new Date(Date.UTC(year, month - 1, day));
  const haceMes = new Date(hoyDate);
  haceMes.setUTCDate(haceMes.getUTCDate() - 29);

  const desde = searchParams.get("desde") || ymdUTC(haceMes);
  const hasta = searchParams.get("hasta") || hoy;
  return { desde, hasta };
}

export function rangoAnterior(rango: RangoFechas): RangoFechas {
  const desde = new Date(rango.desde + "T00:00:00Z");
  const hasta = new Date(rango.hasta + "T00:00:00Z");
  const dias =
    Math.round((hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const anteriorHasta = new Date(desde);
  anteriorHasta.setUTCDate(anteriorHasta.getUTCDate() - 1);
  const anteriorDesde = new Date(anteriorHasta);
  anteriorDesde.setUTCDate(anteriorDesde.getUTCDate() - (dias - 1));
  return { desde: ymdUTC(anteriorDesde), hasta: ymdUTC(anteriorHasta) };
}

/**
 * Límites de la query en hora de Uruguay. created_at es timestamptz;
 * agregando el offset -03:00 Postgres compara contra el instante correcto.
 */
export function rangoToTimestamps(rango: RangoFechas): {
  desdeIso: string;
  hastaIso: string;
} {
  return {
    desdeIso: `${rango.desde}T00:00:00.000${UY_OFFSET}`,
    hastaIso: `${rango.hasta}T23:59:59.999${UY_OFFSET}`,
  };
}

export function variacionPct(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual === 0 ? 0 : null;
  return ((actual - anterior) / anterior) * 100;
}

/** Decide agrupación por día o por semana según largo del rango. */
export function debeAgruparPorSemana(rango: RangoFechas): boolean {
  const desde = new Date(rango.desde + "T00:00:00Z");
  const hasta = new Date(rango.hasta + "T00:00:00Z");
  const dias =
    Math.round((hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return dias > 60;
}

/** Clave de agrupación de un timestamp, en hora de Uruguay. */
export function claveBucket(createdAt: string, porSemana: boolean): string {
  const ymd = uruguayDateKey(createdAt); // YYYY-MM-DD en hora UY
  return porSemana ? semanaIsoDeYmd(ymd) : ymd;
}

/** Clave de agrupación de una fecha calendaria YYYY-MM-DD. */
export function claveDeYmd(ymd: string, porSemana: boolean): string {
  return porSemana ? semanaIsoDeYmd(ymd) : ymd;
}

/** Itera las fechas calendarias (YYYY-MM-DD) del rango, inclusive. */
export function iterarDias(rango: RangoFechas): string[] {
  const dias: string[] = [];
  const cursor = new Date(rango.desde + "T00:00:00Z");
  const fin = new Date(rango.hasta + "T00:00:00Z");
  while (cursor.getTime() <= fin.getTime()) {
    dias.push(ymdUTC(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dias;
}

/** Todas las claves del intervalo (día o semana ISO), ordenadas. */
export function generarClaves(
  rango: RangoFechas,
  porSemana: boolean
): string[] {
  const claves: string[] = [];
  const vistas = new Set<string>();
  const cursor = new Date(rango.desde + "T00:00:00Z");
  const fin = new Date(rango.hasta + "T00:00:00Z");
  while (cursor.getTime() <= fin.getTime()) {
    const ymd = ymdUTC(cursor);
    const clave = porSemana ? semanaIsoDeYmd(ymd) : ymd;
    if (!vistas.has(clave)) {
      vistas.add(clave);
      claves.push(clave);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return claves;
}

/** Semana ISO (formato YYYY-Www) de una fecha YYYY-MM-DD. */
function semanaIsoDeYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return `${date.getUTCFullYear()}-W${pad(weekNum)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function ymdUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
