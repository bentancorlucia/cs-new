import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";

const ROLES = ["super_admin", "tesorero"];

const cuentaSchema = z.object({
  nombre: z.string().min(1).max(200),
  tipo: z.enum(["bancaria", "mercadopago", "caja_chica", "virtual"]),
  moneda: z.enum(["UYU", "USD"]),
  banco: z.string().max(100).optional().nullable(),
  numero_cuenta: z.string().max(50).optional().nullable(),
  titular: z.string().max(200).optional().nullable(),
  saldo_inicial: z.number().default(0),
  descripcion: z.string().optional().nullable(),
  color: z.string().max(7).optional().nullable(),
  modulo: z.string().optional().nullable(),
  incluir_en_tesoreria: z.boolean().default(true),
});

export async function GET() {
  try {
    await requireRole(ROLES);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("cuentas_financieras")
    .select("*")
    .order("tipo", { ascending: true })
    .order("nombre", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ cuentas: data });
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(ROLES);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = cuentaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("cuentas_financieras")
    .insert({
      ...parsed.data,
      saldo_actual: parsed.data.saldo_inicial,
      activa: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ cuenta: data });
}
