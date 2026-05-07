export type TipoPeriodo =
  | "anual"
  | "semestral"
  | "cuatrimestral"
  | "trimestral"
  | "mensual";

export const PERIODOS_POR_TIPO: Record<TipoPeriodo, number> = {
  anual: 1,
  semestral: 2,
  cuatrimestral: 3,
  trimestral: 4,
  mensual: 12,
};

export function nombrePeriodo(tipo: TipoPeriodo, numero: number): string {
  switch (tipo) {
    case "anual":
      return "Año completo";
    case "semestral":
      return numero === 1 ? "1er semestre" : "2do semestre";
    case "cuatrimestral":
      return ["1er cuatrimestre", "2do cuatrimestre", "3er cuatrimestre"][numero - 1] ?? `Q${numero}`;
    case "trimestral":
      return ["Q1 (Ene-Mar)", "Q2 (Abr-Jun)", "Q3 (Jul-Sep)", "Q4 (Oct-Dic)"][numero - 1] ?? `Q${numero}`;
    case "mensual":
      return new Date(2000, numero - 1, 1).toLocaleDateString("es-UY", { month: "long" });
  }
}

/**
 * Devuelve fecha_desde y fecha_hasta (inclusive) para un período dado.
 */
export function rangoDeFechas(
  tipo: TipoPeriodo,
  anio: number,
  numero: number
): { desde: string; hasta: string } {
  const mesesPorPeriodo = 12 / PERIODOS_POR_TIPO[tipo];
  const mesInicio = (numero - 1) * mesesPorPeriodo + 1; // 1-12
  const mesFin = mesInicio + mesesPorPeriodo - 1;

  const desde = `${anio}-${String(mesInicio).padStart(2, "0")}-01`;
  const ultimoDia = new Date(anio, mesFin, 0).getDate();
  const hasta = `${anio}-${String(mesFin).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
  return { desde, hasta };
}

export function periodoActual(tipo: TipoPeriodo, fecha = new Date()): { anio: number; numero: number } {
  const anio = fecha.getFullYear();
  const mes = fecha.getMonth() + 1; // 1-12
  const mesesPorPeriodo = 12 / PERIODOS_POR_TIPO[tipo];
  const numero = Math.floor((mes - 1) / mesesPorPeriodo) + 1;
  return { anio, numero };
}
