import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { exigirOperador } from "@/lib/comercial/server";
import { comercialSinTipos } from "@/app/(dashboard)/admin/stock/_lib/extra";
import { respuestaError } from "../_respuesta";

const schema = z.object({
  id: z.number().int().positive().nullable(),
  notas: z.string().trim().max(1000).nullable().optional(),
  conteos: z
    .array(
      z.object({
        producto_id: z.number().int().positive(),
        variante_id: z.number().int().positive().nullable().optional(),
        contado: z.number().int("Lo contado es un número entero").min(0, "Lo contado no puede ser negativo"),
      })
    )
    .max(3000),
});

/**
 * POST /api/admin/stock/recuentos — crea o guarda un recuento en borrador
 * (se puede ir guardando de a partes; lo ya contado se reemplaza).
 */
export async function POST(request: NextRequest) {
  try {
    await exigirOperador();
    const b = schema.parse(await request.json());
    const com = await comercialSinTipos();
    const { data, error } = await com.rpc("guardar_recuento", {
      p_id: b.id,
      p_conteos: b.conteos.map((c) => ({ producto_id: c.producto_id, variante_id: c.variante_id ?? null, contado: c.contado })),
      p_notas: b.notas ?? null,
    });
    if (error) throw error;
    return NextResponse.json({ id: data as number });
  } catch (error) {
    return respuestaError(error, "Error al guardar el recuento");
  }
}
