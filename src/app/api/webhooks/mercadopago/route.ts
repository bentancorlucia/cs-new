import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { paymentClient } from "@/lib/mercadopago/client";

// POST /api/webhooks/mercadopago — Webhook de notificaciones de MercadoPago
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // MercadoPago envía notificaciones de tipo "payment"
    if (body.type !== "payment" && body.action !== "payment.updated") {
      return NextResponse.json({ received: true });
    }

    const paymentId = body.data?.id;
    if (!paymentId) {
      return NextResponse.json({ received: true });
    }

    // Obtener detalles del pago desde MercadoPago
    const payment = await paymentClient.get({ id: paymentId });

    if (!payment || !payment.external_reference) {
      console.error("Webhook: pago sin external_reference", paymentId);
      return NextResponse.json({ received: true });
    }

    const supabase = await createServerClient();
    // Cast for admin operations (typed DB causes 'never' on insert/update)
    const db = supabase as any;

    const externalRef = payment.external_reference as string;

    // Detect if this is an event ticket payment (EVT-xxx-ids) or an order payment
    if (externalRef.startsWith("EVT-")) {
      await handleEntradaPayment(db, externalRef, payment);
      return NextResponse.json({ received: true });
    }

    // Buscar el pedido por numero_pedido (external_reference)
    const { data: pedido, error: pedidoError } = await db
      .from("pedidos")
      .select("id, estado, perfil_id")
      .eq("numero_pedido", externalRef)
      .single();

    if (pedidoError || !pedido) {
      console.error(
        "Webhook: pedido no encontrado para referencia",
        externalRef
      );
      return NextResponse.json({ received: true });
    }

    // Solo procesar si el pedido está pendiente
    if (pedido.estado !== "pendiente") {
      return NextResponse.json({ received: true });
    }

    if (payment.status === "approved") {
      // 1. Actualizar pedido a "pagado"
      await db
        .from("pedidos")
        .update({
          estado: "pagado",
          mercadopago_payment_id: String(payment.id),
          updated_at: new Date().toISOString(),
        })
        .eq("id", pedido.id);

      // 2. Obtener items del pedido para descontar stock
      const { data: pedidoItems } = await db
        .from("pedido_items")
        .select("producto_id, variante_id, cantidad")
        .eq("pedido_id", pedido.id);

      if (pedidoItems) {
        for (const item of pedidoItems as any[]) {
          if (item.variante_id) {
            const { data: variante } = await db
              .from("producto_variantes")
              .select("stock_actual")
              .eq("id", item.variante_id)
              .single();

            if (variante) {
              const stockAnterior = variante.stock_actual;
              const stockNuevo = Math.max(0, stockAnterior - item.cantidad);

              await db
                .from("producto_variantes")
                .update({ stock_actual: stockNuevo })
                .eq("id", item.variante_id);

              await db.from("stock_movimientos").insert({
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
            const { data: producto } = await db
              .from("productos")
              .select("stock_actual")
              .eq("id", item.producto_id)
              .single();

            if (producto) {
              const stockAnterior = producto.stock_actual;
              const stockNuevo = Math.max(0, stockAnterior - item.cantidad);

              await db
                .from("productos")
                .update({ stock_actual: stockNuevo })
                .eq("id", item.producto_id);

              await db.from("stock_movimientos").insert({
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
      await db.from("pagos_mercadopago").insert({
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
    } else if (
      payment.status === "rejected" ||
      payment.status === "cancelled"
    ) {
      await db
        .from("pedidos")
        .update({
          estado: "cancelado",
          notas: `Pago ${payment.status}: ${payment.status_detail ?? "sin detalle"}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pedido.id);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Error en webhook MercadoPago:", error);
    // Siempre retornar 200 para que MP no reintente
    return NextResponse.json({ received: true });
  }
}

// Handle event ticket payments (external_reference = "EVT-{eventoId}-{entradaId1,entradaId2,...}")
async function handleEntradaPayment(db: any, externalRef: string, payment: any) {
  // Parse: "EVT-123-45,46,47"
  const parts = externalRef.split("-");
  if (parts.length < 3) return;

  const entradaIds = parts.slice(2).join("-").split(",").map(Number).filter(Boolean);

  if (entradaIds.length === 0) return;

  if (payment.status === "approved") {
    // Update all entries to "pagada"
    for (const entradaId of entradaIds) {
      const { data: entrada } = await db
        .from("entradas")
        .select("id, estado")
        .eq("id", entradaId)
        .single();

      if (entrada && entrada.estado === "pendiente") {
        await db
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
    await db.from("pagos_mercadopago").insert({
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
  } else if (payment.status === "rejected" || payment.status === "cancelled") {
    // Cancel entries and restore lot availability
    for (const entradaId of entradaIds) {
      const { data: entrada } = await db
        .from("entradas")
        .select("id, estado, lote_id")
        .eq("id", entradaId)
        .single();

      if (entrada && entrada.estado === "pendiente") {
        await db
          .from("entradas")
          .update({
            estado: "cancelada",
            notas: `Pago ${payment.status}: ${payment.status_detail ?? "sin detalle"}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", entradaId);

        // Restore lot availability
        if (entrada.lote_id) {
          const { data: lote } = await db
            .from("lotes_entrada")
            .select("vendidas")
            .eq("id", entrada.lote_id)
            .single();

          if (lote && lote.vendidas > 0) {
            await db
              .from("lotes_entrada")
              .update({ vendidas: lote.vendidas - 1 })
              .eq("id", entrada.lote_id);
          }
        }
      }
    }
  }
}
