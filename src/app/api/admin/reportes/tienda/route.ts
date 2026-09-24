import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/supabase/roles";
import { parseRango } from "@/lib/reportes/rango";
import { generarReporteTienda } from "@/lib/reportes/tienda";

export const dynamic = "force-dynamic";

const TIENDA_ROLES = ["super_admin", "tienda"];

export async function GET(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const db = createAdminClient();

    const { searchParams } = new URL(request.url);
    const rango = parseRango(searchParams);

    const reporte = await generarReporteTienda(db, rango);

    return NextResponse.json({ data: reporte });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error";
    if (msg === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
