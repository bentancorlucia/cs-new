import { after } from "next/server";
import { createComunicacionesAdminClient } from "../comunicaciones/server";
import { procesarCola } from "../comunicaciones/worker";
import {
  orderConfirmationHtml,
  orderReadyHtml,
  orderCancelledHtml,
  orderPendingVerificationHtml,
  ticketConfirmationHtml,
  notificationHtml,
  type OrderConfirmationData,
  type OrderReadyData,
  type OrderCancelledData,
  type OrderPendingVerificationData,
  type TicketConfirmationData,
  type NotificationData,
} from "./templates";

// ============================================
// Mails transaccionales
//
// No se mandan acá: se encolan en comunicaciones.mensajes (historial,
// reintentos, sin duplicados por dedupe_key) y salen por el SMTP del club.
// Después de responder, se procesa la cola para que no esperen al cron.
// ============================================

type Encolado = {
  to: string;
  nombre?: string | null;
  asunto: string;
  html: string;
  dedupe: string | null;
  refTipo?: string;
  refId?: string;
  variables?: Record<string, unknown>;
};

async function encolar(m: Encolado) {
  try {
    const db = createComunicacionesAdminClient();
    const { error } = await db.rpc("encolar_transaccional", {
      p_email: m.to,
      p_nombre: m.nombre ?? "",
      p_asunto: m.asunto,
      p_html: m.html,
      p_dedupe_key: m.dedupe ?? "",
      p_ref_tipo: m.refTipo,
      p_ref_id: m.refId,
      p_variables: (m.variables ?? {}) as never,
    });
    if (error) throw new Error(error.message);
    try {
      after(() => procesarCola({ presupuestoMs: 20_000 }).catch((e) => console.error("[Email] cola:", e)));
    } catch {
      // Fuera de un request (scripts): lo manda el cron.
    }
  } catch (error) {
    console.error(`[Email] No se pudo encolar "${m.asunto}":`, error);
  }
}

export async function sendOrderConfirmation(to: string, data: OrderConfirmationData) {
  await encolar({
    to,
    nombre: data.nombreCliente,
    asunto: `Confirmación de compra — Pedido #${data.numeroPedido}`,
    html: orderConfirmationHtml(data),
    dedupe: `pedido:${data.numeroPedido}:confirmacion`,
    refTipo: "pedido",
    refId: String(data.numeroPedido),
  });
}

export async function sendOrderReady(to: string, data: OrderReadyData) {
  await encolar({
    to,
    nombre: data.nombreCliente,
    asunto: `Tu pedido #${data.numeroPedido} está listo para retirar`,
    html: orderReadyHtml(data),
    dedupe: `pedido:${data.numeroPedido}:listo`,
    refTipo: "pedido",
    refId: String(data.numeroPedido),
  });
}

export async function sendOrderPendingVerification(to: string, data: OrderPendingVerificationData) {
  await encolar({
    to,
    nombre: data.nombreCliente,
    asunto: `Pedido #${data.numeroPedido} — Verificación de transferencia pendiente`,
    html: orderPendingVerificationHtml(data),
    dedupe: `pedido:${data.numeroPedido}:verificacion`,
    refTipo: "pedido",
    refId: String(data.numeroPedido),
  });
}

export async function sendOrderCancelled(to: string, data: OrderCancelledData) {
  await encolar({
    to,
    nombre: data.nombreCliente,
    asunto: `Tu pedido #${data.numeroPedido} fue cancelado`,
    html: orderCancelledHtml(data),
    dedupe: `pedido:${data.numeroPedido}:cancelado`,
    refTipo: "pedido",
    refId: String(data.numeroPedido),
  });
}

export async function sendTicketConfirmation(
  to: string,
  data: TicketConfirmationData & {
    eventoFecha?: string;
    eventoLugar?: string;
  }
) {
  // El PDF con los QR se genera al enviar (no se guarda en la base).
  await encolar({
    to,
    nombre: data.nombreAsistente,
    asunto: `Tus entradas para ${data.eventoTitulo}`,
    html: ticketConfirmationHtml(data),
    dedupe: data.codigos.length ? `entradas:${data.codigos[0]}:${data.codigos.length}` : null,
    refTipo: "entradas",
    refId: data.codigos[0],
    variables: {
      adjunto: {
        tipo: "entradas_pdf",
        datos: {
          nombreAsistente: data.nombreAsistente,
          eventoTitulo: data.eventoTitulo,
          tipoEntrada: data.tipoEntrada,
          codigos: data.codigos,
          eventoFecha: data.eventoFecha,
          eventoLugar: data.eventoLugar,
        },
      },
    },
  });
}

export async function sendNotification(to: string, data: NotificationData) {
  await encolar({
    to,
    asunto: data.titulo,
    html: notificationHtml(data),
    dedupe: null,
  });
}
