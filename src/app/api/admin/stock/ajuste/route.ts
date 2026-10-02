import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createComercialClient, exigirOperador } from "@/lib/comercial/server";
import { respuestaError } from "../_respuesta";

const ajusteSchema = z.object({
  producto_id: z.number().int().positive(),
  variante_id: z.number().int().positive().nullable().optional(),
  cantidad: z
    .number()
    .int("La cantidad es un número entero")
    .refine((n) => n !== 0, "La cantidad no puede ser 0"),
  motivo: z.string().trim().min(3, "Indicá el motivo del ajuste (mínimo 3 letras)").max(300),
  costo_unitario: z.number().min(0, "El costo no puede ser negativo").nullable().optional(),
});

/**
 * POST /api/admin/stock/ajuste — sobrante (+) o merma (−) por el motor de
 * stock: genera el movimiento valorizado y el asiento contra "Ajustes y
 * mermas" en la misma transacción. El costo solo aplica a sobrantes.
 */
export async function POST(request: NextRequest) {
  try {
    await exigirOperador();
    const body = ajusteSchema.parse(await request.json());
    const com = await createComercialClient();

    const { data, error } = await com.rpc("ajustar_stock", {
      p_producto: body.producto_id,
      // La función acepta null (producto sin variantes); el tipo generado no lo refleja.
      p_variante: (body.variante_id ?? null) as unknown as number,
      p_cantidad: body.cantidad,
      p_motivo: body.motivo,
      ...(body.cantidad > 0 && body.costo_unitario != null ? { p_costo_unitario: body.costo_unitario } : {}),
    });
    if (error) throw error;

    return NextResponse.json({ movimiento_id: data });
  } catch (error) {
    return respuestaError(error, "Error al ajustar el stock");
  }
}
