import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";

const ROLES = ["super_admin", "tesorero"];

const movimientoSchema = z.object({
  cuenta_id: z.number().positive(),
  tipo: z.enum(["ingreso", "egreso"]),
  categoria_id: z.number().positive().nullable().optional(),
  subcategoria_id: z.number().positive().nullable().optional(),
  monto: z.number().positive(),
  moneda: z.enum(["UYU", "USD"]),
  fecha: z.string().min(1),
  descripcion: z.string().min(1).max(500),
  nombre: z.string().max(200).nullable().optional(),
  referencia: z.string().max(100).nullable().optional(),
  notas: z.string().nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireRole(ROLES);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = await createServerClient();
  const { searchParams } = new URL(request.url);
  const cuentaId = searchParams.get("cuenta_id");
  const tipo = searchParams.get("tipo");
  const categoriaId = searchParams.get("categoria_id");
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  const search = searchParams.get("search") ?? "";
  const sinClasificar = searchParams.get("sin_clasificar") === "1";
  const sinExtracto = searchParams.get("sin_extracto") === "1";
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);
  const offset = (page - 1) * limit;

  let query = supabase
    .from("movimientos_financieros")
    .select(
      `
      *,
      cuentas_financieras(id, nombre, tipo, moneda, color, banco),
      categorias_financieras!movimientos_financieros_categoria_id_fkey(id, nombre, slug, color, icono, tipo)
    `,
      { count: "exact" }
    )
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  if (cuentaId) query = query.eq("cuenta_id", Number(cuentaId));
  if (tipo) query = query.eq("tipo", tipo as "ingreso" | "egreso");
  if (categoriaId) query = query.eq("categoria_id", Number(categoriaId));
  if (desde) query = query.gte("fecha", desde);
  if (hasta) query = query.lte("fecha", hasta);
  if (sinClasificar) query = query.eq("clasificado", false);
  if (sinExtracto) query = query.is("extracto_id", null);
  if (search) {
    query = query.or(
      `descripcion.ilike.%${search}%,nombre.ilike.%${search}%,referencia.ilike.%${search}%`
    );
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    movimientos: data ?? [],
    total: count ?? 0,
    page,
    limit,
  });
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(ROLES);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = movimientoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createServerClient();
  const user = await getCurrentUser();

  const { data, error } = await supabase
    .from("movimientos_financieros")
    .insert({
      ...parsed.data,
      clasificado: !!parsed.data.categoria_id,
      registrado_por: user?.id ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ movimiento: data });
}
