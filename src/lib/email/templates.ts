// ============================================
// Email templates for Club Seminario
// Using inline HTML — no react-email dependency
// ============================================

const COLORS = {
  bordo: "#730d32",
  dorado: "#f7b643",
  fondoClaro: "#faf8f5",
  fondoOscuro: "#1a1a1a",
  texto: "#1f1f1f",
  textoSecundario: "#6b7280",
};

function layout(content: string) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background-color:${COLORS.fondoClaro};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.fondoClaro};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <h1 style="margin:0;font-size:28px;font-weight:700;color:${COLORS.bordo};letter-spacing:-0.02em;">
                Club <span style="color:${COLORS.dorado};">Seminario</span>
              </h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e5e5e5;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding-top:24px;">
              <p style="margin:0;font-size:12px;color:${COLORS.textoSecundario};">
                Club Seminario &mdash; clubseminario.com.uy
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(text: string, href: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
    <tr>
      <td align="center" style="background:linear-gradient(135deg,${COLORS.bordo},#5a0a27);border-radius:8px;">
        <a href="${href}" target="_blank" style="display:inline-block;padding:12px 32px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
          ${text}
        </a>
      </td>
    </tr>
  </table>`;
}

// ============================================
// Order confirmation (after MercadoPago payment)
// ============================================
export interface OrderConfirmationData {
  nombreCliente: string;
  numeroPedido: string;
  items: { nombre: string; cantidad: number; precioUnitario: number }[];
  total: number;
  pedidoUrl: string;
}

export function orderConfirmationHtml(data: OrderConfirmationData) {
  const itemsRows = data.items
    .map(
      (item) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:${COLORS.texto};">
          ${item.nombre} &times; ${item.cantidad}
        </td>
        <td align="right" style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:${COLORS.texto};">
          $${(item.precioUnitario * item.cantidad).toLocaleString("es-UY")}
        </td>
      </tr>`
    )
    .join("");

  return layout(`
    <h2 style="margin:0 0 8px;font-size:20px;color:${COLORS.bordo};">Confirmación de compra</h2>
    <p style="margin:0 0 24px;font-size:14px;color:${COLORS.textoSecundario};">
      ¡Gracias, ${data.nombreCliente}! Tu pedido fue confirmado.
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:${COLORS.texto};">
      <strong>Pedido:</strong> #${data.numeroPedido}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      ${itemsRows}
      <tr>
        <td style="padding:12px 0 0;font-size:16px;font-weight:700;color:${COLORS.bordo};">Total</td>
        <td align="right" style="padding:12px 0 0;font-size:16px;font-weight:700;color:${COLORS.bordo};">
          $${data.total.toLocaleString("es-UY")}
        </td>
      </tr>
    </table>
    ${button("Ver mi pedido", data.pedidoUrl)}
    <p style="margin:24px 0 0;font-size:13px;color:${COLORS.textoSecundario};text-align:center;">
      Te avisaremos cuando tu pedido esté listo para retirar.
    </p>
  `);
}

// ============================================
// Order ready for pickup
// ============================================
export interface OrderReadyData {
  nombreCliente: string;
  numeroPedido: string;
  pedidoUrl: string;
}

export function orderReadyHtml(data: OrderReadyData) {
  return layout(`
    <h2 style="margin:0 0 8px;font-size:20px;color:${COLORS.bordo};">Tu pedido está listo</h2>
    <p style="margin:0 0 24px;font-size:14px;color:${COLORS.textoSecundario};">
      ¡Hola, ${data.nombreCliente}! Tu pedido #${data.numeroPedido} está listo para retirar en el club.
    </p>
    <div style="background:${COLORS.fondoClaro};border-radius:8px;padding:16px;margin-bottom:16px;">
      <p style="margin:0;font-size:14px;color:${COLORS.texto};">
        <strong>Lugar de retiro:</strong> Sede Club Seminario (Soriano 1472, Montevideo — Colegio Seminario)<br/>
        <strong>Horario:</strong> Martes, Jueves y Viernes de 12:30 a 15:30 hs
      </p>
    </div>
    ${button("Ver detalles del pedido", data.pedidoUrl)}
  `);
}

// ============================================
// Event ticket confirmation with QR
// ============================================
export interface TicketConfirmationData {
  nombreAsistente: string;
  eventoTitulo: string;
  tipoEntrada: string;
  cantidad: number;
  total: number;
  codigos: string[];
  eventoUrl: string;
}

