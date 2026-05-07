import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";

const ROLES = ["super_admin", "tesorero"];

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

  // Borrar los dos movimientos asociados (el trigger ajusta saldos)
  const { data: transf } = await supabase
    .from("transferencias_internas")
    .select("movimiento_egreso_id, movimiento_ingreso_id")
    .eq("id", Number(id))
    .single();

  if (transf) {
    const ids = [transf.movimiento_egreso_id, transf.movimiento_ingreso_id].filter(
      (i): i is number => typeof i === "number"
    );
    if (ids.length > 0) {
      await supabase.from("movimientos_financieros").delete().in("id", ids);
    }
  }

  const { error } = await supabase
    .from("transferencias_internas")
    .delete()
    .eq("id", Number(id));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
