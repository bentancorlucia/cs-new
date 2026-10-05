import type { SociosClient } from "./server";
import { sendLiquidacionDisciplina } from "@/lib/email/send";
import { variablesLiquidacion, type AvisoLiquidaciones, type ResumenLiquidacion } from "./liquidacion-resumen";

export * from "./liquidacion-resumen";

const sitio = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.clubseminario.com.uy").replace(/\/$/, "");

/**
 * Encola el resumen de cada liquidación a los representantes de su
 * disciplina que reciben la liquidación. Un reenvío vuelve a mandarlo
 * (sin reenvío, un mismo resumen no se manda dos veces a la misma persona).
 */
export async function avisarLiquidaciones(
  db: SociosClient,
  ids: number[],
  opciones: { reenvio?: boolean } = {}
): Promise<AvisoLiquidaciones> {
  let enviados = 0;
  const sinDestinatarios: string[] = [];
  for (const id of ids) {
    const [{ data: resumen, error: e1 }, { data: dest, error: e2 }] = await Promise.all([
      db.rpc("resumen_liquidacion", { p_liquidacion: id }),
      db.rpc("destinatarios_liquidacion", { p_liquidacion: id }),
    ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);
    const r = resumen as unknown as ResumenLiquidacion | null;
    if (!r) continue;
    if (!dest?.length) {
      sinDestinatarios.push(r.disciplina);
      continue;
    }
    const panelUrl = `${sitio()}/disciplina/${r.disciplina_id}?tab=liquidaciones&liquidacion=${r.id}`;
    for (const d of dest) {
      await sendLiquidacionDisciplina(d.email, d.nombre, variablesLiquidacion(r, d.nombre, panelUrl), {
        liquidacionId: r.id,
        reenvio: opciones.reenvio ? Date.now().toString(36) : null,
      });
      enviados += 1;
    }
  }
  return { enviados, sinDestinatarios };
}
