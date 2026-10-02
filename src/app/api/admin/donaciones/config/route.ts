import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { mensajeError } from "@/lib/contabilidad/formato";
import { ErrorHttp, exigir, respuestaError } from "@/lib/comercial/pedidos";

const configSchema = z
  .object({
    activo: z.boolean(),
    monto_1: z.number().positive("Los montos tienen que ser mayores a 0").max(1_000_000),
    monto_2: z.number().positive("Los montos tienen que ser mayores a 0").max(1_000_000),
    monto_3: z.number().positive("Los montos tienen que ser mayores a 0").max(1_000_000),
    permitir_monto_custom: z.boolean(),
    monto_custom_max: z.number().positive("El tope tiene que ser mayor a 0").max(10_000_000),
    titulo: z.string().trim().min(1, "Falta el título").max(120),
    descripcion: z.string().trim().min(1, "Falta la descripción").max(2000),
  });

// PUT /api/admin/donaciones/config — configuración de la donación en el checkout
export async function PUT(request: NextRequest) {
  try {
    const permisos = await exigir((p) => p.puedeOperar);
    const parsed = configSchema.parse(await request.json());
    const db = createAdminClient();

    const { error } = await db
      .from("donaciones_config")
      .update({ ...parsed, updated_at: new Date().toISOString(), updated_by: permisos.userId })
      .eq("id", 1);
    if (error) throw new ErrorHttp(400, mensajeError(error));

    return NextResponse.json({ success: true });
  } catch (error) {
    return respuestaError(error);
  }
}
