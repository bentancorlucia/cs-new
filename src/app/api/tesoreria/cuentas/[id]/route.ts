import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";

const ROLES = ["super_admin", "tesorero"];

const patchSchema = z.object({
  nombre: z.string().min(1).max(200).optional(),
  banco: z.string().max(100).nullable().optional(),
  numero_cuenta: z.string().max(50).nullable().optional(),
  titular: z.string().max(200).nullable().optional(),
  descripcion: z.string().nullable().optional(),
  color: z.string().max(7).nullable().optional(),
  saldo_inicial: z.number().optional(),
  incluir_en_tesoreria: z.boolean().optional(),
  activa: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(ROLES);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { id } = await context.params;
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("cuentas_financieras")
    .select("*")
    .eq("id", Number(id))
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ cuenta: data });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(ROLES);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { id } = await context.params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const supabase = await createServerClient();

  const updates: Record<string, unknown> = { ...parsed.data };

  if (parsed.data.saldo_inicial !== undefined) {
    const { data: actual, error: errActual } = await supabase
      .from("cuentas_financieras")
      .select("saldo_inicial, saldo_actual")
      .eq("id", Number(id))
      .single();
    if (errActual || !actual) {
      return NextResponse.json({ error: errActual?.message ?? "Cuenta no encontrada" }, { status: 404 });
    }
    const delta = parsed.data.saldo_inicial - Number(actual.saldo_inicial);
    updates.saldo_actual = Number(actual.saldo_actual) + delta;
  }

  const { data, error } = await supabase
    .from("cuentas_financieras")
    .update(updates)
    .eq("id", Number(id))
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cuenta: data });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(ROLES);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { id } = await context.params;
  const supabase = await createServerClient();

  const { count } = await supabase
    .from("movimientos_financieros")
    .select("id", { count: "exact", head: true })
    .eq("cuenta_id", Number(id));

  if ((count ?? 0) > 0) {
    const { error } = await supabase
      .from("cuentas_financieras")
      .update({ activa: false })
      .eq("id", Number(id));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, archivada: true });
  }

  const { error } = await supabase
    .from("cuentas_financieras")
    .delete()
    .eq("id", Number(id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
