import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import { obtenerPanoramaTesoreria } from "@/lib/tesoreria/panorama";

const ROLES = ["super_admin", "tesorero"];

export async function GET() {
  try {
    await requireRole(ROLES);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = await createServerClient();
  return NextResponse.json(await obtenerPanoramaTesoreria(supabase));
}
