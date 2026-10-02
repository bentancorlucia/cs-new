import { NextRequest, NextResponse } from "next/server";
import { createComunicacionesAdminClient } from "@/lib/comunicaciones/server";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import type { Json } from "@/types/comunicaciones";

// GET /api/comunicaciones/automatizaciones — Vercel Cron diario (ver
// vercel.json). Cada automatización activa corre una vez por período (la
// base lo garantiza); las asistidas quedan en borrador para aprobar.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const db = createComunicacionesAdminClient();
  const hoy = hoyUruguay();
  const [anio, mes, dia] = hoy.split("-").map(Number);
  const { data: autos } = await db.from("automatizaciones").select("*").eq("activa", true);
  const resultado: Record<string, string | null> = {};

  for (const a of autos ?? []) {
    const parametros = (a.parametros ?? {}) as { dia_del_mes?: number };
    let corrida: { periodo: string; filtro: Record<string, unknown>; dedupe: string } | null = null;

    if (a.clave === "bienvenida") {
      // Altas de la última semana que todavía no recibieron la bienvenida.
      const desde = new Date(Date.UTC(anio, mes - 1, dia - 7)).toISOString().slice(0, 10);
      corrida = { periodo: hoy, filtro: { alta_desde: desde }, dedupe: "bienvenida" };
    } else if (a.clave === "cumpleanos") {
      corrida = { periodo: hoy, filtro: { cumple_hoy: true }, dedupe: `cumpleanos:${anio}` };
    } else if (a.clave === "cuota_vencida") {
      if (dia === (parametros.dia_del_mes ?? 15)) {
        const periodo = hoy.slice(0, 7);
        corrida = { periodo, filtro: { con_deuda: true }, dedupe: `cuota_vencida:${periodo}` };
      }
    }
    if (!corrida) continue;

    const { data, error } = await db.rpc("correr_automatizacion", {
      p_clave: a.clave,
      p_periodo: corrida.periodo,
      p_filtro: corrida.filtro as Json,
      p_dedupe_prefijo: corrida.dedupe,
    });
    resultado[a.clave] = error ? `error: ${error.message}` : (data as string | null);
  }

  return NextResponse.json({ hoy, resultado });
}
