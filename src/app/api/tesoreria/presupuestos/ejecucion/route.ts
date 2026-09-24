import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import type { TipoPeriodo } from "@/lib/tesoreria/presupuesto";
import type { Moneda } from "@/lib/tesoreria/conversion";
import { calcularEjecucionPresupuesto } from "@/lib/tesoreria/ejecucion";

const ROLES = ["super_admin", "tesorero"];

export async function GET(req: NextRequest) {
  try {
    await requireRole(ROLES);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = await createServerClient();
  const { searchParams } = new URL(req.url);
  const tipo = (searchParams.get("tipo_periodo") ?? "anual") as TipoPeriodo;
  const anio = Number(searchParams.get("anio") ?? new Date().getFullYear());
  const numero = Number(searchParams.get("periodo_numero") ?? "1");
  const moneda = (searchParams.get("moneda") ?? "UYU") as Moneda;

  try {
    return NextResponse.json(
      await calcularEjecucionPresupuesto(supabase, { tipo, anio, numero, moneda })
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : (error as { message?: string })?.message ?? "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
