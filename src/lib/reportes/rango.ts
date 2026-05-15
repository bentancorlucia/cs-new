import type { RangoFechas } from "@/types/reportes";

export function parseRango(searchParams: URLSearchParams): RangoFechas {
  const hoy = new Date();
  const haceMes = new Date(hoy);
  haceMes.setDate(haceMes.getDate() - 29);

  const desde = searchParams.get("desde") || toYmd(haceMes);
  const hasta = searchParams.get("hasta") || toYmd(hoy);
  return { desde, hasta };
}

export function rangoAnterior(rango: RangoFechas): RangoFechas {
  const desde = new Date(rango.desde + "T00:00:00");
  const hasta = new Date(rango.hasta + "T00:00:00");
  const dias =
    Math.round((hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const anteriorHasta = new Date(desde);
  anteriorHasta.setDate(anteriorHasta.getDate() - 1);
  const anteriorDesde = new Date(anteriorHasta);
  anteriorDesde.setDate(anteriorDesde.getDate() - (dias - 1));
  return { desde: toYmd(anteriorDesde), hasta: toYmd(anteriorHasta) };
}

export function rangoToTimestamps(rango: RangoFechas): {
  desdeIso: string;
  hastaIso: string;
} {
  return {
    desdeIso: `${rango.desde}T00:00:00`,
    hastaIso: `${rango.hasta}T23:59:59.999`,
  };
}

export function variacionPct(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual === 0 ? 0 : null;
  return ((actual - anterior) / anterior) * 100;
}

function toYmd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Decide agrupación por día o por semana según largo del rango. */
export function debeAgruparPorSemana(rango: RangoFechas): boolean {
  const desde = new Date(rango.desde + "T00:00:00");
  const hasta = new Date(rango.hasta + "T00:00:00");
  const dias =
    Math.round((hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return dias > 60;
}
