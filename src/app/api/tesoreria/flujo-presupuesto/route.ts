import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { z } from "zod";

const TESORERIA_ROLES = ["super_admin", "tesorero"];

// ── GET: Load combined flujo + presupuesto context ──────────────────────
export async function GET(request: NextRequest) {
  try {
    await requireRole(TESORERIA_ROLES);
    const supabase = await createServerClient();

    const { searchParams } = new URL(request.url);
    const anio = parseInt(
      searchParams.get("anio") || new Date().getFullYear().toString()
    );

    const ahora = new Date();
    const mesActual =
      ahora.getFullYear() === anio ? ahora.getMonth() + 1 : 12;

    // ── Parallel fetches ──
    const [
      { data: categorias, error: catErr },
      { data: presupuestos, error: presErr },
      { data: movimientos, error: movErr },
      { data: cuentas, error: cuentasErr },
    ] = await Promise.all([
      supabase
        .from("categorias_financieras")
        .select("id, nombre, slug, tipo, color, icono, padre_id, orden")
        .eq("activa", true)
        .order("orden"),
      supabase
        .from("presupuestos")
        .select("id, anio, mes, categoria_id, monto_presupuestado, moneda, notas")
        .eq("anio", anio),
      supabase
        .from("movimientos_financieros")
        .select("tipo, categoria_id, monto, moneda, fecha")
        .gte("fecha", `${anio}-01-01`)
        .lte("fecha", `${anio}-12-31`)
        .order("fecha"),
      supabase
        .from("cuentas_financieras")
        .select("id, nombre, saldo_actual, moneda, tipo, color, activa")
        .eq("activa", true),
    ]);

    if (catErr) throw catErr;
    if (presErr) throw presErr;
    if (movErr) throw movErr;
    if (cuentasErr) throw cuentasErr;

    // ── Saldos por moneda ──
    const saldosPorMoneda: Record<string, number> = {};
    for (const c of cuentas || []) {
      saldosPorMoneda[c.moneda] =
        (saldosPorMoneda[c.moneda] || 0) + (c.saldo_actual || 0);
    }

    // ── Aggregate real amounts by categoria × mes × moneda ──
    const reales: Record<string, number> = {};
    // key: `${categoria_id}-${mes}` (all converted or by moneda)
    const realesPorMoneda: Record<string, Record<string, number>> = {};
    // key: `${categoria_id}-${mes}`, value: { UYU: x, USD: y }

    for (const mov of movimientos || []) {
      const mes = parseInt(mov.fecha.split("-")[1]);
      const key = `${mov.categoria_id}-${mes}`;
      reales[key] = (reales[key] || 0) + mov.monto;

      if (!realesPorMoneda[key]) realesPorMoneda[key] = {};
      realesPorMoneda[key][mov.moneda] =
        (realesPorMoneda[key][mov.moneda] || 0) + mov.monto;
    }

    // ── Flujo mensual ──
    const mesesData: Record<
      number,
      {
        ingresosUYU: number;
        egresosUYU: number;
        ingresosUSD: number;
        egresosUSD: number;
      }
    > = {};
    for (let m = 1; m <= 12; m++) {
      mesesData[m] = {
        ingresosUYU: 0,
        egresosUYU: 0,
        ingresosUSD: 0,
        egresosUSD: 0,
      };
    }

    for (const mov of movimientos || []) {
      const mes = parseInt(mov.fecha.split("-")[1]);
      const moneda = mov.moneda as "UYU" | "USD";
      if (mov.tipo === "ingreso") {
        if (moneda === "USD") mesesData[mes].ingresosUSD += mov.monto;
        else mesesData[mes].ingresosUYU += mov.monto;
      } else {
        if (moneda === "USD") mesesData[mes].egresosUSD += mov.monto;
        else mesesData[mes].egresosUYU += mov.monto;
      }
    }

    // ── Distribution by category for each month ──
    const distribucionPorMes: Record<
      number,
      { ingresos: { nombre: string; monto: number; color: string }[];
        egresos: { nombre: string; monto: number; color: string }[] }
    > = {};

    const topCats = (categorias || []).filter((c) => !c.padre_id);

    for (let m = 1; m <= 12; m++) {
      const ingresos: { nombre: string; monto: number; color: string }[] = [];
      const egresos: { nombre: string; monto: number; color: string }[] = [];

      for (const cat of topCats) {
        const key = `${cat.id}-${m}`;
        const monto = reales[key] || 0;
        if (monto > 0) {
          const item = {
            nombre: cat.nombre,
            monto: Math.round(monto),
            color: cat.color || "#6B7280",
          };
          if (cat.tipo === "ingreso") ingresos.push(item);
          else egresos.push(item);
        }
      }

      ingresos.sort((a, b) => b.monto - a.monto);
      egresos.sort((a, b) => b.monto - a.monto);
      distribucionPorMes[m] = { ingresos, egresos };
    }

    // ── Calculate saldo inicial del año ──
    const totalNetoAnio = Object.values(mesesData).reduce(
      (sum, m) =>
        sum + m.ingresosUYU - m.egresosUYU + m.ingresosUSD - m.egresosUSD,
      0
    );
    const saldoTotalActual = Object.values(saldosPorMoneda).reduce(
      (s, v) => s + v,
      0
    );

    // ── Historical data for projections (last 6 months averages) ──
    // promediosPorCategoria: backward compat (top-level, single number)
    const promediosPorCategoria: Record<string, number> = {};
    // promediosPorCategoriaMoneda: all categories, split by currency
    // key: catId, value: { UYU: avg, USD: avg }
    const promediosPorCategoriaMoneda: Record<string, Record<string, number>> = {};

    const mesesConDatos = new Set<number>();

    for (const mov of movimientos || []) {
      const mes = parseInt(mov.fecha.split("-")[1]);
      if (mes <= mesActual) mesesConDatos.add(mes);
    }

    const mesesRealesArr = Array.from(mesesConDatos).sort((a, b) => a - b);
    const ultimosMeses = mesesRealesArr.slice(-6);
    const nMesesBase = ultimosMeses.length || 1;

    // Compute for ALL categories (including subcategories)
    for (const cat of (categorias || [])) {
      let total = 0;
      let count = 0;
      const totalPorMoneda: Record<string, number> = {};
      const countPorMoneda: Record<string, number> = {};

      for (const m of ultimosMeses) {
        const key = `${cat.id}-${m}`;
        if (reales[key]) {
          total += reales[key];
          count++;
        }
        // Per currency
        const porMoneda = realesPorMoneda[key];
        if (porMoneda) {
          for (const [mon, monto] of Object.entries(porMoneda)) {
            totalPorMoneda[mon] = (totalPorMoneda[mon] || 0) + monto;
            countPorMoneda[mon] = (countPorMoneda[mon] || 0) + 1;
          }
        }
      }

      if (count > 0) {
        promediosPorCategoria[cat.id.toString()] = Math.round(total / count);
      }

      const avgMoneda: Record<string, number> = {};
      for (const [mon, t] of Object.entries(totalPorMoneda)) {
        avgMoneda[mon] = Math.round(t / nMesesBase);
      }
      if (Object.keys(avgMoneda).length > 0) {
        promediosPorCategoriaMoneda[cat.id.toString()] = avgMoneda;
      }
    }

    return NextResponse.json({
      anio,
      mesActual,
      categorias: categorias || [],
      presupuestos: presupuestos || [],
      reales,
      realesPorMoneda,
      mesesData,
      saldosPorMoneda,
      cuentas: cuentas || [],
      distribucionPorMes,
      promediosPorCategoria,
      promediosPorCategoriaMoneda,
    });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── POST: Save presupuesto (bulk upsert) ────────────────────────────────
const presupuestoBulkSchema = z.object({
  anio: z.number().min(2024),
  mes: z.number().min(1).max(12),
  items: z.array(
    z.object({
      categoria_id: z.number().positive(),
      monto_presupuestado: z.number().min(0),
      moneda: z.enum(["UYU", "USD"]).optional().default("UYU"),
    })
  ),
});

const copiarSchema = z.object({
  action: z.literal("copiar"),
  anio_origen: z.number().min(2024),
  mes_origen: z.number().min(1).max(12),
  anio_destino: z.number().min(2024),
  mes_destino: z.number().min(1).max(12),
});

const copiarAnioSchema = z.object({
  action: z.literal("copiar_anio"),
  anio_origen: z.number().min(2024),
  anio_destino: z.number().min(2024),
});

export async function POST(request: NextRequest) {
  try {
    await requireRole(TESORERIA_ROLES);
    const supabase = await createServerClient();
    const user = await getCurrentUser();
    const body = await request.json();

    // ── Copy from another month ──
    if (body.action === "copiar") {
      const parsed = copiarSchema.parse(body);

      const { data: origen, error: origenErr } = await supabase
        .from("presupuestos")
        .select("categoria_id, monto_presupuestado, moneda")
        .eq("anio", parsed.anio_origen)
        .eq("mes", parsed.mes_origen);

      if (origenErr) throw origenErr;
      if (!origen || origen.length === 0) {
        return NextResponse.json(
          { error: "No hay presupuesto en el período origen" },
          { status: 400 }
        );
      }

      const items = origen.map((p) => ({
        anio: parsed.anio_destino,
        mes: parsed.mes_destino,
        categoria_id: p.categoria_id,
        monto_presupuestado: p.monto_presupuestado,
        moneda: p.moneda || "UYU",
        created_by: user?.id ?? null,
      }));

      const { error } = await supabase
        .from("presupuestos")
        .upsert(items as any, { onConflict: "anio,mes,categoria_id" });

      if (error) throw error;
      return NextResponse.json({ count: items.length }, { status: 201 });
    }

    // ── Copy entire year ──
    if (body.action === "copiar_anio") {
      const parsed = copiarAnioSchema.parse(body);

      const { data: origen, error: origenErr } = await supabase
        .from("presupuestos")
        .select("mes, categoria_id, monto_presupuestado, moneda")
        .eq("anio", parsed.anio_origen);

      if (origenErr) throw origenErr;
      if (!origen || origen.length === 0) {
        return NextResponse.json(
          { error: "No hay presupuesto en el año origen" },
          { status: 400 }
        );
      }

      const items = origen.map((p) => ({
        anio: parsed.anio_destino,
        mes: p.mes,
        categoria_id: p.categoria_id,
        monto_presupuestado: p.monto_presupuestado,
        moneda: p.moneda || "UYU",
        created_by: user?.id ?? null,
      }));

      const { error } = await supabase
        .from("presupuestos")
        .upsert(items as any, { onConflict: "anio,mes,categoria_id" });

      if (error) throw error;
      return NextResponse.json({ count: items.length }, { status: 201 });
    }

    // ── Bulk upsert for a month ──
    const parsed = presupuestoBulkSchema.parse(body);

    const items = parsed.items.map((item) => ({
      anio: parsed.anio,
      mes: parsed.mes,
      categoria_id: item.categoria_id,
      monto_presupuestado: item.monto_presupuestado,
      moneda: item.moneda || "UYU",
      created_by: user?.id ?? null,
    }));

    const { error } = await supabase
      .from("presupuestos")
      .upsert(items as any, { onConflict: "anio,mes,categoria_id" });

    if (error) throw error;
    return NextResponse.json({ count: items.length }, { status: 201 });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
