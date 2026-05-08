import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";

const ROLES = ["super_admin", "tesorero"];

const bulkSchema = z.object({
  ids: z.array(z.number().positive()).min(1).max(500),
  patch: z
    .object({
      categoria_id: z.number().positive().nullable().optional(),
      tipo: z.enum(["ingreso", "egreso"]).optional(),
      clasificado: z.boolean().optional(),
    })
    .refine((p) => Object.keys(p).length > 0, {
      message: "Patch vacío",
    }),
});

export async function PATCH(req: NextRequest) {
  try {
    await requireRole(ROLES);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { ids, patch } = parsed.data;
  const update: Record<string, unknown> = { ...patch };
  if (patch.categoria_id !== undefined && update.clasificado === undefined) {
    update.clasificado = patch.categoria_id !== null;
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("movimientos_financieros")
    .update(update)
    .in("id", ids)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated: data?.length ?? 0 });
}
