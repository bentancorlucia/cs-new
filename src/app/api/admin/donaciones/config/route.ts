import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { z } from "zod";

const TIENDA_ROLES = ["super_admin", "tienda"];

const configSchema = z.object({
  activo: z.boolean(),
  monto_1: z.number().positive().max(1_000_000),
  monto_2: z.number().positive().max(1_000_000),
  monto_3: z.number().positive().max(1_000_000),
  permitir_monto_custom: z.boolean(),
  monto_custom_max: z.number().positive().max(10_000_000),
  titulo: z.string().trim().min(1).max(120),
  descripcion: z.string().trim().min(1).max(2000),
});

// PUT /api/admin/donaciones/config — actualizar configuración
export async function PUT(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const user = await getCurrentUser();
    const db = createAdminClient() as any;

    const body = await request.json();
    const parsed = configSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { error } = await db
      .from("donaciones_config")
      .update({
        ...parsed.data,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      })
      .eq("id", 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
