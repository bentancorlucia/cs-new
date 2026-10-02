import { NextRequest, NextResponse } from "next/server";
import { procesarCola } from "@/lib/comunicaciones/worker";

export const maxDuration = 60;

// GET /api/comunicaciones/worker — Vercel Cron cada minuto (ver vercel.json)
// y "patada" inmediata al encolar un mail transaccional.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const resumen = await procesarCola({ presupuestoMs: 50_000 });
    return NextResponse.json(resumen);
  } catch (e) {
    console.error("[comunicaciones] worker:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
