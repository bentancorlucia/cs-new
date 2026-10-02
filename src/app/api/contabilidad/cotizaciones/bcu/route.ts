import { NextRequest, NextResponse } from "next/server";
import { createContabilidadAdminClient } from "@/lib/contabilidad/server";
import { BcuError, sincronizarCotizacionesBcu } from "@/lib/contabilidad/bcu";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/contabilidad/cotizaciones/bcu — Vercel Cron (ver vercel.json).
 *
 * Corre a las 20:00 y a las 08:15 de Uruguay y pide siempre los últimos 10
 * días: es idempotente, así que la corrida de la mañana recoge el cierre que
 * el BCU publicó tarde la noche anterior y cualquier corrida perdida
 * (feriados largos, BCU caído) se completa sola en la siguiente.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const resultado = await sincronizarCotizacionesBcu(createContabilidadAdminClient(), 10);
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error("Cotizaciones BCU:", mensaje);
    // 502 si falló el BCU; 500 si falló la base.
    return NextResponse.json({ ok: false, error: mensaje }, { status: e instanceof BcuError ? 502 : 500 });
  }
}
