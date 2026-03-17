import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import { z } from "zod";

const TESORERIA_ROLES = ["super_admin", "tesorero"];

const categoriaSchema = z.object({
  nombre: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  tipo: z.enum(["ingreso", "egreso"]),
  padre_id: z.number().positive().optional().nullable(),
  color: z.string().max(7).optional().nullable(),
  icono: z.string().max(50).optional().nullable(),
  presupuesto_mensual: z.number().optional().nullable(),
  orden: z.number().int().default(0),
  activa: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
  try {
    await requireRole(TESORERIA_ROLES);
    const supabase = await createServerClient();

    const { searchParams } = new URL(request.url);
    const tipo = searchParams.get("tipo");
    const activas = searchParams.get("activas");

    let query = supabase
      .from("categorias_financieras")
      .select("*")
      .order("orden", { ascending: true })
      .order("nombre", { ascending: true });

    if (tipo) query = query.eq("tipo", tipo as "ingreso" | "egreso");
    if (activas === "true") query = query.eq("activa", true);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data });
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
    const body = await request.json();
    const parsed = categoriaSchema.parse(body);

    const { data, error } = await supabase
      .from("categorias_financieras")
      .insert(parsed as any)
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

export async function PUT(request: NextRequest) {
  try {
    await requireRole(TESORERIA_ROLES);
    const supabase = await createServerClient();
    const body = await request.json();
    const { id, ...rest } = body;

    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("categorias_financieras")
      .update(rest)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
