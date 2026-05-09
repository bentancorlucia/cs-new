import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { z } from "zod";

const TIENDA_ROLES = ["super_admin", "tienda"];

const transferenciaSchema = z.object({
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),
  comprobante_url: z.string().url().optional().nullable(),
  notas: z.string().trim().max(2000).optional().nullable(),
});

// POST /api/admin/donaciones/transferencias — registrar nueva transferencia mensual
export async function POST(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const user = await getCurrentUser();
    const db = createAdminClient() as any;

    const body = await request.json();
    const parsed = transferenciaSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { fecha, comprobante_url, notas } = parsed.data;

    const { data, error } = await db.rpc("registrar_transferencia_donaciones", {
      p_fecha: fecha,
      p_comprobante_url: comprobante_url ?? null,
      p_notas: notas ?? null,
      p_creado_por: user?.id ?? null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const row = Array.isArray(data) ? data[0] : data;

    return NextResponse.json({
      success: true,
      transferencia_id: row?.transferencia_id,
      monto_total: Number(row?.monto_total ?? 0),
      cantidad: row?.cantidad ?? 0,
    });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
