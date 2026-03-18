import { resend, EMAIL_FROM } from "./resend";
import { generarQREntrada } from "../qr/generate";
import {
  orderConfirmationHtml,
  orderReadyHtml,
  orderCancelledHtml,
  ticketConfirmationHtml,
  notificationHtml,
  type OrderConfirmationData,
  type OrderReadyData,
  type OrderCancelledData,
  type TicketConfirmationData,
  type NotificationData,
} from "./templates";

// ============================================
// Email sending functions
// ============================================

export async function sendOrderConfirmation(
  to: string,
  data: OrderConfirmationData
) {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: `Confirmación de compra — Pedido #${data.numeroPedido}`,
      html: orderConfirmationHtml(data),
    });
  } catch (error) {
    console.error("[Email] Error sending order confirmation:", error);
  }
}

export async function sendOrderReady(to: string, data: OrderReadyData) {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: `Tu pedido #${data.numeroPedido} está listo para retirar`,
      html: orderReadyHtml(data),
    });
  } catch (error) {
    console.error("[Email] Error sending order ready:", error);
  }
}

export async function sendOrderCancelled(to: string, data: OrderCancelledData) {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: `Tu pedido #${data.numeroPedido} fue cancelado`,
      html: orderCancelledHtml(data),
    });
  } catch (error) {
    console.error("[Email] Error sending order cancelled:", error);
  }
}

export async function sendTicketConfirmation(
  to: string,
  data: TicketConfirmationData
) {
  try {
    // Generar QR codes como data URLs para embeber en el email
    const qrDataUrls = await Promise.all(
      data.codigos.map((codigo) => generarQREntrada(codigo))
    );

    await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: `Tus entradas para ${data.eventoTitulo}`,
      html: ticketConfirmationHtml({ ...data, qrDataUrls }),
    });
  } catch (error) {
    console.error("[Email] Error sending ticket confirmation:", error);
  }
}

export async function sendNotification(to: string, data: NotificationData) {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: data.titulo,
      html: notificationHtml(data),
    });
  } catch (error) {
    console.error("[Email] Error sending notification:", error);
  }
}