export function ticketConfirmationHtml(data: TicketConfirmationData) {
  const cantidadLabel =
    data.cantidad === 1 ? "1 entrada" : `${data.cantidad} entradas`;

  return layout(`
    <h2 style="margin:0 0 8px;font-size:20px;color:${COLORS.bordo};">Tus entradas están confirmadas</h2>
    <p style="margin:0 0 24px;font-size:14px;color:${COLORS.textoSecundario};">
      ¡Hola, ${data.nombreAsistente}! Ya tenés tus entradas para el evento.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="padding:4px 0;font-size:14px;color:${COLORS.texto};">
          <strong>Evento:</strong> ${data.eventoTitulo}
        </td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-size:14px;color:${COLORS.texto};">
          <strong>Tipo:</strong> ${data.tipoEntrada} &times; ${data.cantidad}
        </td>
      </tr>
      ${
        data.total > 0
          ? `<tr>
        <td style="padding:4px 0;font-size:14px;color:${COLORS.texto};">
          <strong>Total:</strong> $${data.total.toLocaleString("es-UY")}
        </td>
      </tr>`
          : ""
      }
    </table>
    <div style="background:${COLORS.fondoClaro};border-radius:8px;padding:20px;margin-bottom:24px;text-align:center;">
      <p style="margin:0 0 4px;font-size:14px;color:${COLORS.texto};">
        📎 Adjuntamos <strong>${cantidadLabel}</strong> en PDF con tu código QR.
      </p>
      <p style="margin:0;font-size:13px;color:${COLORS.textoSecundario};">
        Presentá el QR en la entrada del evento.
      </p>
    </div>
    ${button("Ver evento", data.eventoUrl)}
  `);
}

// ============================================
// Order pending verification (transfer payment)
// ============================================
export interface OrderPendingVerificationData {
  nombreCliente: string;
  numeroPedido: string;
  items: { nombre: string; cantidad: number; precioUnitario: number }[];
  total: number;
  pedidoUrl: string;
}

export function orderPendingVerificationHtml(
  data: OrderPendingVerificationData
) {
  const itemsRows = data.items
    .map(
      (item) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:${COLORS.texto};">
          ${item.nombre} &times; ${item.cantidad}
        </td>
        <td align="right" style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:${COLORS.texto};">
          $${(item.precioUnitario * item.cantidad).toLocaleString("es-UY")}
        </td>
      </tr>`
    )
    .join("");

  return layout(`
    <h2 style="margin:0 0 8px;font-size:20px;color:${COLORS.bordo};">Pedido recibido — Verificación pendiente</h2>
    <p style="margin:0 0 24px;font-size:14px;color:${COLORS.textoSecundario};">
      ¡Gracias, ${data.nombreCliente}! Recibimos tu pedido y estamos verificando tu transferencia.
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:${COLORS.texto};">
      <strong>Pedido:</strong> #${data.numeroPedido}
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      ${itemsRows}
      <tr>
        <td style="padding:12px 0 0;font-size:16px;font-weight:700;color:${COLORS.bordo};">Total</td>
        <td align="right" style="padding:12px 0 0;font-size:16px;font-weight:700;color:${COLORS.bordo};">
          $${data.total.toLocaleString("es-UY")}
        </td>
      </tr>
    </table>
    <div style="background:#FEF3C7;border-radius:8px;padding:16px;margin-bottom:16px;border-left:4px solid ${COLORS.dorado};">
      <p style="margin:0;font-size:14px;color:${COLORS.texto};">
        <strong>Tu transferencia está siendo verificada.</strong><br/>
        Te notificaremos por email cuando sea confirmada.
      </p>
    </div>
    ${button("Ver mi pedido", data.pedidoUrl)}
    <p style="margin:24px 0 0;font-size:13px;color:${COLORS.textoSecundario};text-align:center;">
      Si tenés alguna consulta, escribinos a clubseminario.com.uy.
    </p>
  `);
}

// ============================================
// Order cancelled
// ============================================
export interface OrderCancelledData {
  nombreCliente: string;
  numeroPedido: string;
  motivo?: string;
}

export function orderCancelledHtml(data: OrderCancelledData) {
  return layout(`
    <h2 style="margin:0 0 8px;font-size:20px;color:${COLORS.bordo};">Pedido cancelado</h2>
    <p style="margin:0 0 16px;font-size:14px;color:${COLORS.textoSecundario};">
      Hola, ${data.nombreCliente}. Tu pedido #${data.numeroPedido} fue cancelado.
    </p>
    ${data.motivo ? `<div style="background:${COLORS.fondoClaro};border-radius:8px;padding:16px;margin-bottom:16px;">
      <p style="margin:0;font-size:14px;color:${COLORS.texto};">
        <strong>Motivo:</strong> ${data.motivo}
      </p>
    </div>` : ""}
    <p style="margin:0;font-size:13px;color:${COLORS.textoSecundario};text-align:center;">
      Si tenés alguna consulta, escribinos a clubseminario.com.uy.
    </p>
  `);
}

// ============================================
// Generic notification (for admin alerts, etc.)
// ============================================
export interface NotificationData {
  titulo: string;
  mensaje: string;
  ctaText?: string;
  ctaUrl?: string;
}

export function notificationHtml(data: NotificationData) {
  return layout(`
    <h2 style="margin:0 0 8px;font-size:20px;color:${COLORS.bordo};">${data.titulo}</h2>
    <p style="margin:0 0 16px;font-size:14px;color:${COLORS.texto};">${data.mensaje}</p>
    ${data.ctaText && data.ctaUrl ? button(data.ctaText, data.ctaUrl) : ""}
  `);
}
