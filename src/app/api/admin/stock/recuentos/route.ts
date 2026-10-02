import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createComercialClient, exigirOperador } from "@/lib/comercial/server";
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
        // Para valuar un sobrante de un ítem sin costo conocido
        costo_unitario: z.number().min(0, "El costo no puede ser negativo").nullable().optional(),
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
    const com = await createComercialClient();
    const { data, error } = await com.rpc("guardar_recuento", {
      // La función acepta null (recuento nuevo); el tipo generado no lo refleja.
      p_id: b.id as number,
      p_conteos: b.conteos.map((c) => ({
        producto_id: c.producto_id,
        variante_id: c.variante_id ?? null,
        contado: c.contado,
        ...(c.costo_unitario != null ? { costo_unitario: c.costo_unitario } : {}),
      })),
      p_notas: b.notas ?? undefined,
    });
    if (error) throw error;
    return NextResponse.json({ id: data as number });
  } catch (error) {
    return respuestaError(error, "Error al guardar el recuento");
  }
}
