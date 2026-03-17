import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { z } from "zod";

const TESORERIA_ROLES = ["super_admin", "tesorero"];

const presupuestoSchema = z.object({
  anio: z.number().min(2024),
  mes: z.number().min(1).max(12),
  categoria_id: z.number().positive(),
  monto_presupuestado: z.number().min(0),
  moneda: z.enum(["UYU", "USD"]).optional().default("UYU"),
  notas: z.string().optional().nullable(),
});

const presupuestoBulkSchema = z.object({
  anio: z.number().min(2024),
  mes: z.number().min(1).max(12),
  items: z.array(
    z.object({
      categoria_id: z.number().positive(),
      monto_presupuestado: z.number().min(0),
      moneda: z.enum(["UYU", "USD"]).optional().default("UYU"),
      notas: z.string().optional().nullable(),
    })
  ),
});

const copiarSchema = z.object({
  anio_origen: z.number().min(2024),
  mes_origen: z.number().min(1).max(12),
  anio_destino: z.number().min(2024),
  mes_destino: z.number().min(1).max(12),
});

export async function GET(request: NextRequest) {
  try {
    await requireRole(TESORERIA_ROLES);
    const supabase = await createServerClient();

    const { searchParams } = new URL(request.url);
    const anio = parseInt(searchParams.get("anio") || new Date().getFullYear().toString());
    const mes = searchParams.get("mes") ? parseInt(searchParams.get("mes")!) : null;

    // Get presupuestos with categories
    let presupQuery = supabase
      .from("presupuestos")
      .select(`
        *,
        categorias_financieras(id, nombre, slug, tipo, color, icono, padre_id)
      `)
      .eq("anio", anio)
      .order("mes");

    if (mes) {
      presupQuery = presupQuery.eq("mes", mes);
    }

    const { data: presupuestos, error: presErr } = await presupQuery;
    if (presErr) throw presErr;

    // Get real amounts for comparison
    const desde = mes
      ? `${anio}-${String(mes).padStart(2, "0")}-01`
      : `${anio}-01-01`;
    const hasta = mes
      ? `${anio}-${String(mes).padStart(2, "0")}-${new Date(anio, mes, 0).getDate()}`
      : `${anio}-12-31`;

    const { data: movimientos, error: movErr } = await supabase
      .from("movimientos_financieros")
      .select("tipo, categoria_id, monto, fecha")
      .gte("fecha", desde)
      .lte("fecha", hasta);

    if (movErr) throw movErr;

    // Get all active categories for the full picture
    const { data: categorias, error: catErr } = await supabase
      .from("categorias_financieras")
      .select("id, nombre, slug, tipo, color, icono, padre_id, orden")
      .eq("activa", true)
      .order("orden");

    if (catErr) throw catErr;

    // Aggregate real amounts by category and month
    const realesPorCategoriaMes: Record<string, number> = {};
    for (const mov of movimientos || []) {
      const movMes = parseInt(mov.fecha.split("-")[1]);
      const key = `${mov.categoria_id}-${movMes}`;
      realesPorCategoriaMes[key] = (realesPorCategoriaMes[key] || 0) + mov.monto;
    }

    return NextResponse.json({
      presupuestos,
      reales: realesPorCategoriaMes,
      categorias,
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

    // Handle "copiar" action
    if (body.action === "copiar") {
      const parsed = copiarSchema.parse(body);

      const { data: origen, error: origenErr } = await supabase
        .from("presupuestos")
        .select("categoria_id, monto_presupuestado, moneda, notas")
        .eq("anio", parsed.anio_origen)
        .eq("mes", parsed.mes_origen);

      if (origenErr) throw origenErr;
      if (!origen || origen.length === 0) {
        return NextResponse.json(
          { error: "No hay presupuesto en el período origen" },
          { status: 400 }
        );
      }

      // Upsert all items into destination
      const items = origen.map((p) => ({
        anio: parsed.anio_destino,
        mes: parsed.mes_destino,
        categoria_id: p.categoria_id,
        monto_presupuestado: p.monto_presupuestado,
        moneda: p.moneda || "UYU",
        notas: p.notas,
        created_by: user?.id ?? null,
      }));

      const { data, error } = await supabase
        .from("presupuestos")
        .upsert(items as any, {
          onConflict: "anio,mes,categoria_id",
        })
        .select();

      if (error) throw error;
      return NextResponse.json({ data, count: items.length }, { status: 201 });
    }

    // Handle bulk upsert
    if (body.items) {
      const parsed = presupuestoBulkSchema.parse(body);

      const items = parsed.items.map((item) => ({
        anio: parsed.anio,
        mes: parsed.mes,
        categoria_id: item.categoria_id,
        monto_presupuestado: item.monto_presupuestado,
        moneda: item.moneda || "UYU",
        notas: item.notas || null,
        created_by: user?.id ?? null,
      }));

      const { data, error } = await supabase
        .from("presupuestos")
        .upsert(items as any, {
          onConflict: "anio,mes,categoria_id",
        })
        .select();

      if (error) throw error;
      return NextResponse.json({ data }, { status: 201 });
    }

    // Single item
    const parsed = presupuestoSchema.parse(body);
    const { data, error } = await supabase
      .from("presupuestos")
      .upsert(
        {
          ...parsed,
          created_by: user?.id ?? null,
        } as any,
        { onConflict: "anio,mes,categoria_id" }
      )
      .select()
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
