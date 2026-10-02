import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { hoyUruguay, mensajeError } from "@/lib/contabilidad/formato";
import { ErrorHttp, exigir, respuestaError } from "@/lib/comercial/pedidos";

const transferenciaSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  comprobante_url: z.string().trim().url("El comprobante tiene que ser un link (https://...)").optional().nullable(),
  notas: z.string().trim().max(2000).optional().nullable(),
});

// POST /api/admin/donaciones/transferencias — transferencia a la Olla
//
// registrar_transferencia_donaciones marca todas las donaciones cobradas
// como transferidas y asienta D Donaciones a transferir / H Banco tienda,
// en una transacción. Se llama con service role: el usuario va en
// p_creado_por y la función vuelve a validar su rol.
export async function POST(request: NextRequest) {
  try {
    const permisos = await exigir((p) => p.puedeOperarComercial);
    const { fecha, comprobante_url, notas } = transferenciaSchema.parse(await request.json());
    if (fecha > hoyUruguay()) throw new ErrorHttp(400, "La fecha no puede ser futura");

    const db = createAdminClient();
    const { data, error } = await db.rpc("registrar_transferencia_donaciones", {
      p_fecha: fecha,
      p_comprobante_url: comprobante_url || (null as unknown as string),
      p_notas: notas || (null as unknown as string),
      p_creado_por: permisos.userId as string,
    });
    if (error) throw new ErrorHttp(400, mensajeError(error));

    const fila = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({
      success: true,
      transferencia_id: fila?.transferencia_id ?? null,
      monto_total: Number(fila?.monto_total ?? 0),
      cantidad: fila?.cantidad ?? 0,
    });
  } catch (error) {
    return respuestaError(error);
  }
}
