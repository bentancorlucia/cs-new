import { after } from "next/server";
import { createComunicacionesAdminClient } from "../comunicaciones/server";
import { procesarCola } from "../comunicaciones/worker";
import { renderPlantilla } from "../comunicaciones/render";
import { pesos } from "../comunicaciones/transaccionales";
import type { Encabezado } from "../comunicaciones/molde";
import { formatFecha, formatImporte } from "../contabilidad/formato";
import type { OrdenCompraPdfDatos } from "../pdf/orden-compra-pdf";
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

/**
 * Asunto y HTML desde la plantilla editable de la base (Comunicaciones →
 * Plantillas). Si no está o falla al armarse, la versión del código: un
 * error al editar nunca deja a un cliente sin su mail.
 */
async function armar(
  clave: string,
  variables: Record<string, unknown>,
  respaldo: { asunto: string; html: string }
): Promise<{ asunto: string; html: string }> {
  try {
    const db = createComunicacionesAdminClient();
    const [{ data: p }, { data: cfg }] = await Promise.all([
      db.from("plantillas").select("asunto, cuerpo, formato, usa_molde, encabezado").eq("clave", clave).eq("transaccional", true).maybeSingle(),
      db.from("config").select("pie, molde_html").maybeSingle(),
    ]);
    if (!p) return respaldo;
    const r = renderPlantilla(
      {
        asunto: p.asunto,
        cuerpo: p.cuerpo,
        formato: p.formato,
        usaMolde: p.usa_molde,
        encabezado: p.encabezado as Encabezado,
      },
      variables,
      { pie: cfg?.pie ?? null, moldeHtml: cfg?.molde_html ?? null }
    );
    if (!r.asunto.trim() || !r.html.trim()) return respaldo;
    return { asunto: r.asunto, html: r.html };
  } catch (e) {
    console.error(`[Email] La plantilla "${clave}" falló; se usa la versión original:`, e);
    return respaldo;
  }
}

const itemsVars = (items: { nombre: string; cantidad: number; precioUnitario: number }[]) =>
  items.map((i) => ({ producto: i.nombre, cantidad: i.cantidad, importe: pesos(i.precioUnitario * i.cantidad) }));

async function encolar(m: Encolado): Promise<boolean> {
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
    return true;
  } catch (error) {
    console.error(`[Email] No se pudo encolar "${m.asunto}":`, error);
    return false;
  }
}

export async function sendOrderConfirmation(to: string, data: OrderConfirmationData) {
  const mail = await armar(
    "pedido_confirmacion",
    {
      nombre: data.nombreCliente,
      numero_pedido: data.numeroPedido,
      items: itemsVars(data.items),
      total: pesos(data.total),
      pedido_url: data.pedidoUrl ?? "",
    },
    { asunto: `Confirmación de compra — Pedido #${data.numeroPedido}`, html: orderConfirmationHtml(data) }
  );
  await encolar({
    to,
    nombre: data.nombreCliente,
    ...mail,
    dedupe: `pedido:${data.numeroPedido}:confirmacion`,
    refTipo: "pedido",
    refId: String(data.numeroPedido),
  });
}

export async function sendOrderReady(to: string, data: OrderReadyData) {
  const mail = await armar(
    "pedido_listo",
    { nombre: data.nombreCliente, numero_pedido: data.numeroPedido, pedido_url: data.pedidoUrl ?? "" },
    { asunto: `Tu pedido #${data.numeroPedido} está listo para retirar`, html: orderReadyHtml(data) }
  );
  await encolar({
    to,
    nombre: data.nombreCliente,
    ...mail,
    dedupe: `pedido:${data.numeroPedido}:listo`,
    refTipo: "pedido",
    refId: String(data.numeroPedido),
  });
}

export async function sendOrderPendingVerification(to: string, data: OrderPendingVerificationData) {
  const mail = await armar(
    "pedido_verificacion",
    {
      nombre: data.nombreCliente,
      numero_pedido: data.numeroPedido,
      items: itemsVars(data.items),
      donacion: data.donacionMonto && data.donacionMonto > 0 ? pesos(data.donacionMonto) : "",
      total: pesos(data.total),
      pedido_url: data.pedidoUrl,
    },
    {
      asunto: `Pedido #${data.numeroPedido} — Verificación de transferencia pendiente`,
      html: orderPendingVerificationHtml(data),
    }
  );
  await encolar({
    to,
    nombre: data.nombreCliente,
    ...mail,
    dedupe: `pedido:${data.numeroPedido}:verificacion`,
    refTipo: "pedido",
    refId: String(data.numeroPedido),
  });
}

