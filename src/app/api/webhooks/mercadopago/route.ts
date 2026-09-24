import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import {
  getPayment,
  isPaymentApproved,
  isPaymentRejected,
} from "@/lib/mercadopago/client";
import { sendOrderConfirmation, sendTicketConfirmation } from "@/lib/email";

// Service role for webhook processing (no user auth context)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Valida `x-signature` (HMAC-SHA256) con MERCADOPAGO_WEBHOOK_SECRET.
// Si el secreto no está configurado se acepta con warning (igual se consulta
// el pago a la API de MP, así que no se puede inventar un pago aprobado).
function firmaValida(request: NextRequest, dataId: string): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("MERCADOPAGO_WEBHOOK_SECRET no configurado: webhook sin validar firma");
    return true;
  }
  const header = request.headers.get("x-signature") ?? "";
  const requestId = request.headers.get("x-request-id") ?? "";
  const partes = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, ...v] = p.trim().split("=");
      return [k, v.join("=")];
    })
  );
  if (!partes.ts || !partes.v1) return false;

  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const manifest = `id:${id};request-id:${requestId};ts:${partes.ts};`;
  const esperado = createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(esperado);
  const b = Buffer.from(partes.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

// POST /api/webhooks/mercadopago — Webhook de notificaciones de MercadoPago
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Only process payment notifications
    if (body.type !== "payment") {
      return NextResponse.json({ received: true });
    }

    const paymentId =
      request.nextUrl.searchParams.get("data.id") ?? body.data?.id;
    if (!paymentId) {
      console.error("Webhook missing payment ID:", body);
      return NextResponse.json({ received: true });
    }

    if (!firmaValida(request, String(paymentId))) {
      console.error("Webhook MercadoPago con firma inválida");
      return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
    }

    // Get full payment details from MercadoPago
    const payment = await getPayment(paymentId.toString());
    const externalRef = payment.external_reference;

    if (!externalRef) {
      console.error("Payment missing external_reference:", payment);
      return NextResponse.json({ received: true });
    }

    // Try to parse as JSON (event ticket payments use JSON external_reference)
    let parsedRef: {
      type?: string;
      entradas_ids?: number[];
      evento_id?: number;
    } | null = null;
    try {
      parsedRef = JSON.parse(externalRef);
    } catch {
      // Not JSON — treat as order numero_pedido
    }

    // Route to correct handler
    if (parsedRef?.type === "entradas" && parsedRef.entradas_ids) {
      await handleEntradaPayment(parsedRef.entradas_ids, payment);
    } else {
      await handlePedidoPayment(externalRef, payment);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Error en webhook MercadoPago:", error);
    // Always return 200 so MP doesn't retry indefinitely
    return NextResponse.json({ received: true });
  }
}

