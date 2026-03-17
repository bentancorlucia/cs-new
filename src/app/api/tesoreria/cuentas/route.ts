import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import { z } from "zod";

const TESORERIA_ROLES = ["super_admin", "tesorero"];

const cuentaSchema = z.object({
  nombre: z.string().min(1, "Nombre requerido").max(200),
  tipo: z.enum(["bancaria", "mercadopago", "caja_chica", "virtual"]),
  moneda: z.enum(["UYU", "USD"]),
  banco: z.string().max(100).optional().nullable(),
  numero_cuenta: z.string().max(50).optional().nullable(),
  saldo_inicial: z.number().default(0),
  descripcion: z.string().optional().nullable(),
  color: z.string().max(7).optional().nullable(),
  activa: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
  try {
    await requireRole(TESORERIA_ROLES);
    const supabase = await createServerClient();

    const { searchParams } = new URL(request.url);
    const activas = searchParams.get("activas");

    let query = supabase
      .from("cuentas_financieras")
      .select("*")
      .order("created_at", { ascending: true });

    if (activas === "true") {
      query = query.eq("activa", true);
    }

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
    const parsed = cuentaSchema.parse(body);

    const { data, error } = await supabase
      .from("cuentas_financieras")
      .insert({
        ...parsed,
        saldo_actual: parsed.saldo_inicial,
      } as any)
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
      .from("cuentas_financieras")
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