export async function sendOrderCancelled(to: string, data: OrderCancelledData) {
  const mail = await armar(
    "pedido_cancelado",
    { nombre: data.nombreCliente, numero_pedido: data.numeroPedido, motivo: data.motivo ?? "" },
    { asunto: `Tu pedido #${data.numeroPedido} fue cancelado`, html: orderCancelledHtml(data) }
  );
  await encolar({
    to,
    nombre: data.nombreCliente,
    ...mail,
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
  const mail = await armar(
    "entradas",
    {
      nombre: data.nombreAsistente,
      evento: data.eventoTitulo,
      tipo_entrada: data.tipoEntrada,
      cantidad: data.cantidad,
      cantidad_texto: data.cantidad === 1 ? "1 entrada" : `${data.cantidad} entradas`,
      total: data.total > 0 ? pesos(data.total) : "",
      evento_url: data.eventoUrl,
    },
    { asunto: `Tus entradas para ${data.eventoTitulo}`, html: ticketConfirmationHtml(data) }
  );
  // El PDF con los QR se genera al enviar (no se guarda en la base).
  await encolar({
    to,
    nombre: data.nombreAsistente,
    ...mail,
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
  const mail = await armar(
    "notificacion",
    { titulo: data.titulo, mensaje: data.mensaje, cta_texto: data.ctaText ?? "", cta_url: data.ctaUrl ?? "" },
    { asunto: data.titulo, html: notificationHtml(data) }
  );
  await encolar({
    to,
    ...mail,
    dedupe: null,
  });
}

/**
 * Resumen de la liquidación mensual a un representante de la disciplina.
 * Las variables las arma src/lib/socios/liquidacion-mail.ts.
 */
export async function sendLiquidacionDisciplina(
  to: string,
  nombre: string,
  variables: Record<string, unknown> & { disciplina: string; periodo: string; resultado_texto: string; resultado: string },
  opciones: { liquidacionId: number; reenvio: string | null }
) {
  const v = variables;
  const mail = await armar("liquidacion_disciplina", variables, {
    asunto: `Liquidación de ${v.disciplina} — ${v.periodo}`,
    html: notificationHtml({
      titulo: `Liquidación de ${v.periodo}`,
      mensaje: `Hola ${nombre}: la liquidación de las cuotas de ${v.disciplina} de ${v.periodo} dio ${v.resultado_texto.toLowerCase()}: ${v.resultado}. El detalle está en el panel de la disciplina.`,
      ctaText: "Ver el detalle",
      ctaUrl: String(v.panel_url ?? "") || undefined,
    }),
  });
  await encolar({
    to,
    nombre,
    ...mail,
    dedupe: `liquidacion:${opciones.liquidacionId}:${to.toLowerCase()}${opciones.reenvio ? `:${opciones.reenvio}` : ""}`,
    refTipo: "liquidacion_disciplina",
    refId: String(opciones.liquidacionId),
    variables,
  });
}

const escaparHtml = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Orden de compra al proveedor, con el PDF adjunto. El PDF se arma al
 * enviar con los datos que se guardan acá (la foto de la orden al
 * momento de mandarla). Devuelve false si no se pudo encolar.
 */
export async function sendOrdenCompraProveedor(
  to: string,
  data: { ordenId: number; mensaje: string; pdf: OrdenCompraPdfDatos }
): Promise<boolean> {
  const { pdf } = data;
  const nombre = pdf.proveedor.contacto_nombre || pdf.proveedor.nombre;
  const total = formatImporte(
    pdf.items.reduce((s, i) => s + Math.round(i.cantidad * i.precio * 100) / 100, 0),
    pdf.moneda
  );
  const mail = await armar(
    "orden_compra",
    {
      nombre,
      proveedor: pdf.proveedor.nombre,
      numero_orden: pdf.numero,
      fecha: formatFecha(pdf.fecha),
      total,
      mensaje: data.mensaje,
    },
    {
      asunto: `Orden de compra ${pdf.numero} — Club Seminario`,
      html: notificationHtml({
        titulo: `Orden de compra ${pdf.numero}`,
        mensaje:
          `Hola ${escaparHtml(nombre)}: te enviamos adjunta la orden de compra ${pdf.numero} del ${formatFecha(pdf.fecha)} por ${total}. ` +
          `Por favor, indicá el número de orden en el remito y en la factura.` +
          (data.mensaje ? `<br><br>${escaparHtml(data.mensaje).replace(/\n/g, "<br>")}` : ""),
      }),
    }
  );
  return encolar({
    to,
    nombre,
    ...mail,
    dedupe: null,
    refTipo: "orden_compra",
    refId: String(data.ordenId),
    variables: { adjunto: { tipo: "orden_compra_pdf", datos: pdf } },
  });
}
