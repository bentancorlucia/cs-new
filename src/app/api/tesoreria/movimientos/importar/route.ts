import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { z } from "zod";

const TESORERIA_ROLES = ["super_admin", "tesorero"];

const movimientoImportSchema = z.object({
  cuenta_id: z.number().positive(),
  tipo: z.enum(["ingreso", "egreso"]),
  categoria_id: z.number().positive(),
  monto: z.number().positive(),
  moneda: z.enum(["UYU", "USD"]).default("UYU"),
  fecha: z.string().min(1),
  descripcion: z.string().min(1).max(500),
  referencia: z.string().max(100).optional().nullable(),
});

const importarSchema = z.object({
  movimientos: z.array(movimientoImportSchema).min(1).max(500),
});

export async function POST(request: NextRequest) {
  try {
    await requireRole(TESORERIA_ROLES);
    const supabase = await createServerClient();
    const user = await getCurrentUser();
    const body = await request.json();
    const { movimientos } = importarSchema.parse(body);

    const rows = movimientos.map((m) => ({
      ...m,
      origen_tipo: "manual" as const,
      registrado_por: user?.id ?? null,
    }));

    const { data, error } = await supabase
      .from("movimientos_financieros")
      .insert(rows as any)
      .select("id");

    if (error) throw error;

    return NextResponse.json(
      { importados: data?.length ?? 0 },
      { status: 201 }
    );
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos invalidos", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
