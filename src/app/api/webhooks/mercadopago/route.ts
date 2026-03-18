import { NextRequest, NextResponse } from "next/server";
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

// POST /api/webhooks/mercadopago — Webhook de notificaciones de MercadoPago
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Only process payment notifications
    if (body.type !== "payment") {
      return NextResponse.json({ received: true });
    }

    const paymentId = body.data?.id;
    if (!paymentId) {
      console.error("Webhook missing payment ID:", body);
      return NextResponse.json({ received: true });
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
    .select("id, estado, perfil_id")
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
    // 1. Update order to "pagado"
    await supabaseAdmin
      .from("pedidos")
      .update({
        estado: "pagado",
        mercadopago_payment_id: String(payment.id),
        updated_at: new Date().toISOString(),
      })
      .eq("id", pedido.id);

    // 2. Deduct stock for each item
    const { data: pedidoItems } = await supabaseAdmin
      .from("pedido_items")
      .select("producto_id, variante_id, cantidad, precio_unitario")
      .eq("pedido_id", pedido.id);

    if (pedidoItems) {
      for (const item of pedidoItems) {
        if (item.variante_id) {
          const { data: variante } = await supabaseAdmin
            .from("producto_variantes")
            .select("stock_actual")
            .eq("id", item.variante_id)
            .single();

          if (variante) {
            const stockAnterior = variante.stock_actual;
            const stockNuevo = Math.max(0, stockAnterior - item.cantidad);

            await supabaseAdmin
              .from("producto_variantes")
              .update({ stock_actual: stockNuevo })
              .eq("id", item.variante_id);

            await supabaseAdmin.from("stock_movimientos").insert({
              producto_id: item.producto_id,
              variante_id: item.variante_id,
              tipo: "venta",
              cantidad: -item.cantidad,
              stock_anterior: stockAnterior,
              stock_nuevo: stockNuevo,
              referencia_tipo: "pedido",
              referencia_id: pedido.id,
            });
          }
        } else {
          const { data: producto } = await supabaseAdmin
            .from("productos")
            .select("stock_actual")
            .eq("id", item.producto_id)
            .single();

          if (producto) {
            const stockAnterior = producto.stock_actual;
            const stockNuevo = Math.max(0, stockAnterior - item.cantidad);

            await supabaseAdmin
              .from("productos")
              .update({ stock_actual: stockNuevo })
              .eq("id", item.producto_id);

            await supabaseAdmin.from("stock_movimientos").insert({
              producto_id: item.producto_id,
              tipo: "venta",
              cantidad: -item.cantidad,
              stock_anterior: stockAnterior,
              stock_nuevo: stockNuevo,
              referencia_tipo: "pedido",
              referencia_id: pedido.id,
            });
          }
        }
      }
    }

    // 3. Register in pagos_mercadopago
    await supabaseAdmin.from("pagos_mercadopago").insert({
      tipo_origen: "pedido",
      origen_id: pedido.id,
      mercadopago_payment_id: String(payment.id),
      mercadopago_status: payment.status,
      mercadopago_status_detail: payment.status_detail,
      monto: payment.transaction_amount,
      moneda: payment.currency_id || "UYU",
      metodo: payment.payment_method_id || null,
      raw_data: payment,
    });

    // Send order confirmation email
    try {
      // Get user email and order details
      const { data: perfilData } = await supabaseAdmin
        .from("perfiles")
        .select("nombre, apellido")
        .eq("id", pedido.perfil_id)
        .single();

      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(pedido.perfil_id);
      const userEmail = authUser?.user?.email;

      if (userEmail && pedidoItems) {
        const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://clubseminario.com.uy";

        // Get product names for items
        const itemsForEmail: { nombre: string; cantidad: number; precioUnitario: number }[] = [];
        for (const item of pedidoItems) {
          const { data: prod } = await supabaseAdmin
            .from("productos")
            .select("nombre")
            .eq("id", item.producto_id)
            .single();

          let nombre = prod?.nombre || `Producto #${item.producto_id}`;
          if (item.variante_id) {
            const { data: vari } = await supabaseAdmin
              .from("producto_variantes")
              .select("nombre")
              .eq("id", item.variante_id)
              .single();
            if (vari) nombre += ` - ${vari.nombre}`;
          }

          itemsForEmail.push({
            nombre,
            cantidad: item.cantidad,
            precioUnitario: Number((item as any).precio_unitario || 0),
          });
        }

        await sendOrderConfirmation(userEmail, {
          nombreCliente: perfilData ? `${perfilData.nombre} ${perfilData.apellido}` : "Cliente",
          numeroPedido,
          items: itemsForEmail,
          total: Number(payment.transaction_amount || 0),
          pedidoUrl: `${APP_URL}/tienda/pedido/${pedido.id}`,
        });
      }
    } catch (emailError) {
      console.error("Error sending order email:", emailError);
    }

    console.log(`Order ${numeroPedido} paid successfully`);
  } else if (isPaymentRejected(payment)) {
    await supabaseAdmin
      .from("pedidos")
      .update({
        estado: "cancelado",
        notas: `Pago ${payment.status}: ${payment.status_detail || "sin detalle"}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pedido.id);

    console.log(`Order ${numeroPedido} cancelled/rejected`);
  }
}

// MercadoPago sends GET requests to verify the endpoint
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
