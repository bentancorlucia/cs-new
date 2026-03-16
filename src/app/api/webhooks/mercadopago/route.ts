import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getPayment, isPaymentApproved, isPaymentRejected } from "@/lib/mercadopago/client";

// Use service role for webhook processing (no user auth context)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST /api/webhooks/mercadopago — Webhook de notificaciones de MercadoPago
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // MercadoPago envía diferentes tipos de notificación, solo procesamos pagos
    if (body.type !== "payment") {
      return NextResponse.json({ received: true });
    }

    const paymentId = body.data?.id;

    if (!paymentId) {
      console.error("Webhook missing payment ID:", body);
      return NextResponse.json({ received: true });
    }

    // Obtener detalles del pago desde MercadoPago
    const payment = await getPayment(paymentId.toString());

    const externalRef = payment.external_reference;

    if (!externalRef) {
      console.error("Payment missing external_reference:", payment);
      return NextResponse.json({ received: true });
    }

    // Detect if this is an event ticket payment (EVT-xxx-ids) or an order payment
    if (externalRef.startsWith("EVT-")) {
      await handleEntradaPayment(externalRef, payment);
      return NextResponse.json({ received: true });
    }

    // --- Handle shop order payments ---
    const { data: pedido, error: pedidoError } = await supabaseAdmin
      .from("pedidos")
      .select("id, estado, perfil_id")
      .eq("numero_pedido", externalRef)
      .single();

    if (pedidoError || !pedido) {
      console.error("Webhook: pedido no encontrado para referencia", externalRef);
      return NextResponse.json({ received: true });
    }

    // Solo procesar si el pedido está pendiente
    if (pedido.estado !== "pendiente") {
      return NextResponse.json({ received: true, status: "already_processed" });
    }

    if (isPaymentApproved(payment)) {
      // 1. Actualizar pedido a "pagado"
      await supabaseAdmin
        .from("pedidos")
        .update({
          estado: "pagado",
          mercadopago_payment_id: String(payment.id),
          updated_at: new Date().toISOString(),
        })
        .eq("id", pedido.id);

      // 2. Obtener items del pedido para descontar stock
      const { data: pedidoItems } = await supabaseAdmin
        .from("pedido_items")
        .select("producto_id, variante_id, cantidad")
        .eq("pedido_id", pedido.id);

      if (pedidoItems) {
        for (const item of pedidoItems as any[]) {
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

      // 3. Registrar pago en pagos_mercadopago
      await supabaseAdmin.from("pagos_mercadopago").insert({
        tipo_origen: "pedido",
        origen_id: pedido.id,
        mercadopago_payment_id: String(payment.id),
        mercadopago_status: payment.status ?? null,
        mercadopago_status_detail: payment.status_detail ?? null,
        monto: payment.transaction_amount ?? 0,
        moneda: payment.currency_id ?? "UYU",
        metodo: payment.payment_method_id ?? null,
        raw_data: payment,
      });

      console.log(`Order ${externalRef} paid successfully`);
    } else if (isPaymentRejected(payment)) {
      await supabaseAdmin
        .from("pedidos")
        .update({
          estado: "cancelado",
          notas: `Pago ${payment.status}: ${payment.status_detail ?? "sin detalle"}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pedido.id);

      console.log(`Order ${externalRef} cancelled/rejected`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Error en webhook MercadoPago:", error);
    // Siempre retornar 200 para que MP no reintente
    return NextResponse.json({ received: true });
  }
}

// Handle event ticket payments (external_reference = "EVT-{eventoId}-{entradaId1,entradaId2,...}")
async function handleEntradaPayment(externalRef: string, payment: any) {
  // Parse: "EVT-123-45,46,47"
  const parts = externalRef.split("-");
  if (parts.length < 3) return;

  const entradaIds = parts
    .slice(2)
    .join("-")
    .split(",")
    .map(Number)
    .filter(Boolean);

  if (entradaIds.length === 0) return;

  if (isPaymentApproved(payment)) {
    // Update all entries to "pagada"
    for (const entradaId of entradaIds) {
      const { data: entrada } = await supabaseAdmin
        .from("entradas")
        .select("id, estado")
        .eq("id", entradaId)
        .single();

      if (entrada && entrada.estado === "pendiente") {
        await supabaseAdmin
          .from("entradas")
          .update({
            estado: "pagada",
            mercadopago_payment_id: String(payment.id),
            metodo_pago: "mercadopago",
            updated_at: new Date().toISOString(),
          })
          .eq("id", entradaId);
      }
    }

    // Register in pagos_mercadopago (using first entry as reference)
    await supabaseAdmin.from("pagos_mercadopago").insert({
      tipo_origen: "entrada",
      origen_id: entradaIds[0],
      mercadopago_payment_id: String(payment.id),
      mercadopago_status: payment.status ?? null,
      mercadopago_status_detail: payment.status_detail ?? null,
      monto: payment.transaction_amount ?? 0,
      moneda: payment.currency_id ?? "UYU",
      metodo: payment.payment_method_id ?? null,
      raw_data: payment,
    });

    console.log(`Event tickets [${entradaIds.join(",")}] paid successfully`);
  } else if (isPaymentRejected(payment)) {
    // Cancel entries and restore lot availability
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
            notas: `Pago ${payment.status}: ${payment.status_detail ?? "sin detalle"}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", entradaId);

        // Restore lot availability
        if (entrada.lote_id) {
          const { data: lote } = await supabaseAdmin
            .from("lotes_entrada")
            .select("vendidas")
            .eq("id", entrada.lote_id)
            .single();

          if (lote && lote.vendidas > 0) {
            await supabaseAdmin
              .from("lotes_entrada")
              .update({ vendidas: lote.vendidas - 1 })
              .eq("id", entrada.lote_id);
          }
        }
      }
    }

    console.log(`Event tickets [${entradaIds.join(",")}] cancelled/rejected`);
  }
}

// MercadoPago also sends GET requests to verify the endpoint
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