// --- Event ticket payments ---
async function handleEntradaPayment(
  entradaIds: number[],
  payment: Awaited<ReturnType<typeof getPayment>>
) {
  if (isPaymentApproved(payment)) {
    // Update all entries to "pagada"
    const { error } = await supabaseAdmin
      .from("entradas")
      .update({
        estado: "pagada",
        mercadopago_payment_id: String(payment.id),
        metodo_pago: "mercadopago",
        updated_at: new Date().toISOString(),
      })
      .in("id", entradaIds)
      .eq("estado", "pendiente");

    if (error) {
      console.error("Error updating entradas:", error);
    }

    // Register in pagos_mercadopago
    await supabaseAdmin.from("pagos_mercadopago").insert({
      tipo_origen: "entrada",
      origen_id: entradaIds[0],
      mercadopago_payment_id: String(payment.id),
      mercadopago_status: payment.status,
      mercadopago_status_detail: payment.status_detail,
      monto: payment.transaction_amount,
      moneda: payment.currency_id || "UYU",
      metodo: payment.payment_method_id || null,
      raw_data: payment,
    });

    // Send ticket confirmation email
    try {
      const { data: entradaDetails } = await supabaseAdmin
        .from("entradas")
        .select("codigo, email_asistente, nombre_asistente, precio_pagado, tipo_entradas(nombre), eventos(titulo, slug, fecha_inicio, lugar)")
        .in("id", entradaIds);

      if (entradaDetails && entradaDetails.length > 0) {
        const first = entradaDetails[0] as any;
        const emailTo = first.email_asistente;
        if (emailTo) {
          const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://clubseminario.com.uy";
          await sendTicketConfirmation(emailTo, {
            nombreAsistente: first.nombre_asistente || "Asistente",
            eventoTitulo: first.eventos?.titulo || "Evento",
            tipoEntrada: first.tipo_entradas?.nombre || "General",
            cantidad: entradaDetails.length,
            total: entradaDetails.reduce((sum: number, e: any) => sum + Number(e.precio_pagado || 0), 0),
            codigos: entradaDetails.map((e: any) => e.codigo).filter(Boolean),
            eventoUrl: `${APP_URL}/eventos/${first.eventos?.slug || ""}`,
            eventoFecha: first.eventos?.fecha_inicio
              ? new Date(first.eventos.fecha_inicio).toLocaleDateString("es-UY", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : undefined,
            eventoLugar: first.eventos?.lugar || undefined,
          });
        }
      }
    } catch (emailError) {
      console.error("Error sending ticket email:", emailError);
    }

    console.log(
      `Event tickets [${entradaIds.join(",")}] paid successfully`
    );
  } else if (isPaymentRejected(payment)) {
    // Cancel entries
    for (const entradaId of entradaIds) {
      const { data: entrada } = await supabaseAdmin
        .from("entradas")
        .select("id, estado, lote_id")
        .eq("id", entradaId)
        .single();

      if (entrada && entrada.estado === "pendiente") {
        await supabaseAdmin
          .from("entradas")
          .update({
            estado: "cancelada",
            notas: `Pago ${payment.status}: ${payment.status_detail || "sin detalle"}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", entradaId);

        // Restore lot availability
        if (entrada.lote_id) {
          const { data: lote } = await supabaseAdmin
            .from("lotes_entrada")
            .select("vendidas, cantidad")
            .eq("id", entrada.lote_id)
            .single();

          if (lote && lote.vendidas > 0) {
            await supabaseAdmin
              .from("lotes_entrada")
              .update({
                vendidas: lote.vendidas - 1,
                estado: lote.vendidas - 1 < lote.cantidad ? "activo" : "agotado",
              })
              .eq("id", entrada.lote_id);
          }
        }
      }
    }

    console.log(
      `Event tickets [${entradaIds.join(",")}] cancelled/rejected`
    );
  }
}

// --- Shop order payments ---
async function handlePedidoPayment(
  numeroPedido: string,
  payment: Awaited<ReturnType<typeof getPayment>>
) {
  const { data: pedido, error: pedidoError } = await supabaseAdmin
    .from("pedidos")
    .select("id, estado, perfil_id, email_cliente, numero_pedido, total, tipo")
    .eq("numero_pedido", numeroPedido)
    .single();

  if (pedidoError || !pedido) {
    console.error(
      "Webhook: pedido no encontrado para referencia",
      numeroPedido
    );
    return;
  }

  // Skip if already processed
  if (pedido.estado !== "pendiente") {
    return;
  }

  if (isPaymentApproved(payment)) {
    // El monto pagado tiene que cubrir el total del pedido.
    if (Number(payment.transaction_amount) + 0.01 < Number(pedido.total)) {
      console.error(
        `Webhook: pago ${payment.id} por ${payment.transaction_amount} no cubre el pedido ${numeroPedido} (${pedido.total})`
      );
      return;
    }

    const { data: items } = await supabaseAdmin
      .from("pedido_items")
      .select(
        "cantidad, precio_unitario, precio_extra_personalizacion, es_encargue, productos(nombre), producto_variantes(nombre)"
      )
      .eq("pedido_id", pedido.id);
    const tieneEncargues = (items ?? []).some((i: any) => i.es_encargue);

    // 1. Pedido → pagado/encargado + descuento de stock, atómico. Si MP
    // reenvía la notificación, la segunda llamada ve otro estado y no hace nada.
    const { data: conf, error: confError } = await supabaseAdmin.rpc(
      "confirmar_reserva_pedido" as any,
      {
        p_pedido_id: pedido.id,
        p_estado_nuevo: tieneEncargues ? "encargado" : "pagado",
        p_registrado_por: null,
        p_estado_esperado: "pendiente",
      } as any
    );
    if (confError || (conf as any)?.ok === false) {
      console.error("Webhook: no se pudo confirmar el pedido", confError ?? conf);
      return;
    }

    await supabaseAdmin
      .from("pedidos")
      .update({ mercadopago_payment_id: String(payment.id) })
      .eq("id", pedido.id);

    // 2. Donación cobrada (no es ingreso de tienda).
    let donacionMonto = 0;
    const { data: donacion } = await supabaseAdmin
      .from("donaciones")
      .select("id, monto, estado")
      .eq("pedido_id", pedido.id)
      .maybeSingle();
    if (donacion && donacion.estado === "pendiente_pago") {
      await supabaseAdmin
        .from("donaciones")
        .update({ estado: "cobrada", cobrada_at: new Date().toISOString() })
        .eq("id", donacion.id);
      donacionMonto = Number(donacion.monto);
    }

    // 3. Ingreso en tesorería
    try {
      const { registrarMovimientoVentaPedido } = await import(
        "@/lib/tienda/registrar-movimiento"
      );
      await registrarMovimientoVentaPedido(supabaseAdmin as any, {
        pedidoId: pedido.id,
        numeroPedido: pedido.numero_pedido || numeroPedido,
        tipoPedido: pedido.tipo === "pos" ? "pos" : "online",
        total: Number(pedido.total),
        metodoPago: "mercadopago",
        registradoPor: null,
        montoOverride:
          donacionMonto > 0 ? Number(pedido.total) - donacionMonto : undefined,
      });
    } catch (movError) {
      console.error("Error al registrar movimiento financiero:", movError);
    }

    // 4. Registro del pago (una fila por payment_id)
    const { data: pagoExistente } = await supabaseAdmin
      .from("pagos_mercadopago")
      .select("id")
      .eq("mercadopago_payment_id", String(payment.id))
      .maybeSingle();
    if (!pagoExistente) {
      await supabaseAdmin.from("pagos_mercadopago").insert({
        tipo_origen: "pedido",
        origen_id: pedido.id,
        mercadopago_payment_id: String(payment.id),
        mercadopago_status: payment.status,
        mercadopago_status_detail: payment.status_detail,
        monto: payment.transaction_amount,
        moneda: payment.currency_id || "UYU",
        metodo: payment.payment_method_id || null,
        raw_data: payment as any,
      });
    }

    // 5. Mail de confirmación
    try {
      const { resolverEmailPedido } = await import("@/lib/tienda/email-pedido");
      const { email, tieneCuenta } = await resolverEmailPedido(supabaseAdmin, pedido);

      if (email) {
        const { data: perfilData } = pedido.perfil_id
          ? await supabaseAdmin
              .from("perfiles")
              .select("nombre, apellido")
              .eq("id", pedido.perfil_id)
              .single()
          : { data: null };
        const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://clubseminario.com.uy";

        await sendOrderConfirmation(email, {
          nombreCliente: perfilData ? `${perfilData.nombre} ${perfilData.apellido}` : "Cliente",
          numeroPedido,
          items: (items ?? []).map((item: any) => ({
            nombre: item.producto_variantes?.nombre
              ? `${item.productos?.nombre ?? ""} - ${item.producto_variantes.nombre}`
              : item.productos?.nombre ?? "",
            cantidad: item.cantidad,
            precioUnitario:
              Number(item.precio_unitario) +
              Number(item.precio_extra_personalizacion || 0),
          })),
          total: Number(pedido.total),
          pedidoUrl: tieneCuenta ? `${APP_URL}/tienda/pedido/${pedido.id}` : undefined,
        });
      }
    } catch (emailError) {
      console.error("Error sending order email:", emailError);
    }

    console.log(`Order ${numeroPedido} paid successfully`);
  } else if (isPaymentRejected(payment)) {
    const { error } = await supabaseAdmin.rpc("cancelar_pedido" as any, {
      p_pedido_id: pedido.id,
      p_motivo: `Pago ${payment.status}: ${payment.status_detail || "sin detalle"}`,
      p_registrado_por: null,
    } as any);
    if (error) console.error("Webhook: error al cancelar pedido", error);

    console.log(`Order ${numeroPedido} cancelled/rejected`);
  }
}

// MercadoPago sends GET requests to verify the endpoint
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
