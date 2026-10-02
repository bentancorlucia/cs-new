import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createComercialClient, exigirOperador } from "@/lib/comercial/server";
import { respuestaError } from "../../../_respuesta";

const schema = z.object({
  producto_id: z.number().int().positive(),
  variante_id: z.number().int().positive().nullable().optional(),
});

/** POST /api/admin/stock/recuentos/[id]/quitar — saca un producto ya guardado de un recuento en borrador. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await exigirOperador();
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Recuento inválido" }, { status: 400 });
    const b = schema.parse(await request.json());
    const com = await createComercialClient();
    const { error } = await com.rpc("quitar_de_recuento", {
      p_id: id,
      p_producto: b.producto_id,
      ...(b.variante_id ? { p_variante: b.variante_id } : {}),
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respuestaError(error, "Error al quitar el producto del recuento");
  }
}
