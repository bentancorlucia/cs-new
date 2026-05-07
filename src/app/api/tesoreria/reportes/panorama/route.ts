import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import { getCotizacionVigente } from "@/lib/tesoreria/bcu";
import { convertir } from "@/lib/tesoreria/conversion";

const ROLES = ["super_admin", "tesorero"];

export async function GET() {
  try {
    await requireRole(ROLES);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = await createServerClient();
  const cotizacion = await getCotizacionVigente();

  // Saldos por cuenta
  const { data: cuentas } = await supabase
    .from("cuentas_financieras")
    .select("id, nombre, moneda, saldo_actual, color, tipo, banco")
    .eq("activa", true)
    .eq("incluir_en_tesoreria", true);

  let totalUYU = 0;
  let totalUSD = 0;
  for (const c of cuentas ?? []) {
    const s = Number(c.saldo_actual);
    if (c.moneda === "UYU") {
      totalUYU += s;
      const usd = convertir(s, "UYU", "USD", cotizacion);
      if (usd !== null) totalUSD += usd;
    } else {
      totalUSD += s;
      const uyu = convertir(s, "USD", "UYU", cotizacion);
      if (uyu !== null) totalUYU += uyu;
    }
  }

  // Evolución mensual (últimos 12 meses): suma de movimientos por mes
  const hoy = new Date();
  const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1)
    .toISOString()
    .slice(0, 10);

  const { data: movs } = await supabase
    .from("movimientos_financieros")
    .select("fecha, tipo, monto, moneda, categoria_id")
    .gte("fecha", desde)
    .order("fecha", { ascending: true });

  // Agrupar por mes (YYYY-MM)
  const meses = new Map<
    string,
    { ingreso_uyu: number; egreso_uyu: number; ingreso_usd: number; egreso_usd: number }
  >();

  for (const m of movs ?? []) {
    const ym = m.fecha.slice(0, 7);
    if (!meses.has(ym)) {
      meses.set(ym, { ingreso_uyu: 0, egreso_uyu: 0, ingreso_usd: 0, egreso_usd: 0 });
    }
    const slot = meses.get(ym)!;
    const monto = Number(m.monto);
    if (m.moneda === "UYU") {
      if (m.tipo === "ingreso") slot.ingreso_uyu += monto;
      else slot.egreso_uyu += monto;
    } else {
      if (m.tipo === "ingreso") slot.ingreso_usd += monto;
      else slot.egreso_usd += monto;
    }
  }

  // Asegurar 12 meses consecutivos
  const evolucion: Array<{
    mes: string;
    ingreso_uyu: number;
    egreso_uyu: number;
    ingreso_usd: number;
    egreso_usd: number;
  }> = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const slot = meses.get(ym) ?? {
      ingreso_uyu: 0,
      egreso_uyu: 0,
      ingreso_usd: 0,
      egreso_usd: 0,
    };
    evolucion.push({ mes: ym, ...slot });
  }

  // Top categorías egreso (mes actual)
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  const desdeMes = `${mesActual}-01`;

  const { data: movsMes } = await supabase
    .from("movimientos_financieros")
    .select("categoria_id, tipo, monto, moneda")
    .gte("fecha", desdeMes);

  const { data: cats } = await supabase
    .from("categorias_financieras")
    .select("id, nombre, color, tipo");

  const catsMap = new Map((cats ?? []).map((c) => [c.id, c]));

  const acumPorCat = new Map<number, { nombre: string; color: string | null; ingreso: number; egreso: number }>();
  for (const m of movsMes ?? []) {
    if (m.categoria_id == null) continue;
    const cat = catsMap.get(m.categoria_id);
    if (!cat) continue;
    if (!acumPorCat.has(cat.id)) {
      acumPorCat.set(cat.id, { nombre: cat.nombre, color: cat.color, ingreso: 0, egreso: 0 });
    }
    const slot = acumPorCat.get(cat.id)!;
    const monto = Number(m.monto);
    if (m.tipo === "ingreso") slot.ingreso += monto;
    else slot.egreso += monto;
  }

  const topEgresos = [...acumPorCat.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .filter((c) => c.egreso > 0)
    .sort((a, b) => b.egreso - a.egreso)
    .slice(0, 5);

  const topIngresos = [...acumPorCat.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .filter((c) => c.ingreso > 0)
    .sort((a, b) => b.ingreso - a.ingreso)
    .slice(0, 5);

  return NextResponse.json({
    totales: { totalUYU, totalUSD },
    cuentas: cuentas ?? [],
    cotizacion,
    evolucion,
    topEgresos,
    topIngresos,
  });
}
