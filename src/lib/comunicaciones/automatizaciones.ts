import type { ComunicacionesAdminClient, ComunicacionesClient } from "./server";
import type { Json } from "@/types/comunicaciones";

/**
 * Qué corre cada automatización y para qué período. Lo usan el cron diario
 * (/api/comunicaciones/automatizaciones) y el botón "Correr ahora": misma
 * audiencia, mismo período y misma dedupe_key, así nunca se manda dos veces.
 */

export type PlanCorrida = {
  periodo: string;
  filtro: Record<string, unknown>;
  dedupe: string;
};

export type ParametrosAutomatizacion = { dia_del_mes?: number; excluir_medio?: string };

export const DIA_DEL_MES_DEFECTO = 15;

export function diaDelMes(parametros: unknown) {
  const d = Number((parametros as ParametrosAutomatizacion | null)?.dia_del_mes);
  return Number.isInteger(d) && d >= 1 && d <= 28 ? d : DIA_DEL_MES_DEFECTO;
}

/**
 * Período y filtro de la corrida de hoy. `hoy` es la fecha de Uruguay
 * (YYYY-MM-DD). Las mensuales (cuota_vencida) solo corren el día
 * configurado, salvo que se fuerce a mano (`ignorarDia`): el período sigue
 * siendo el mes, así que no se repite.
 */
export function planCorrida(
  clave: string,
  parametros: unknown,
  hoy: string,
  { ignorarDia = false }: { ignorarDia?: boolean } = {}
): PlanCorrida | null {
  const [anio, mes, dia] = hoy.split("-").map(Number);

  if (clave === "bienvenida") {
    // Altas de la última semana que todavía no recibieron la bienvenida.
    const desde = new Date(Date.UTC(anio, mes - 1, dia - 7)).toISOString().slice(0, 10);
    return { periodo: hoy, filtro: { alta_desde: desde }, dedupe: "bienvenida" };
  }
  if (clave === "cumpleanos") {
    return { periodo: hoy, filtro: { cumple_hoy: true }, dedupe: `cumpleanos:${anio}` };
  }
  if (clave === "cuota_vencida") {
    if (!ignorarDia && dia !== diaDelMes(parametros)) return null;
    const periodo = hoy.slice(0, 7);
    // Por defecto no va a quienes pagan por débito automático (su cuota
    // pendiente se debita sola).
    const excluir = (parametros as ParametrosAutomatizacion | null)?.excluir_medio ?? "debito_visa";
    return { periodo, filtro: { con_deuda: true, excluir_medio: excluir }, dedupe: `cuota_vencida:${periodo}` };
  }
  return null;
}

/**
 * Corre una automatización con su plan. Devuelve el envío creado, o null si
 * no hubo nada que hacer (inactiva, ya corrió en el período o sin
 * destinatarios).
 */
export async function correrAutomatizacion(
  db: ComunicacionesClient | ComunicacionesAdminClient,
  clave: string,
  plan: PlanCorrida
): Promise<{ envio: string | null; error: string | null }> {
  const { data, error } = await db.rpc("correr_automatizacion", {
    p_clave: clave,
    p_periodo: plan.periodo,
    p_filtro: plan.filtro as Json,
    p_dedupe_prefijo: plan.dedupe,
  });
  if (error) return { envio: null, error: error.message };
  return { envio: (data as string | null) ?? null, error: null };
}
