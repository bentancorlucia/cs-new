import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createComercialClient } from "@/lib/comercial/server";
import { permisosStock } from "@/app/(dashboard)/admin/stock/_lib/extra";
import { respuestaError } from "../_respuesta";

const filaSchema = z.object({
  producto_id: z.number().int().positive(),
  variante_id: z.number().int().positive().nullable().optional(),
  cantidad: z.number().int("Las cantidades son enteras").positive("Las cantidades tienen que ser mayores que 0"),
  costo_unitario: z.number().min(0, "El costo no puede ser negativo"),
});

const schema = z.object({
  items: z
    .array(filaSchema)
    .min(1, "No hay ítems para cargar")
    .max(2000, "Máximo 2000 ítems por carga")
    .refine(
      (xs) => new Set(xs.map((x) => `${x.producto_id}:${x.variante_id ?? 0}`)).size === xs.length,
      "Hay ítems repetidos en la carga"
    ),
});

/**
 * POST /api/admin/stock/inventario-inicial — existencia de arranque con su
 * costo, una vez por ítem (sin movimientos); solo tesorero o super_admin.
 * Después las diferencias se registran con un recuento. No genera asiento: el valor va en
 * la apertura contable. Todo o nada (una sola transacción en la base).
 */
export async function POST(request: NextRequest) {
  try {
    if (!(await permisosStock()).puedeInventario) {
      return NextResponse.json({ error: "El inventario inicial lo carga el tesorero" }, { status: 403 });
    }
    const { items } = schema.parse(await request.json());
    const com = await createComercialClient();

    const { data, error } = await com.rpc("cargar_inventario_inicial", {
      p_items: items.map((i) => ({
        producto_id: i.producto_id,
        variante_id: i.variante_id ?? null,
        cantidad: i.cantidad,
        costo_unitario: i.costo_unitario,
      })),
    });
    if (error) throw error;

    return NextResponse.json({ cargados: data });
  } catch (error) {
    return respuestaError(error, "Error al cargar el inventario inicial");
  }
}
