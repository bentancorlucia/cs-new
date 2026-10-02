import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createComercialClient, exigirOperador } from "@/lib/comercial/server";
import { respuestaError } from "../../../stock/_respuesta";

const schema = z.object({
  metodo: z.enum(["promedio", "fifo"], { message: "Método de costeo inválido" }),
});

/**
 * PUT /api/admin/productos/[id]/costeo — método de costeo del producto
 * (todas sus variantes). La base lo rechaza si hay stock.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await exigirOperador();
    const { id } = await params;
    const productoId = Number(id);
    if (!Number.isInteger(productoId) || productoId <= 0) {
      return NextResponse.json({ error: "Producto inválido" }, { status: 400 });
    }
    const { metodo } = schema.parse(await request.json());
    const com = await createComercialClient();
    const { error } = await com.rpc("cambiar_metodo_costeo", { p_producto: productoId, p_metodo: metodo });
    if (error) throw error;
    return NextResponse.json({ metodo });
  } catch (error) {
    return respuestaError(error, "Error al cambiar el método de costeo");
  }
}
