import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";

const TESORERIA_ROLES = ["super_admin", "tesorero"];

/** GET — Lista de cierres o datos pre-cierre de un mes */
export async function GET(request: NextRequest) {
  try {
    await requireRole(TESORERIA_ROLES);
    const supabase = await createServerClient();
    const { searchParams } = new URL(request.url);
    const anio = searchParams.get("anio");
    const mes = searchParams.get("mes");

    if (anio && mes) {
      // Obtener resumen pre-cierre para un mes específico
      const anioNum = parseInt(anio);
      const mesNum = parseInt(mes);
      const desde = `${anio}-${mes.padStart(2, "0")}-01`;
      const ultimoDia = new Date(anioNum, mesNum, 0).getDate();
      const hasta = `${anio}-${mes.padStart(2, "0")}-${ultimoDia}`;

      // Cierre existente?
      const { data: cierreExistente } = await supabase
        .from("cierres_mensuales")
        .select("*")
        .eq("anio", anioNum)
        .eq("mes", mesNum)
        .single();

      // Totales por tipo
      const { data: movimientos } = await supabase
        .from("movimientos_financieros")
        .select("tipo, monto, categoria:categorias_financieras!categoria_id(id, nombre, tipo)")
        .gte("fecha", desde)
        .lte("fecha", hasta);

      const totalIngresos = (movimientos || [])
        .filter((m: any) => m.tipo === "ingreso")
        .reduce((sum: number, m: any) => sum + m.monto, 0);

      const totalEgresos = (movimientos || [])
        .filter((m: any) => m.tipo === "egreso")
        .reduce((sum: number, m: any) => sum + m.monto, 0);

      // Saldos por cuenta
      const { data: cuentas } = await supabase
        .from("cuentas_financieras")
        .select("id, nombre, moneda, saldo_actual")
        .eq("activa", true)
        .order("nombre");

      // Categorías resumen
      const categoriasMap: Record<
        string,
        { nombre: string; tipo: string; total: number }
      > = {};
      for (const m of movimientos || []) {
        const cat = (m as any).categoria;
        if (!cat) continue;
        const key = `${cat.id}`;
        if (!categoriasMap[key]) {
          categoriasMap[key] = { nombre: cat.nombre, tipo: cat.tipo, total: 0 };
        }
        categoriasMap[key].total += (m as any).monto;
      }

      // Movimientos pendientes de conciliar
      const { count: pendientesConciliacion } = await supabase
        .from("movimientos_financieros")
        .select("id", { count: "exact", head: true })
        .gte("fecha", desde)
        .lte("fecha", hasta)
        .eq("conciliado", false);

      return NextResponse.json({
        data: {
          cierre: cierreExistente,
          resumen: {
            anio: anioNum,
            mes: mesNum,
            total_ingresos: totalIngresos,
            total_egresos: totalEgresos,
            resultado: totalIngresos - totalEgresos,
            saldos: cuentas || [],
            categorias: Object.values(categoriasMap).sort(
              (a, b) => b.total - a.total
            ),
            pendientes_conciliacion: pendientesConciliacion || 0,
            total_movimientos: movimientos?.length || 0,
          },
        },
      });
    }

    // Lista de cierres
    const { data, error } = await supabase
      .from("cierres_mensuales")
      .select("*")
      .order("anio", { ascending: false })
      .order("mes", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** POST — Cerrar un mes */
export async function POST(request: NextRequest) {
  try {
    await requireRole(TESORERIA_ROLES);
    const supabase = await createServerClient();
    const body = await request.json();
    const { anio, mes, notas } = body;

    if (!anio || !mes) {
      return NextResponse.json(
        { error: "Año y mes requeridos" },
        { status: 400 }
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Verificar que no exista un cierre ya cerrado para ese período
    const { data: existente } = await supabase
      .from("cierres_mensuales")
      .select("id, estado")
      .eq("anio", anio)
      .eq("mes", mes)
      .single();

    if (existente?.estado === "cerrado") {
      return NextResponse.json(
        { error: "Este período ya está cerrado" },
        { status: 400 }
      );
    }

    // Calcular totales del período
    const desde = `${anio}-${String(mes).padStart(2, "0")}-01`;
    const ultimoDia = new Date(anio, mes, 0).getDate();
    const hasta = `${anio}-${String(mes).padStart(2, "0")}-${ultimoDia}`;

    const { data: movimientos } = await supabase
      .from("movimientos_financieros")
      .select("tipo, monto, categoria:categorias_financieras!categoria_id(id, nombre)")
      .gte("fecha", desde)
      .lte("fecha", hasta);

    const totalIngresos = (movimientos || [])
      .filter((m: any) => m.tipo === "ingreso")
      .reduce((sum: number, m: any) => sum + m.monto, 0);

    const totalEgresos = (movimientos || [])
      .filter((m: any) => m.tipo === "egreso")
      .reduce((sum: number, m: any) => sum + m.monto, 0);

    // Snapshot de saldos
    const { data: cuentas } = await supabase
      .from("cuentas_financieras")
      .select("id, nombre, moneda, saldo_actual")
      .eq("activa", true);

    const saldosSnapshot: Record<string, any> = {};
    for (const c of cuentas || []) {
      saldosSnapshot[c.id] = {
        nombre: c.nombre,
        moneda: c.moneda,
        saldo: c.saldo_actual,
      };
    }

    // Snapshot de categorías
    const categoriasSnapshot: Record<string, any> = {};
    for (const m of movimientos || []) {
      const cat = (m as any).categoria;
      if (!cat) continue;
      const key = cat.id;
      if (!categoriasSnapshot[key]) {
        categoriasSnapshot[key] = {
          nombre: cat.nombre,
          total: 0,
        };
      }
      categoriasSnapshot[key].total += (m as any).monto;
    }

    const cierreData = {
      anio,
      mes,
      total_ingresos: totalIngresos,
      total_egresos: totalEgresos,
      resultado: totalIngresos - totalEgresos,
      saldos_snapshot: saldosSnapshot,
      categorias_snapshot: categoriasSnapshot,
      estado: "cerrado",
      cerrado_por: user?.id,
      cerrado_at: new Date().toISOString(),
      notas: notas || null,
    };

    let result;
    if (existente) {
      // Actualizar cierre existente (estaba "abierto")
      const { data, error } = await supabase
        .from("cierres_mensuales")
        .update(cierreData as any)
        .eq("id", existente.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      // Crear nuevo cierre
      const { data, error } = await supabase
        .from("cierres_mensuales")
        .insert(cierreData as any)
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
