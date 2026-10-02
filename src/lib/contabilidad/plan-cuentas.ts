import type { Database } from "@/types/contabilidad";
import type { ClaseCuenta } from "@/lib/contabilidad/formato";

type Tablas = Database["contabilidad"]["Tables"];
export type Naturaleza = Database["contabilidad"]["Enums"]["naturaleza"];
export type TipoAuxiliar = Database["contabilidad"]["Enums"]["tipo_auxiliar"];

/** Cuenta del plan, con lo que la pantalla necesita saber de su uso. */
export type CuentaPlan = Pick<
  Tablas["cuentas"]["Row"],
  | "id"
  | "codigo"
  | "nombre"
  | "padre_id"
  | "nivel"
  | "clase"
  | "naturaleza"
  | "imputable"
  | "moneda"
  | "es_disponibilidad"
  | "afecta_caja"
  | "revalua"
  | "requiere_auxiliar"
  | "requiere_centro_costo"
  | "activa"
  | "descripcion"
> & {
  tieneMovimientos: boolean;
  /** Rol en `cuentas_sistema` (ej. "resultado_ejercicio"), si tiene. */
  rolSistema: string | null;
  /** La usa algún proceso automático (`parametros_cuentas`). */
  enParametros: boolean;
};

export type CentroCostoPlan = Pick<
  Tablas["centros_costo"]["Row"],
  "id" | "codigo" | "nombre" | "disciplina_id" | "activo"
> & { disciplinaNombre: string | null };

export const NOMBRE_ROL_SISTEMA: Record<string, string> = {
  resultado_ejercicio: "Resultado del ejercicio",
  resultados_acumulados: "Resultados acumulados",
  diferencia_cambio_ganada: "Dif. de cambio ganada (revaluación)",
  diferencia_cambio_perdida: "Dif. de cambio perdida (revaluación)",
  diferencia_cambio_ganada_realizada: "Dif. de cambio ganada (realizada)",
  diferencia_cambio_perdida_realizada: "Dif. de cambio perdida (realizada)",
};

/** Activo y egreso son deudoras; pasivo, patrimonio e ingreso, acreedoras. */
export function naturalezaPorDefecto(clase: ClaseCuenta): Naturaleza {
  return clase === "activo" || clase === "egreso" ? "deudora" : "acreedora";
}

/** Solo las cuentas de ingresos y egresos pueden marcarse como "no mueve fondos". */
export function admiteAfectaCaja(clase: ClaseCuenta): boolean {
  return clase === "ingreso" || clase === "egreso";
}

/** Solo activo y pasivo pueden llevar moneda extranjera. */
export function admiteMonedaExtranjera(clase: ClaseCuenta): boolean {
  return clase === "activo" || clase === "pasivo";
}

/** Orden natural de códigos: 1.1.2 < 1.1.10. */
export function compararCodigos(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    const d = Number(pa[i]) - Number(pb[i]);
    if (d !== 0) return d;
  }
  return 0;
}

/** Último segmento de un código: "1.1.01.05" → "05". */
function ultimoSegmento(codigo: string): string {
  return codigo.slice(codigo.lastIndexOf(".") + 1);
}

/**
 * Siguiente código libre bajo `padre`, con el mismo ancho de dígitos que los
 * hermanos (01..06 → 07). Sin hijos: padre + ".01". La base admite hasta 3
 * dígitos por segmento.
 */
export function sugerirCodigo(codigoPadre: string, codigosHijos: string[]): string {
  if (codigosHijos.length === 0) return `${codigoPadre}.01`;
  const segmentos = codigosHijos.map(ultimoSegmento);
  const ancho = Math.max(...segmentos.map((s) => s.length));
  const usados = new Set(segmentos.map(Number));
  let siguiente = Math.max(...usados) + 1;
  if (siguiente > 999) {
    siguiente = 1;
    while (usados.has(siguiente) && siguiente <= 999) siguiente++;
  }
  const texto = String(siguiente);
  return `${codigoPadre}.${texto.padStart(Math.max(ancho, texto.length), "0")}`;
}

/** Normaliza para buscar sin tildes ni mayúsculas. */
export function normalizarBusqueda(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}
