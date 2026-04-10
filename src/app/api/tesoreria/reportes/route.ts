import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";

const TESORERIA_ROLES = ["super_admin", "tesorero"];

export type TipoReporte =
  | "estado-resultados"
  | "flujo-caja"
  | "balance-cuentas"
  | "presupuesto-real"
  | "cierre-mensual";

/** GET — Obtener datos para un reporte */
export async function GET(request: NextRequest) {
  try {
    await requireRole(TESORERIA_ROLES);
    const supabase = await createServerClient();
    const { searchParams } = new URL(request.url);
    const tipo = searchParams.get("tipo") as TipoReporte;
    const anio = parseInt(searchParams.get("anio") || new Date().getFullYear().toString());
    const mes = parseInt(searchParams.get("mes") || (new Date().getMonth() + 1).toString());

    if (!tipo) {
      return NextResponse.json(
        { error: "Tipo de reporte requerido" },
        { status: 400 }
      );
    }

    const desde = `${anio}-${String(mes).padStart(2, "0")}-01`;
    const ultimoDia = new Date(anio, mes, 0).getDate();
    const hasta = `${anio}-${String(mes).padStart(2, "0")}-${ultimoDia}`;

    switch (tipo) {
      case "estado-resultados": {
        const { data: movimientos } = await supabase
          .from("movimientos_financieros")
          .select("tipo, monto, categoria:categorias_financieras!categoria_id(id, nombre, tipo, color, padre_id)")
          .gte("fecha", desde)
          .lte("fecha", hasta)
          .order("fecha");

        // Agrupar por categoría
        const categorias: Record<string, { nombre: string; tipo: string; color: string; total: number }> = {};
        for (const m of movimientos || []) {
          const cat = (m as any).categoria;
          if (!cat || cat.padre_id) continue; // Solo categorías padre
          const key = cat.id;
          if (!categorias[key]) {
            categorias[key] = { nombre: cat.nombre, tipo: cat.tipo, color: cat.color, total: 0 };
          }
          categorias[key].total += (m as any).monto;
        }

        const ingresos = Object.values(categorias)
          .filter((c) => c.tipo === "ingreso")
          .sort((a, b) => b.total - a.total);
        const egresos = Object.values(categorias)
          .filter((c) => c.tipo === "egreso")
          .sort((a, b) => b.total - a.total);

        const totalIngresos = ingresos.reduce((s, c) => s + c.total, 0);
        const totalEgresos = egresos.reduce((s, c) => s + c.total, 0);

        // Período anterior para comparación
        const mesAnt = mes === 1 ? 12 : mes - 1;
        const anioAnt = mes === 1 ? anio - 1 : anio;
        const desdeAnt = `${anioAnt}-${String(mesAnt).padStart(2, "0")}-01`;
        const ultimoDiaAnt = new Date(anioAnt, mesAnt, 0).getDate();
        const hastaAnt = `${anioAnt}-${String(mesAnt).padStart(2, "0")}-${ultimoDiaAnt}`;

        const { data: movsAnt } = await supabase
          .from("movimientos_financieros")
          .select("tipo, monto")
          .gte("fecha", desdeAnt)
          .lte("fecha", hastaAnt);

        const ingresosAnt = (movsAnt || [])
          .filter((m: any) => m.tipo === "ingreso")
          .reduce((s: number, m: any) => s + m.monto, 0);
        const egresosAnt = (movsAnt || [])
          .filter((m: any) => m.tipo === "egreso")
          .reduce((s: number, m: any) => s + m.monto, 0);

        return NextResponse.json({
          data: {
            tipo: "estado-resultados",
            anio,
            mes,
            ingresos,
            egresos,
            totalIngresos,
            totalEgresos,
            resultado: totalIngresos - totalEgresos,
            periodoAnterior: {
              totalIngresos: ingresosAnt,
              totalEgresos: egresosAnt,
              resultado: ingresosAnt - egresosAnt,
            },
          },
        });
      }

      case "flujo-caja": {
        // Últimos 12 meses
        const meses = [];
        for (let i = 11; i >= 0; i--) {
          const d = new Date(anio, mes - 1 - i, 1);
          meses.push({ anio: d.getFullYear(), mes: d.getMonth() + 1 });
        }

        const flujo = [];
        for (const m of meses) {
          const d = `${m.anio}-${String(m.mes).padStart(2, "0")}-01`;
          const ud = new Date(m.anio, m.mes, 0).getDate();
          const h = `${m.anio}-${String(m.mes).padStart(2, "0")}-${ud}`;

          const { data: movs } = await supabase
            .from("movimientos_financieros")
            .select("tipo, monto")
            .gte("fecha", d)
            .lte("fecha", h);

          const ing = (movs || []).filter((x: any) => x.tipo === "ingreso").reduce((s: number, x: any) => s + x.monto, 0);
          const eg = (movs || []).filter((x: any) => x.tipo === "egreso").reduce((s: number, x: any) => s + x.monto, 0);

          flujo.push({ anio: m.anio, mes: m.mes, ingresos: ing, egresos: eg, neto: ing - eg });
        }

        return NextResponse.json({ data: { tipo: "flujo-caja", flujo } });
      }

      case "balance-cuentas": {
        const { data: cuentas } = await supabase
          .from("cuentas_financieras")
          .select("*")
          .eq("activa", true)
          .order("nombre");

        // Movimientos del período por cuenta
        const movsPorCuenta: Record<string, { ingresos: number; egresos: number }> = {};
        const { data: movs } = await supabase
          .from("movimientos_financieros")
          .select("cuenta_id, tipo, monto")
          .gte("fecha", desde)
          .lte("fecha", hasta);

        for (const m of movs || []) {
          const key = (m as any).cuenta_id;
          if (!movsPorCuenta[key]) movsPorCuenta[key] = { ingresos: 0, egresos: 0 };
          if ((m as any).tipo === "ingreso") movsPorCuenta[key].ingresos += (m as any).monto;
          else movsPorCuenta[key].egresos += (m as any).monto;
        }

        return NextResponse.json({
          data: {
            tipo: "balance-cuentas",
            anio,
            mes,
            cuentas: (cuentas || []).map((c: any) => ({
              ...c,
              movimientos_periodo: movsPorCuenta[c.id] || { ingresos: 0, egresos: 0 },
            })),
          },
        });
      }

      case "presupuesto-real": {
        const { data: presupuestos } = await supabase
          .from("presupuestos")
          .select("*, categoria:categorias_financieras!categoria_id(id, nombre, tipo, color)")
          .eq("anio", anio)
          .eq("mes", mes);

        const { data: movimientos } = await supabase
          .from("movimientos_financieros")
          .select("monto, categoria:categorias_financieras!categoria_id(id, nombre, tipo)")
          .gte("fecha", desde)
          .lte("fecha", hasta);

        // Agrupar real por categoría
        const realPorCat: Record<string, number> = {};
        for (const m of movimientos || []) {
          const cat = (m as any).categoria;
          if (!cat) continue;
          realPorCat[cat.id] = (realPorCat[cat.id] || 0) + (m as any).monto;
        }

        const comparativo = (presupuestos || []).map((p: any) => ({
          categoria: p.categoria?.nombre,
          tipo: p.categoria?.tipo,
          color: p.categoria?.color,
          presupuestado: p.monto_presupuestado,
          real: realPorCat[p.categoria_id] || 0,
          diferencia: (realPorCat[p.categoria_id] || 0) - p.monto_presupuestado,
          porcentaje: p.monto_presupuestado > 0
            ? Math.round(((realPorCat[p.categoria_id] || 0) / p.monto_presupuestado) * 100)
            : 0,
        }));

        return NextResponse.json({
          data: { tipo: "presupuesto-real", anio, mes, comparativo },
        });
      }

      case "cierre-mensual": {
        const { data: cierre } = await supabase
          .from("cierres_mensuales")
          .select("*")
          .eq("anio", anio)
          .eq("mes", mes)
          .single();

        if (!cierre) {
          return NextResponse.json(
            { error: "No hay cierre para este período" },
            { status: 404 }
          );
        }

        return NextResponse.json({
          data: { tipo: "cierre-mensual", cierre },
        });
      }

      default:
        return NextResponse.json(
          { error: "Tipo de reporte no válido" },
          { status: 400 }
        );
    }
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
