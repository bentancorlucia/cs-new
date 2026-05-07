import { NextResponse } from "next/server";
import { getCotizacionVigente, refrescarCotizacion } from "@/lib/tesoreria/bcu";
import { requireRole } from "@/lib/supabase/roles";

const ROLES = ["super_admin", "tesorero", "tienda", "secretaria", "eventos"];

export async function GET() {
  try {
    await requireRole(ROLES);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const cotizacion = await getCotizacionVigente();
  if (!cotizacion) {
    return NextResponse.json(
      { error: "No se pudo obtener cotización" },
      { status: 503 }
    );
  }
  return NextResponse.json({ cotizacion });
}

export async function POST() {
  try {
    await requireRole(["super_admin", "tesorero"]);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const cotizacion = await refrescarCotizacion();
  if (!cotizacion) {
    return NextResponse.json(
      { error: "No se pudo refrescar cotización" },
      { status: 503 }
    );
  }
  return NextResponse.json({ cotizacion });
}
