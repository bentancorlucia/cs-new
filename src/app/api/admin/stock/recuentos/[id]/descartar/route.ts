import { NextRequest, NextResponse } from "next/server";
import { createComercialClient, exigirOperador } from "@/lib/comercial/server";
import { respuestaError } from "../../../_respuesta";

/** POST /api/admin/stock/recuentos/[id]/descartar — descarta un borrador (no toca el stock). */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await exigirOperador();
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Recuento inválido" }, { status: 400 });
    const com = await createComercialClient();
    const { error } = await com.rpc("descartar_recuento", { p_id: id });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respuestaError(error, "Error al descartar el recuento");
  }
}
