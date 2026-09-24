import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverEmailPedido } from "@/lib/tienda/email-pedido";

// Horas que un pedido online puede quedar sin comprobante antes de liberar
// el stock reservado.
const HORAS_RESERVA = Number(process.env.RESERVA_HORAS ?? 48);

// GET /api/cron/expirar-reservas — Vercel Cron (ver vercel.json)
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const db = createAdminClient() as any;
  const { data, error } = await db.rpc("expirar_reservas_pendientes", {
    p_horas: HORAS_RESERVA,
  });

  if (error) {
    console.error("Error en expirar_reservas_pendientes:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids: number[] = (data ?? []).map((r: any) => r.pedido_id);

  if (ids.length > 0) {
    const { data: pedidos } = await db
      .from("pedidos")
      .select("id, numero_pedido, nombre_cliente, perfil_id, email_cliente")
      .in("id", ids);

    const { sendOrderCancelled } = await import("@/lib/email/send");
    for (const pedido of pedidos ?? []) {
      try {
        const { email } = await resolverEmailPedido(db, pedido);
        if (email) {
          await sendOrderCancelled(email, {
            nombreCliente: pedido.nombre_cliente || "",
            numeroPedido: pedido.numero_pedido,
            motivo: `No recibimos el comprobante de transferencia dentro de las ${HORAS_RESERVA} horas. Si ya transferiste, respondé este mail y lo resolvemos.`,
          });
        }
      } catch (emailError) {
        console.error("Error al avisar vencimiento de pedido:", emailError);
      }
    }
  }

  return NextResponse.json({ expirados: ids });
}
