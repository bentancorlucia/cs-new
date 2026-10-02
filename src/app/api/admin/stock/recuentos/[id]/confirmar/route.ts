import { NextRequest, NextResponse } from "next/server";
import { createComercialClient, exigirOperador } from "@/lib/comercial/server";
import { respuestaError } from "../../../_respuesta";

/**
 * POST /api/admin/stock/recuentos/[id]/confirmar — compara lo contado con
 * el stock de este momento y registra faltantes y sobrantes (kardex y un
 * asiento). Devuelve { faltante, sobrante, asiento_id }.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await exigirOperador();
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Recuento inválido" }, { status: 400 });
    const com = await createComercialClient();
    const { data, error } = await com.rpc("confirmar_recuento", { p_id: id });
    if (error) throw error;
    return NextResponse.json(data as { faltante: number; sobrante: number; asiento_id: string | null });
  } catch (error) {
    return respuestaError(error, "Error al confirmar el recuento");
  }
}
