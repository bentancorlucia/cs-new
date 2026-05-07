import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";

const ROLES = ["super_admin", "tesorero"];

const patchSchema = z.object({
  nombre: z.string().max(200).nullable().optional(),
  notas: z.string().nullable().optional(),
  categoria_id: z.number().positive().nullable().optional(),
  subcategoria_id: z.number().positive().nullable().optional(),
  tipo: z.enum(["ingreso", "egreso"]).optional(),
  descripcion: z.string().min(1).max(500).optional(),
  fecha: z.string().min(1).optional(),
  monto: z.number().positive().optional(),
  clasificado: z.boolean().optional(),
});

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
  const update: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.categoria_id !== undefined && update.clasificado === undefined) {
    update.clasificado = parsed.data.categoria_id !== null;
  }

  const { data, error } = await supabase
    .from("movimientos_financieros")
    .update(update)
    .eq("id", Number(id))
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ movimiento: data });
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
  const { error } = await supabase
    .from("movimientos_financieros")
    .delete()
    .eq("id", Number(id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
