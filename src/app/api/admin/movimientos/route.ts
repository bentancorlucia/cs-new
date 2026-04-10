import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { getCuentasTienda, getCuentasTiendaIds } from "@/lib/tienda/cuentas";
import { z } from "zod";

const TIENDA_ROLES = ["super_admin", "tienda"];

const movimientoSchema = z.object({
  cuenta_id: z.number().positive(),
  tipo: z.enum(["ingreso", "egreso"]),
  categoria_id: z.number().positive(),
  subcategoria_id: z.number().positive().optional().nullable(),
  monto: z.number().positive("Monto debe ser mayor a 0"),
  moneda: z.enum(["UYU", "USD"]).default("UYU"),
  fecha: z.string().min(1),
  descripcion: z.string().min(1).max(500),
  referencia: z.string().max(100).optional().nullable(),
  notas: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = await createServerClient();

    const cuentas = await getCuentasTienda(supabase);
    const cuentaIds = getCuentasTiendaIds(cuentas);

    const { searchParams } = new URL(request.url);
    const cuenta_id = searchParams.get("cuenta_id");
    const tipo = searchParams.get("tipo");
    const desde = searchParams.get("desde");
    const hasta = searchParams.get("hasta");
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "25");
    const offset = (page - 1) * limit;

    let query = supabase
      .from("movimientos_financieros")
      .select(
        `
        *,
        cuentas_financieras(id, nombre, tipo, moneda, color),
        categorias_financieras!movimientos_financieros_categoria_id_fkey(id, nombre, slug, color, icono)
      `,
        { count: "exact" }
      )
      .in("cuenta_id", cuentaIds)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });

    if (cuenta_id) {
      const cid = parseInt(cuenta_id);
      if (!cuentaIds.includes(cid)) {
        return NextResponse.json({ error: "Cuenta no válida" }, { status: 400 });
      }
      query = query.eq("cuenta_id", cid);
    }
    if (tipo) query = query.eq("tipo", tipo as "ingreso" | "egreso");
    if (desde) query = query.gte("fecha", desde);
    if (hasta) query = query.lte("fecha", hasta);
    if (search) {
      query = query.or(
        `descripcion.ilike.%${search}%,referencia.ilike.%${search}%`
      );
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    // Totals for filtered period
    let totalsQuery = supabase
      .from("movimientos_financieros")
      .select("tipo, monto")
      .in("cuenta_id", cuentaIds);

    if (cuenta_id) totalsQuery = totalsQuery.eq("cuenta_id", parseInt(cuenta_id));
    if (tipo) totalsQuery = totalsQuery.eq("tipo", tipo as "ingreso" | "egreso");
    if (desde) totalsQuery = totalsQuery.gte("fecha", desde);
    if (hasta) totalsQuery = totalsQuery.lte("fecha", hasta);
    if (search) {
      totalsQuery = totalsQuery.or(
        `descripcion.ilike.%${search}%,referencia.ilike.%${search}%`
      );
    }

    const { data: allMovs } = await totalsQuery;
    const totals = (allMovs || []).reduce(
      (acc: { ingresos: number; egresos: number }, m: any) => {
        if (m.tipo === "ingreso") acc.ingresos += m.monto;
        else acc.egresos += m.monto;
        return acc;
      },
      { ingresos: 0, egresos: 0 }
    );

    // Categorías de tienda (padres con modulo='tienda' + sus hijas)
    const { data: catsPadre } = await supabase
      .from("categorias_financieras")
      .select("id, nombre, slug, tipo, color, icono, padre_id, modulo")
      .eq("activa", true)
      .eq("modulo", "tienda")
      .order("orden", { ascending: true });

    const padreIds = (catsPadre || []).map((c: any) => c.id);

    let categorias = catsPadre || [];
    if (padreIds.length > 0) {
      const { data: catsHijas } = await supabase
        .from("categorias_financieras")
        .select("id, nombre, slug, tipo, color, icono, padre_id, modulo")
        .eq("activa", true)
        .in("padre_id", padreIds)
        .order("orden", { ascending: true });

      categorias = [...categorias, ...(catsHijas || [])];
    }

    return NextResponse.json({
      movimientos: data,
      cuentas: cuentas.map((c: any) => ({
        id: c.id,
        nombre: c.nombre,
        tipo: c.tipo,
        moneda: c.moneda,
        color: c.color,
        saldo_actual: c.saldo_actual,
      })),
      categorias: categorias || [],
      totals: { ...totals, neto: totals.ingresos - totals.egresos },
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = await createServerClient();
    const user = await getCurrentUser();

    const cuentas = await getCuentasTienda(supabase);
    const cuentaIds = getCuentasTiendaIds(cuentas);

    const body = await request.json();
    const parsed = movimientoSchema.parse(body);

    if (!cuentaIds.includes(parsed.cuenta_id)) {
      return NextResponse.json(
        { error: "Cuenta no pertenece a tienda" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("movimientos_financieros")
      .insert({
        ...parsed,
        origen_tipo: "manual",
        registrado_por: user?.id ?? null,
      } as any)
      .select(
        `
        *,
        cuentas_financieras(id, nombre, tipo, moneda, color),
        categorias_financieras!movimientos_financieros_categoria_id_fkey(id, nombre, slug, color, icono)
      `
      )
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
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
