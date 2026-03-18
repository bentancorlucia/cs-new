import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  createPreference,
  getCheckoutUrl,
  APP_URL,
} from "@/lib/mercadopago/client";
import { z } from "zod";

const checkoutItemSchema = z.object({
  productoId: z.number().int().positive(),
  varianteId: z.number().int().positive().optional(),
  cantidad: z.number().int().positive(),
});

const checkoutSchema = z.object({
  items: z.array(checkoutItemSchema).min(1, "El carrito está vacío"),
  notas: z.string().max(500).optional(),
});

// POST /api/checkout — Crear pedido + preferencia MercadoPago
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const db = supabase as any;

    // 1. Auth
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Debés iniciar sesión para continuar" },
        { status: 401 }
      );
    }

    // 2. Validate body
    const body = await request.json();
    const parsed = checkoutSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { items, notas } = parsed.data;

    // 3. Get user profile (for socio pricing)
    const { data: perfil } = await db
      .from("perfiles")
      .select("es_socio, nombre, apellido, telefono")
      .eq("id", user.id)
      .single();

    if (!perfil) {
      return NextResponse.json(
        { error: "Perfil no encontrado" },
        { status: 400 }
      );
    }

    const esSocio = perfil.es_socio === true;

    // 4. Validate stock and calculate prices
    const itemsConPrecio: {
      productoId: number;
      varianteId?: number;
      nombre: string;
      cantidad: number;
      precioUnitario: number;
    }[] = [];

    for (const item of items) {
      const { data: prod } = await db
        .from("productos")
        .select("id, nombre, precio, precio_socio, stock_actual")
        .eq("id", item.productoId)
        .eq("activo", true)
        .single();

      if (!prod) {
        return NextResponse.json(
          { error: `Producto no encontrado (ID: ${item.productoId})` },
          { status: 400 }
        );
      }

      if (item.varianteId) {
        const { data: vari } = await db
          .from("producto_variantes")
          .select("id, nombre, precio_override, stock_actual")
          .eq("id", item.varianteId)
          .eq("producto_id", item.productoId)
          .eq("activo", true)
          .single();

        if (!vari) {
          return NextResponse.json(
            { error: `Variante no encontrada para ${prod.nombre}` },
            { status: 400 }
          );
        }

        if (vari.stock_actual < item.cantidad) {
          return NextResponse.json(
            {
              error: `Stock insuficiente para ${prod.nombre} (${vari.nombre}). Disponible: ${vari.stock_actual}`,
            },
            { status: 400 }
          );
        }

        const precioBase = vari.precio_override ?? prod.precio;
        const precioUnitario =
          esSocio && prod.precio_socio ? prod.precio_socio : precioBase;

        itemsConPrecio.push({
          productoId: item.productoId,
          varianteId: item.varianteId,
          nombre: `${prod.nombre} - ${vari.nombre}`,
          cantidad: item.cantidad,
          precioUnitario,
        });
      } else {
        if (prod.stock_actual < item.cantidad) {
          return NextResponse.json(
            {
              error: `Stock insuficiente para ${prod.nombre}. Disponible: ${prod.stock_actual}`,
            },
            { status: 400 }
          );
        }

        const precioUnitario =
          esSocio && prod.precio_socio ? prod.precio_socio : prod.precio;

        itemsConPrecio.push({
          productoId: item.productoId,
          nombre: prod.nombre,
          cantidad: item.cantidad,
          precioUnitario,
        });
      }
    }

    // 5. Calculate totals
    const subtotal = itemsConPrecio.reduce(
      (sum, i) => sum + i.precioUnitario * i.cantidad,
      0
    );
    const total = subtotal;

    // 6. Create order
    const { data: pedido, error: pedidoError } = await db
      .from("pedidos")
      .insert({
        perfil_id: user.id,
        tipo: "online",
        estado: "pendiente",
        subtotal,
        descuento: 0,
        total,
        metodo_pago: "mercadopago",
        nombre_cliente: `${perfil.nombre} ${perfil.apellido}`,
        telefono_cliente: perfil.telefono,
        notas: notas || null,
      })
      .select("id, numero_pedido")
      .single();

    if (pedidoError || !pedido) {
      console.error("Error al crear pedido:", pedidoError);
      return NextResponse.json(
        { error: "Error al crear el pedido" },
        { status: 500 }
      );
    }

    // 7. Create order items
    const pedidoItems = itemsConPrecio.map((item) => ({
      pedido_id: pedido.id,
      producto_id: item.productoId,
      variante_id: item.varianteId || null,
      cantidad: item.cantidad,
      precio_unitario: item.precioUnitario,
      subtotal: item.precioUnitario * item.cantidad,
    }));

    const { error: itemsError } = await db
      .from("pedido_items")
      .insert(pedidoItems);

    if (itemsError) {
      console.error("Error al crear items del pedido:", itemsError);
      await db.from("pedidos").delete().eq("id", pedido.id);
      return NextResponse.json(
        { error: "Error al crear los items del pedido" },
        { status: 500 }
      );
    }

    // 8. Create MercadoPago preference
    let preference;
    try {
      preference = await createPreference({
        items: itemsConPrecio.map((item) => ({
          id: String(item.productoId),
          title: item.nombre,
          quantity: item.cantidad,
          unit_price: item.precioUnitario,
          currency_id: "UYU",
        })),
        external_reference: pedido.numero_pedido,
        payer: {
          email: user.email || "",
          name: perfil.nombre,
          surname: perfil.apellido,
        },
        back_urls: {
          success: `${APP_URL}/tienda/pedido/${pedido.id}?status=approved`,
          failure: `${APP_URL}/tienda/pedido/${pedido.id}?status=failure`,
          pending: `${APP_URL}/tienda/pedido/${pedido.id}?status=pending`,
        },
        notification_url: `${APP_URL}/api/webhooks/mercadopago`,
        statement_descriptor: "CLUB SEMINARIO",
      });
    } catch (mpError: any) {
      console.error("MercadoPago error:", mpError?.message);
      // Don't delete order — it stays as pendiente, user can retry
      return NextResponse.json(
        { error: "Error al conectar con MercadoPago. Intentá de nuevo." },
        { status: 502 }
      );
    }

    // 9. Save preference_id on order
    await db
      .from("pedidos")
      .update({ mercadopago_preference_id: preference.id })
      .eq("id", pedido.id);

    return NextResponse.json({
      pedido_id: pedido.id,
      numero_pedido: pedido.numero_pedido,
      checkout_url: getCheckoutUrl(preference),
    });
  } catch (error) {
    console.error("Error en checkout:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
