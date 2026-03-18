import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import {
  createPreference,
  getCheckoutUrl,
  APP_URL,
} from "@/lib/mercadopago/client";

const TIENDA_ROLES = ["super_admin", "tienda"];

// POST /api/admin/pos/qr — generar QR de MercadoPago para cobro POS
export async function POST(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = await createServerClient();
    const db = supabase as any;

    const body = await request.json();
    const { pedido_id } = body;

    if (!pedido_id) {
      return NextResponse.json(
        { error: "pedido_id requerido" },
        { status: 400 }
      );
    }

    // Get order
    const { data: pedido, error: pedidoError } = await db
      .from("pedidos")
      .select("id, numero_pedido, nombre_cliente, total")
      .eq("id", pedido_id)
      .single();

    if (pedidoError || !pedido) {
      return NextResponse.json(
        { error: "Pedido no encontrado" },
        { status: 404 }
      );
    }

    // Get order items
    const { data: items, error: itemsError } = await db
      .from("pedido_items")
      .select("producto_id, cantidad, precio_unitario, productos(nombre)")
      .eq("pedido_id", pedido_id);

    if (itemsError) {
      return NextResponse.json(
        { error: "Error al obtener items del pedido" },
        { status: 500 }
      );
    }

    // Create MP preference
    const preference = await createPreference({
      items: (items || []).map((item: any) => ({
        id: String(item.producto_id),
        title: item.productos?.nombre || `Producto #${item.producto_id}`,
        unit_price: item.precio_unitario,
        quantity: item.cantidad,
        currency_id: "UYU",
      })),
      external_reference: pedido.numero_pedido,
      payer: {
        email: "pos@clubseminario.com.uy",
        name: pedido.nombre_cliente || "POS",
      },
      back_urls: {
        success: `${APP_URL}/admin/pos`,
        failure: `${APP_URL}/admin/pos`,
        pending: `${APP_URL}/admin/pos`,
      },
      notification_url: `${APP_URL}/api/webhooks/mercadopago`,
      statement_descriptor: "CLUB SEMINARIO",
    });

    // Save preference_id on order
    await db
      .from("pedidos")
      .update({
        mercadopago_preference_id: preference.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pedido_id);

    return NextResponse.json({
      data: {
        preference_id: preference.id,
        checkout_url: getCheckoutUrl(preference),
      },
    });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    console.error("Error en POS QR:", error);
    return NextResponse.json(
      { error: "Error al generar QR de pago" },
      { status: 500 }
    );
  }
}
