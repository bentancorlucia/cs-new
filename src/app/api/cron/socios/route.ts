import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/socios";

// GET /api/cron/socios — Vercel Cron diario (ver vercel.json). Las altas y
// bajas con fecha futura cambian el estado de socio (padrón, precio socio,
// roles) el día que corresponde.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const db = createClient<Database, "socios">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: "socios" }, auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data, error } = await db.rpc("sincronizar_vigencias");
  if (error) {
    console.error("[cron socios]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ sincronizadas: data });
}
