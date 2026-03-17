import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";

const TESORERIA_ROLES = ["super_admin", "tesorero"];

export async function GET(request: NextRequest) {
  try {
    await requireRole(TESORERIA_ROLES);
    const supabase = await createServerClient();

    const { searchParams } = new URL(request.url);
    const anio = parseInt(searchParams.get("anio") || new Date().getFullYear().toString());

    // Get all movements for the year
    const { data: movimientos, error: movErr } = await supabase
      .from("movimientos_financieros")
      .select("tipo, categoria_id, monto, fecha")
      .gte("fecha", `${anio}-01-01`)
      .lte("fecha", `${anio}-12-31`)
      .order("fecha");

    if (movErr) throw movErr;

    // Get categories for distribution charts
    const { data: categorias, error: catErr } = await supabase
      .from("categorias_financieras")
      .select("id, nombre, slug, tipo, color, icono, padre_id")
      .eq("activa", true)
      .is("padre_id", null);

    if (catErr) throw catErr;

    // Get initial balance (sum of all account balances minus this year's net)
    const { data: cuentas, error: cuentasErr } = await supabase
      .from("cuentas_financieras")
      .select("saldo_actual, moneda")
      .eq("activa", true);

    if (cuentasErr) throw cuentasErr;

    const saldoActualTotal = (cuentas || [])
      .filter((c) => c.moneda === "UYU")
      .reduce((sum, c) => sum + (c.saldo_actual || 0), 0);

    // Aggregate movements by month
    const mesesData: Record<number, { ingresos: number; egresos: number; porCategoria: Record<string, number> }> = {};
    for (let m = 1; m <= 12; m++) {
      mesesData[m] = { ingresos: 0, egresos: 0, porCategoria: {} };
    }

    for (const mov of movimientos || []) {
      const mes = parseInt(mov.fecha.split("-")[1]);
      if (mov.tipo === "ingreso") {
        mesesData[mes].ingresos += mov.monto;
      } else {
        mesesData[mes].egresos += mov.monto;
      }
      const catKey = `${mov.categoria_id}-${mov.tipo}`;
      mesesData[mes].porCategoria[catKey] =
        (mesesData[mes].porCategoria[catKey] || 0) + mov.monto;
    }

    // Calculate total net of the year to derive starting balance
    const totalNetoAnio = Object.values(mesesData).reduce(
      (sum, m) => sum + m.ingresos - m.egresos,
      0
    );
    const saldoInicialAnio = saldoActualTotal - totalNetoAnio;

    // Build flujo mensual
    const ahora = new Date();
    const mesActual = ahora.getFullYear() === anio ? ahora.getMonth() + 1 : 12;

    let saldoAcumulado = saldoInicialAnio;
    const flujo = [];

    for (let m = 1; m <= 12; m++) {
      const data = mesesData[m];
      const neto = data.ingresos - data.egresos;
      const saldoInicial = saldoAcumulado;
      saldoAcumulado += neto;

      flujo.push({
        mes: m,
        mesKey: `${anio}-${String(m).padStart(2, "0")}`,
        saldoInicial: Math.round(saldoInicial),
        ingresos: Math.round(data.ingresos),
        egresos: Math.round(data.egresos),
        neto: Math.round(neto),
        saldoFinal: Math.round(saldoAcumulado),
        esProyectado: m > mesActual,
        porCategoria: data.porCategoria,
      });
    }

    // Category distribution for the selected month (or current)
    const mesSeleccionado = searchParams.get("mes")
      ? parseInt(searchParams.get("mes")!)
      : mesActual;

    const distMes = mesesData[mesSeleccionado] || { ingresos: 0, egresos: 0, porCategoria: {} };

    // Build category distribution
    const distribucionIngresos: { nombre: string; monto: number; color: string }[] = [];
    const distribucionEgresos: { nombre: string; monto: number; color: string }[] = [];

    for (const cat of categorias || []) {
      const ingKey = `${cat.id}-ingreso`;
      const egrKey = `${cat.id}-egreso`;
      const montoIng = distMes.porCategoria[ingKey] || 0;
      const montoEgr = distMes.porCategoria[egrKey] || 0;

      if (montoIng > 0 && cat.tipo === "ingreso") {
        distribucionIngresos.push({
          nombre: cat.nombre,
          monto: Math.round(montoIng),
          color: cat.color || "#6B7280",
        });
      }
      if (montoEgr > 0 && cat.tipo === "egreso") {
        distribucionEgresos.push({
          nombre: cat.nombre,
          monto: Math.round(montoEgr),
          color: cat.color || "#6B7280",
        });
      }
    }

    // Sort by amount desc
    distribucionIngresos.sort((a, b) => b.monto - a.monto);
    distribucionEgresos.sort((a, b) => b.monto - a.monto);

    return NextResponse.json({
      flujo,
      anio,
      saldoInicialAnio: Math.round(saldoInicialAnio),
      saldoActual: Math.round(saldoActualTotal),
      distribucionIngresos,
      distribucionEgresos,
      mesSeleccionado,
    });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
