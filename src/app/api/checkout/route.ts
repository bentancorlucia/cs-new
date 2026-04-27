import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL } from "@/lib/mercadopago/client";
import { z } from "zod";
import {
  validarValoresMto,
  validarRestriccionSocios,
} from "@/lib/mto/schema";
import { calcularPrecioExtra } from "@/lib/mto/pricing";
import type { MtoCampo } from "@/types/mto";

const checkoutItemSchema = z.object({
  productoId: z.number().int().positive(),
  varianteId: z.number().int().positive().optional(),
  cantidad: z.number().int().positive(),
  esEncargue: z.boolean().optional(),
  personalizacion: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

const checkoutSchema = z.object({
  items: z.array(checkoutItemSchema).min(1, "El carrito está vacío"),
  notas: z.string().max(500).optional(),
  metodo_pago: z.enum(["transferencia"]).default("transferencia"),
});

interface ItemConPrecio {
  productoId: number;
  varianteId?: number;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  precioExtra: number;
  esEncargue: boolean;
  personalizacion: Record<string, string | number>;
  subtotal: number;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const db = createAdminClient() as any;

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

    const { items, notas, metodo_pago } = parsed.data;

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
    const itemsConPrecio: ItemConPrecio[] = [];

    for (const item of items) {
      const { data: prod } = await db
        .from("productos")
        .select(
          "id, nombre, precio, precio_socio, stock_actual, mto_disponible, mto_solo, mto_campos"
        )
        .eq("id", item.productoId)
        .eq("activo", true)
        .single();

      if (!prod) {
        return NextResponse.json(
          { error: `Producto no encontrado (ID: ${item.productoId})` },
          { status: 400 }
        );
      }

      const esEncargue = item.esEncargue === true;

      // Enforcement mto_solo: no se permite venta de stock si está activo.
      if (prod.mto_solo && !esEncargue) {
        return NextResponse.json(
          {
            error: `${prod.nombre} solo se vende bajo encargue. Personalizalo desde la tienda.`,
          },
          { status: 400 }
        );
      }

      // Enforcement mto_disponible: si llega esEncargue=true pero no tiene MTO, rechazar.
      if (esEncargue && !prod.mto_disponible) {
        return NextResponse.json(
          { error: `${prod.nombre} no admite encargue` },
          { status: 400 }
        );
      }

      let precioBase = prod.precio;
      let precioUnitario =
        esSocio && prod.precio_socio ? prod.precio_socio : prod.precio;
      let nombreItem = prod.nombre;
      let varianteId: number | undefined;

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

        // Para encargue, no validar stock de variante.
        if (!esEncargue && vari.stock_actual < item.cantidad) {
          return NextResponse.json(
            {
              error: `Stock insuficiente para ${prod.nombre} (${vari.nombre}). Disponible: ${vari.stock_actual}`,
            },
            { status: 400 }
          );
        }

        precioBase = vari.precio_override ?? prod.precio;
        precioUnitario =
          esSocio && prod.precio_socio ? prod.precio_socio : precioBase;
        nombreItem = `${prod.nombre} - ${vari.nombre}`;
        varianteId = vari.id;
      } else if (!esEncargue && prod.stock_actual < item.cantidad) {
        return NextResponse.json(
          {
            error: `Stock insuficiente para ${prod.nombre}. Disponible: ${prod.stock_actual}`,
          },
          { status: 400 }
        );
      }

      // Validar personalización
      let precioExtra = 0;
      let personalizacion: Record<string, string | number> = {};

      if (esEncargue) {
        const campos = (Array.isArray(prod.mto_campos)
          ? prod.mto_campos
          : []) as MtoCampo[];
        const valores = item.personalizacion ?? {};

        const validacion = validarValoresMto(campos, valores);
        if (!validacion.valid) {
          const firstErr = Object.values(validacion.errors)[0];
          return NextResponse.json(
            { error: `${prod.nombre}: ${firstErr}` },
            { status: 400 }
          );
        }

        const bloqueosSocios = validarRestriccionSocios(
          campos,
          validacion.cleaned,
          esSocio
        );
        if (bloqueosSocios.length > 0) {
          return NextResponse.json(
            {
              error: `${prod.nombre}: la personalización seleccionada es exclusiva de socios`,
            },
            { status: 403 }
          );
        }

        personalizacion = validacion.cleaned;
        precioExtra = calcularPrecioExtra(campos, validacion.cleaned);
      }

      itemsConPrecio.push({
        productoId: item.productoId,
        varianteId,
        nombre: nombreItem,
        cantidad: item.cantidad,
        precioUnitario,
        precioExtra,
        esEncargue,
        personalizacion,
        subtotal: (precioUnitario + precioExtra) * item.cantidad,
      });
    }

    // 5. Calculate totals
    const subtotal = itemsConPrecio.reduce((sum, i) => sum + i.subtotal, 0);
    const total = subtotal;

    // 6. Create order (transferencia only — MercadoPago disabled)
    // Si hay algún encargue, no reservamos stock.
    const tieneEncargues = itemsConPrecio.some((i) => i.esEncargue);
    const todosEncargues = itemsConPrecio.every((i) => i.esEncargue);

    const { data: pedido, error: pedidoError } = await db
      .from("pedidos")
      .insert({
        perfil_id: user.id,
        tipo: "online",
        estado: "pendiente_verificacion",
        subtotal,
        descuento: 0,
        total,
        metodo_pago: "transferencia",
        nombre_cliente: `${perfil.nombre} ${perfil.apellido}`,
        telefono_cliente: perfil.telefono,
        notas: notas || null,
        // Solo reservar stock si hay items que no son encargues
        stock_reservado: !todosEncargues,
        stock_reservado_at: !todosEncargues ? new Date().toISOString() : null,
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
      subtotal: item.subtotal,
      es_encargue: item.esEncargue,
      personalizacion: item.personalizacion,
      precio_extra_personalizacion: item.precioExtra,
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

    // 8. Send pending verification email and return
    try {
      const { sendOrderPendingVerification } = await import(
        "@/lib/email/send"
      );
      await sendOrderPendingVerification(user.email || "", {
        nombreCliente: `${perfil.nombre} ${perfil.apellido}`,
        numeroPedido: pedido.numero_pedido,
        items: itemsConPrecio.map((i) => ({
          nombre: i.nombre,
          cantidad: i.cantidad,
          precioUnitario: i.precioUnitario + i.precioExtra,
        })),
        total,
        pedidoUrl: `${APP_URL}/tienda/pedido/${pedido.id}`,
      });
    } catch (emailError) {
      console.error("Error al enviar email de verificación:", emailError);
    }

    return NextResponse.json({
      pedido_id: pedido.id,
      numero_pedido: pedido.numero_pedido,
      metodo_pago: "transferencia",
      tiene_encargues: tieneEncargues,
    });
  } catch (error: any) {
    console.error("Error en checkout:", error?.message || error, error?.stack);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
