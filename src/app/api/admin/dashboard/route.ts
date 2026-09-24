import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/supabase/roles";
import { obtenerDashboardTienda } from "@/lib/tienda/dashboard";

const TIENDA_ROLES = ["super_admin", "tienda"];

export async function GET() {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = createAdminClient();

    return NextResponse.json(await obtenerDashboardTienda(supabase));
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
