import { NextResponse } from "next/server";
import { getUserRoles } from "@/lib/supabase/roles";
import { parseRango, RangoInvalidoError } from "@/lib/reportes/rango";
import type { RangoFechas, ReporteScope } from "@/types/reportes";
import { generarReporteDonaciones, generarReportePromocodes, generarReporteTienda } from "./tienda";

/** Quién ve los reportes de la tienda (la comisión fiscal, solo lectura). */
export const ROLES_REPORTES = ["super_admin", "tienda", "tesorero", "comision_fiscal"];

export const SCOPES: ReporteScope[] = ["tienda", "donaciones", "promocodes"];

export const esScope = (s: string): s is ReporteScope => (SCOPES as string[]).includes(s);

export async function puedeVerReportes(): Promise<boolean> {
  const roles = await getUserRoles();
  return roles.some((r) => ROLES_REPORTES.includes(r));
}

export async function generarReporte(scope: ReporteScope, rango: RangoFechas) {
  if (scope === "tienda") return generarReporteTienda(rango);
  if (scope === "donaciones") return generarReporteDonaciones(rango);
  return generarReportePromocodes(rango);
}

/** Valida sesión, rol, scope y rango para las rutas de /api/admin/reportes. */
export async function prepararPedido(
  scopeParam: string,
  searchParams: URLSearchParams
): Promise<{ ok: true; scope: ReporteScope; rango: RangoFechas } | { ok: false; respuesta: NextResponse }> {
  if (!(await puedeVerReportes())) {
    return { ok: false, respuesta: NextResponse.json({ error: "No autorizado" }, { status: 403 }) };
  }
  if (!esScope(scopeParam)) {
    return { ok: false, respuesta: NextResponse.json({ error: "Reporte inexistente" }, { status: 404 }) };
  }
  try {
    return { ok: true, scope: scopeParam, rango: parseRango(searchParams) };
  } catch (e) {
    const msg = e instanceof RangoInvalidoError ? e.message : "Rango inválido";
    return { ok: false, respuesta: NextResponse.json({ error: msg }, { status: 400 }) };
  }
}
