import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { z } from "zod";

const SOCIOS_ROLES = ["super_admin", "secretaria"];

const pagoSocioSchema = z.object({
  monto: z.number().positive("El monto debe ser positivo"),
  periodo_mes: z.number().min(1).max(12),
  periodo_anio: z.number().min(2020),
  metodo_pago: z.enum(["efectivo", "mercadopago", "transferencia"]),
  referencia_pago: z.string().optional(),
  notas: z.string().optional(),
});

// POST /api/socios/[id]/pagos — registrar pago de cuota
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(SOCIOS_ROLES);
    const currentUser = await getCurrentUser();
    const supabase = createAdminClient();
    const { id } = await params;

    const body = await request.json();
    const parsed = pagoSocioSchema.parse(body);

    const insertPayload = {
      perfil_id: id,
      monto: parsed.monto,
      periodo_mes: parsed.periodo_mes,
      periodo_anio: parsed.periodo_anio,
      metodo_pago: parsed.metodo_pago,
      referencia_pago: parsed.referencia_pago || null,
      notas: parsed.notas || null,
      registrado_por: currentUser?.id || null,
    };
    const { data, error } = await supabase
      .from("pagos_socios")
      .insert(insertPayload as never)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Ya existe un pago registrado para ese período" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ pago: data }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: err.issues },
        { status: 400 }
      );
    }
    if (err instanceof Error && err.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
