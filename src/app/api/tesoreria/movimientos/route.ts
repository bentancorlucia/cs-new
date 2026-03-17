import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { z } from "zod";

const TESORERIA_ROLES = ["super_admin", "tesorero"];

const movimientoSchema = z.object({
  cuenta_id: z.number().positive(),
  tipo: z.enum(["ingreso", "egreso"]),
  categoria_id: z.number().positive(),
  subcategoria_id: z.number().positive().optional().nullable(),
  monto: z.number().positive("Monto debe ser mayor a 0"),
  moneda: z.enum(["UYU", "USD"]).default("UYU"),
  fecha: z.string().min(1),
  descripcion: z.string().min(1).max(500),
  comprobante_url: z.string().optional().nullable(),
  referencia: z.string().max(100).optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  notas: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    await requireRole(TESORERIA_ROLES);
    const supabase = await createServerClient();

    const { searchParams } = new URL(request.url);
    const cuenta_id = searchParams.get("cuenta_id");
    const tipo = searchParams.get("tipo");
    const categoria_id = searchParams.get("categoria_id");
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
        cuentas_financieras(id, nombre, moneda, color),
        categorias_financieras!movimientos_financieros_categoria_id_fkey(id, nombre, slug, color, icono)
      `,
        { count: "exact" }
      )
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });

    if (cuenta_id) query = query.eq("cuenta_id", parseInt(cuenta_id));
    if (tipo) query = query.eq("tipo", tipo as "ingreso" | "egreso");
    if (categoria_id) query = query.eq("categoria_id", parseInt(categoria_id));
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

    // Calculate totals for the filtered period
    let totalsQuery = supabase
      .from("movimientos_financieros")
      .select("tipo, monto");

    if (cuenta_id) totalsQuery = totalsQuery.eq("cuenta_id", parseInt(cuenta_id));
    if (tipo) totalsQuery = totalsQuery.eq("tipo", tipo as "ingreso" | "egreso");
    if (categoria_id) totalsQuery = totalsQuery.eq("categoria_id", parseInt(categoria_id));
    if (desde) totalsQuery = totalsQuery.gte("fecha", desde);
    if (hasta) totalsQuery = totalsQuery.lte("fecha", hasta);
    if (search) {
      totalsQuery = totalsQuery.or(
        `descripcion.ilike.%${search}%,referencia.ilike.%${search}%`
      );
    }

    const { data: allMovs } = await totalsQuery;
    const totals = (allMovs || []).reduce(
      (acc, m) => {
        if (m.tipo === "ingreso") acc.ingresos += m.monto;
        else acc.egresos += m.monto;
        return acc;
      },
      { ingresos: 0, egresos: 0 }
    );

    return NextResponse.json({
      data,
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
    await requireRole(TESORERIA_ROLES);
    const supabase = await createServerClient();
    const user = await getCurrentUser();
    const body = await request.json();
    const parsed = movimientoSchema.parse(body);

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
        cuentas_financieras(id, nombre, moneda, color),
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
