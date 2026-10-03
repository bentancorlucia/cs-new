import { NextRequest, NextResponse } from "next/server";
import { createComunicacionesAdminClient } from "@/lib/comunicaciones/server";
import { correrAutomatizacion, planCorrida } from "@/lib/comunicaciones/automatizaciones";
import { hoyUruguay } from "@/lib/contabilidad/formato";

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
  const { data: autos } = await db.from("automatizaciones").select("*").eq("activa", true);
  const resultado: Record<string, string | null> = {};

  for (const a of autos ?? []) {
    const plan = planCorrida(a.clave, a.parametros, hoy);
    if (!plan) continue;
    const { envio, error } = await correrAutomatizacion(db, a.clave, plan);
    resultado[a.clave] = error ? `error: ${error}` : envio;
  }

  return NextResponse.json({ hoy, resultado });
}
