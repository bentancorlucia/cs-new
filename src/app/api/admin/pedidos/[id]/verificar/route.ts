import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverEmailPedido } from "@/lib/tienda/email-pedido";
import { sendOrderCancelled, sendOrderConfirmation } from "@/lib/email";
import { mensajeError } from "@/lib/contabilidad/formato";
import { ErrorHttp, exigir, idNumerico, respuestaError } from "@/lib/comercial/pedidos";

const verificarSchema = z.object({
  accion: z.enum(["aprobar", "rechazar"]),
  motivo: z.string().trim().max(500).optional(),
});

interface ResultadoReserva {
  ok?: boolean;
  error?: string;
  faltantes?: { nombre: string; disponible: number; solicitado: number }[];
}

const uno = <T,>(v: T | T[] | null | undefined): T | null =>
  v == null ? null : Array.isArray(v) ? v[0] ?? null : v;

// POST /api/admin/pedidos/[id]/verificar — aprobar o rechazar la transferencia
//
// Aprobar: confirmar_reserva_pedido saca la mercadería por el motor de
// costos y genera el asiento de la venta (Banco tienda / Ventas · Señas ·
// Donaciones + costo) en la misma transacción.
// Rechazar: cancelar_pedido libera la reserva y revierte el efectivo de un
// pago mixto.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const permisos = await exigir((p) => p.puedeOperar);
    const pedidoId = idNumerico((await params).id);
    const db = createAdminClient();
    const { accion, motivo } = verificarSchema.parse(await request.json());

    const { data: pedido } = await db
      .from("pedidos")
      .select("id, estado, perfil_id, email_cliente, total, numero_pedido, nombre_cliente")
      .eq("id", pedidoId)
      .maybeSingle();
    if (!pedido) throw new ErrorHttp(404, "Pedido no encontrado");
    if (pedido.estado !== "pendiente_verificacion") {
      throw new ErrorHttp(400, "Este pedido no está pendiente de verificación");
    }
    const numero = pedido.numero_pedido ?? String(pedido.id);

    if (accion === "aprobar") {
      const { data: items } = await db
        .from("pedido_items")
        .select("es_encargue")
        .eq("pedido_id", pedidoId);
      const nuevoEstado = (items ?? []).some((i) => i.es_encargue) ? "encargado" : "preparando";

      // La RPC bloquea el pedido: una segunda aprobación simultánea recibe
      // "estado_invalido" y no duplica stock ni asiento.
      const { data: conf, error: confError } = await db.rpc("confirmar_reserva_pedido", {
        p_pedido_id: pedidoId,
        p_estado_nuevo: nuevoEstado,
        p_registrado_por: permisos.userId ?? undefined,
      });
      if (confError) throw new ErrorHttp(400, mensajeError(confError));

      const r = conf as ResultadoReserva | null;
      if (r?.ok === false) {
        if (r.error === "stock") {
          const primero = r.faltantes?.[0];
          throw new ErrorHttp(
            400,
            primero
              ? `Stock insuficiente para "${primero.nombre}". Disponible: ${primero.disponible}, necesario: ${primero.solicitado}`
              : "Stock insuficiente"
          );
        }
        throw new ErrorHttp(409, "Este pedido ya no está pendiente de verificación");
      }

      await db
        .from("comprobantes")
        .update({
          estado: "verificado",
          verificado_por: permisos.userId,
          verificado_at: new Date().toISOString(),
        })
        .eq("pedido_id", pedidoId);

      // La donación ya quedó en el asiento (Donaciones a transferir): se
      // marca cobrada para que aparezca en "pendientes de transferir".
      const { error: donError } = await db
        .from("donaciones")
        .update({ estado: "cobrada", cobrada_at: new Date().toISOString() })
        .eq("pedido_id", pedidoId)
        .eq("estado", "pendiente_pago");
      if (donError) console.error("Error al marcar la donación cobrada:", donError);

      try {
        const { email, tieneCuenta } = await resolverEmailPedido(db, pedido);
        if (email) {
          const [{ data: perfil }, { data: itemsMail }] = await Promise.all([
            pedido.perfil_id
              ? db.from("perfiles").select("nombre, apellido").eq("id", pedido.perfil_id).maybeSingle()
              : Promise.resolve({ data: null }),
            db
              .from("pedido_items")
              .select("cantidad, precio_unitario, precio_extra_personalizacion, productos(nombre), producto_variantes(nombre)")
              .eq("pedido_id", pedidoId),
          ]);
          const APP_URL =
            process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://clubseminario.com.uy";
          await sendOrderConfirmation(email, {
            nombreCliente: perfil ? `${perfil.nombre} ${perfil.apellido}` : pedido.nombre_cliente || "",
            numeroPedido: numero,
            items: (itemsMail ?? []).map((i) => {
              const prod = uno(i.productos);
              const v = uno(i.producto_variantes);
              return {
                nombre: v?.nombre ? `${prod?.nombre ?? ""} - ${v.nombre}` : prod?.nombre ?? "",
                cantidad: i.cantidad,
                precioUnitario: Number(i.precio_unitario) + Number(i.precio_extra_personalizacion || 0),
              };
            }),
            total: Number(pedido.total),
            pedidoUrl: tieneCuenta ? `${APP_URL}/tienda/pedido/${pedidoId}` : undefined,
          });
        }
      } catch (emailError) {
        console.error("Error al enviar email de confirmación:", emailError);
      }

      return NextResponse.json({ success: true, estado: nuevoEstado });
    }

    // RECHAZAR
    const { data: canc, error: cancError } = await db.rpc("cancelar_pedido", {
      p_pedido_id: pedidoId,
      p_motivo: motivo || "Transferencia rechazada",
      p_registrado_por: permisos.userId ?? undefined,
    });
    if (cancError) throw new ErrorHttp(400, mensajeError(cancError));
    if ((canc as ResultadoReserva | null)?.ok === false) {
      throw new ErrorHttp(400, "No se pudo rechazar el pedido");
    }

    await db
      .from("comprobantes")
      .update({
        estado: "rechazado",
        verificado_por: permisos.userId,
        verificado_at: new Date().toISOString(),
        motivo_rechazo: motivo || null,
      })
      .eq("pedido_id", pedidoId);

    try {
      const { email } = await resolverEmailPedido(db, pedido);
      if (email) {
        await sendOrderCancelled(email, {
          nombreCliente: pedido.nombre_cliente || "",
          numeroPedido: numero,
          motivo: motivo || "La transferencia no pudo ser verificada.",
        });
      }
    } catch (emailError) {
      console.error("Error al enviar email de cancelación:", emailError);
    }

    return NextResponse.json({ success: true, estado: "cancelado" });
  } catch (error) {
    return respuestaError(error);
  }
}
