import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";

const ROLES = ["super_admin", "tesorero"];

const patchSchema = z.object({
  nombre: z.string().min(1).max(100).optional(),
  color: z.string().max(7).nullable().optional(),
  icono: z.string().max(50).nullable().optional(),
  padre_id: z.number().positive().nullable().optional(),
  orden: z.number().optional(),
  activa: z.boolean().optional(),
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
  const { data, error } = await supabase
    .from("categorias_financieras")
    .update(parsed.data)
    .eq("id", Number(id))
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categoria: data });
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
    .eq("categoria_id", Number(id));

  if ((count ?? 0) > 0) {
    const { error } = await supabase
      .from("categorias_financieras")
      .update({ activa: false })
      .eq("id", Number(id));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, archivada: true });
  }

  const { error } = await supabase
    .from("categorias_financieras")
    .delete()
    .eq("id", Number(id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
