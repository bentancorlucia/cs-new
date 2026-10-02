import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createComercialClient, exigirOperador } from "@/lib/comercial/server";
import { TIPOS_BAJA } from "@/lib/comercial/stock";
import { respuestaError } from "../_respuesta";

const schema = z.object({
  tipo: z.enum(TIPOS_BAJA, { message: "Elegí el tipo de baja" }),
  descripcion: z.string().trim().min(5, "Describí la baja (mínimo 5 caracteres)").max(500),
  centro_costo_id: z.string().uuid().nullable().optional(),
  items: z
    .array(
      z.object({
        producto_id: z.number().int().positive(),
        variante_id: z.number().int().positive().nullable().optional(),
        cantidad: z.number().int("Las cantidades son enteras").positive("Las cantidades tienen que ser mayores que 0"),
      })
    )
    .min(1, "Agregá al menos un producto")
    .max(200)
    .refine(
      (xs) => new Set(xs.map((x) => `${x.producto_id}:${x.variante_id ?? 0}`)).size === xs.length,
      "Hay productos repetidos en la baja"
    ),
});

/**
 * POST /api/admin/stock/bajas — baja tipificada de mercadería: documento,
 * salida valorizada en el kardex y asiento (Ajustes y mermas / Mercadería)
 * en la misma transacción.
 */
export async function POST(request: NextRequest) {
  try {
    await exigirOperador();
    const b = schema.parse(await request.json());
    const com = await createComercialClient();
    const { data, error } = await com.rpc("registrar_baja", {
      p_tipo: b.tipo,
      p_descripcion: b.descripcion,
      p_items: b.items.map((i) => ({ producto_id: i.producto_id, variante_id: i.variante_id ?? null, cantidad: i.cantidad })),
      p_centro_costo: b.centro_costo_id ?? undefined,
    });
    if (error) throw error;
    return NextResponse.json({ id: data as number });
  } catch (error) {
    return respuestaError(error, "Error al registrar la baja");
  }
}
