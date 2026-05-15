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
import {
  buscarPromocodeVigente,
  validarMontoMinimo,
} from "@/lib/promocodes/validate";
import { aplicarPromocode } from "@/lib/promocodes/apply";

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
  idempotencyKey: z.string().uuid().optional(),
  codigoPromocion: z.string().trim().min(1).max(40).optional(),
  donacionMonto: z.number().positive().max(1_000_000).optional(),
});

interface ItemPreCalc {
  productoId: number;
  varianteId?: number;
  nombre: string;
  cantidad: number;
  precioNormal: number;
  precioSocioUnitario: number | null;
  precioExtra: number;
  esEncargue: boolean;
  personalizacion: Record<string, string | number>;
}

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

    const { items, notas, metodo_pago, idempotencyKey, codigoPromocion, donacionMonto } =
      parsed.data;

    // 2b. Validar donación contra config (server-side, no confiar en el cliente).
    let donacionFinal = 0;
    if (donacionMonto && donacionMonto > 0) {
      const { data: donConfig } = await db
        .from("donaciones_config")
        .select("activo, monto_1, monto_2, monto_3, permitir_monto_custom, monto_custom_max")
        .eq("id", 1)
        .single();

      if (!donConfig?.activo) {
        return NextResponse.json(
          { error: "Las donaciones no están habilitadas" },
          { status: 400 }
        );
      }

      const montosFijos = [
        Number(donConfig.monto_1),
        Number(donConfig.monto_2),
        Number(donConfig.monto_3),
      ];
      const esMontoFijo = montosFijos.some(
        (m) => Math.abs(m - donacionMonto) < 0.01
      );

      if (!esMontoFijo) {
        if (!donConfig.permitir_monto_custom) {
          return NextResponse.json(
            { error: "El monto de donación no es válido" },
            { status: 400 }
          );
        }
        if (donacionMonto > Number(donConfig.monto_custom_max)) {
          return NextResponse.json(
            { error: "El monto de donación excede el máximo permitido" },
            { status: 400 }
          );
        }
      }

      donacionFinal = donacionMonto;
    }

    // 3a. Idempotency check: si llega un key y ya hay un pedido para este perfil
    // con ese mismo key, devolver el existente sin volver a crear nada.
    if (idempotencyKey) {
      const { data: existente } = await db
        .from("pedidos")
        .select("id, numero_pedido")
        .eq("perfil_id", user.id)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();

      if (existente) {
        return NextResponse.json({
          pedido_id: existente.id,
          numero_pedido: existente.numero_pedido,
          metodo_pago: "transferencia",
          tiene_encargues: false,
          idempotent_replay: true,
        });
      }
    }

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

    // 4. Validate stock and calculate per-item base prices.
    // Acumulamos `itemsPre` con precio_normal y precio_socio (cuando aplique). El cobro
    // final por ítem se decide más abajo en función del promocode (acumulable o no).
    const itemsPre: ItemPreCalc[] = [];

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
      let nombreItem = prod.nombre;
      let varianteId: number | undefined;

      if (item.varianteId) {
        const { data: vari } = await db
          .from("producto_variantes")
          .select("id, nombre, precio_override")
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

        // La validación real de stock (vs reservas concurrentes) se hace de
        // forma atómica en la RPC `reservar_stock_pedido` más abajo.
        precioBase = vari.precio_override ?? prod.precio;
        nombreItem = `${prod.nombre} - ${vari.nombre}`;
        varianteId = vari.id;
      }
      // Stock del producto (sin variante) también se valida en la RPC atómica.

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

      itemsPre.push({
        productoId: item.productoId,
        varianteId,
        nombre: nombreItem,
        cantidad: item.cantidad,
        precioNormal: precioBase,
        // precio_socio se toma del producto y NO depende de variant override
        // (preserva el comportamiento previo a promocodes).
        precioSocioUnitario:
          prod.precio_socio != null && prod.precio_socio < precioBase
            ? Number(prod.precio_socio)
            : null,
        precioExtra,
        esEncargue,
        personalizacion,
      });
    }

    // 5. Validar promocode (si vino) y calcular totales aplicando reglas de socio/acumulable.
    let promoAplicable: import("@/lib/promocodes/schemas").Promocode | null = null;
    if (codigoPromocion) {
      const validacion = await buscarPromocodeVigente(codigoPromocion);
      if (!validacion.ok) {
        return NextResponse.json({ error: validacion.error }, { status: 400 });
      }
      const subtotalNormal = itemsPre.reduce(
        (sum, i) => sum + (i.precioNormal + i.precioExtra) * i.cantidad,
        0
      );
      const minimoCheck = validarMontoMinimo(validacion.promo, subtotalNormal);
      if (!minimoCheck.ok) {
        return NextResponse.json({ error: minimoCheck.error }, { status: 400 });
      }
      promoAplicable = validacion.promo;
    }

    const calc = aplicarPromocode({
      items: itemsPre.map((i) => ({
        precio: i.precioNormal,
        precioSocio: i.precioSocioUnitario,
        precioExtra: i.precioExtra,
        cantidad: i.cantidad,
      })),
      esSocio,
      promo: promoAplicable,
    });

    // Reconstruir itemsConPrecio con el precio efectivamente cobrado por ítem.
    const itemsConPrecio: ItemConPrecio[] = itemsPre.map((i) => {
      const usarSocio =
        calc.aplicoPrecioSocio &&
        i.precioSocioUnitario != null &&
        i.precioSocioUnitario < i.precioNormal;
      const precioUnitario = usarSocio
        ? (i.precioSocioUnitario as number)
        : i.precioNormal;
      return {
        productoId: i.productoId,
        varianteId: i.varianteId,
        nombre: i.nombre,
        cantidad: i.cantidad,
        precioUnitario,
        precioExtra: i.precioExtra,
        esEncargue: i.esEncargue,
        personalizacion: i.personalizacion,
        subtotal: (precioUnitario + i.precioExtra) * i.cantidad,
      };
    });

    const subtotal = calc.subtotal;
    const descuento = calc.descuento;
    // El total que paga el cliente incluye la donación (se transfiere todo junto).
    const total = calc.total + donacionFinal;

    // 6. Reservar uso del promocode antes de crear el pedido (atómico).
    // Si no se aplicó (ej: best-price ganó precio_socio) no consumimos uso.
    if (promoAplicable && calc.aplicoPromocode) {
      const { data: reservado, error: rpcError } = await db.rpc(
        "incrementar_uso_promocode",
        { p_id: promoAplicable.id }
      );
      if (rpcError) {
        console.error("Error reservando uso de promocode:", rpcError);
        return NextResponse.json(
          { error: "Error al aplicar el código" },
          { status: 500 }
        );
      }
      if (reservado !== true) {
        return NextResponse.json(
          { error: "El código ya no está disponible" },
          { status: 400 }
        );
      }
    }

    // 7. Create order (transferencia only — MercadoPago disabled)
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
        descuento,
        total,
        metodo_pago: "transferencia",
        nombre_cliente: `${perfil.nombre} ${perfil.apellido}`,
        telefono_cliente: perfil.telefono,
        notas: notas || null,
        // Solo reservar stock si hay items que no son encargues
        stock_reservado: !todosEncargues,
        stock_reservado_at: !todosEncargues ? new Date().toISOString() : null,
        idempotency_key: idempotencyKey ?? null,
        promocode_id:
          promoAplicable && calc.aplicoPromocode ? promoAplicable.id : null,
        promocode_codigo:
          promoAplicable && calc.aplicoPromocode ? promoAplicable.codigo : null,
        aplico_precio_socio: calc.aplicoPrecioSocio,
      })
      .select("id, numero_pedido")
      .single();

    if (pedidoError || !pedido) {
      // Race condition: dos requests simultáneos con la misma idempotencyKey.
      // Postgres devuelve 23505 (unique violation) por el índice parcial.
      // Reintentamos el SELECT y devolvemos el pedido existente.
      if (idempotencyKey && pedidoError?.code === "23505") {
        const { data: ganador } = await db
          .from("pedidos")
          .select("id, numero_pedido")
          .eq("perfil_id", user.id)
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();

        if (ganador) {
          return NextResponse.json({
            pedido_id: ganador.id,
            numero_pedido: ganador.numero_pedido,
            metodo_pago: "transferencia",
            tiene_encargues: false,
            idempotent_replay: true,
          });
        }
      }

      console.error("Error al crear pedido:", pedidoError);
      return NextResponse.json(
        { error: "Error al crear el pedido" },
        { status: 500 }
      );
    }

    // 8. Reservar stock e insertar pedido_items de forma atómica.
    // La RPC toma FOR UPDATE sobre productos/variantes y descuenta reservas
    // de otros pedidos en 'pendiente_verificacion' antes de insertar. Si
    // algún ítem no tiene stock disponible devuelve {ok:false, faltantes:[...]}
    // y no inserta nada.
    const itemsPayload = itemsConPrecio.map((item) => ({
      producto_id: item.productoId,
      variante_id: item.varianteId ?? null,
      cantidad: item.cantidad,
      precio_unitario: item.precioUnitario,
      subtotal: item.subtotal,
      es_encargue: item.esEncargue,
      personalizacion: item.personalizacion,
      precio_extra_personalizacion: item.precioExtra,
    }));

    const { data: reservaResult, error: reservaError } = await db.rpc(
      "reservar_stock_pedido",
      { p_pedido_id: pedido.id, p_items: itemsPayload }
    );

    const limpiarPedido = async () => {
      // Borrar el pedido huérfano (FK ON DELETE CASCADE limpia donaciones).
      await db.from("pedidos").delete().eq("id", pedido.id);
      // Devolver el uso del promocode si lo habíamos consumido.
      if (promoAplicable && calc.aplicoPromocode) {
        await db.rpc("decrementar_uso_promocode", { p_id: promoAplicable.id });
      }
    };

    if (reservaError) {
      console.error("Error en reservar_stock_pedido:", reservaError);
      await limpiarPedido();
      return NextResponse.json(
        { error: "Error al reservar stock del pedido" },
        { status: 500 }
      );
    }

    if (reservaResult?.ok === false) {
      await limpiarPedido();
      const faltantes = Array.isArray(reservaResult.faltantes)
        ? reservaResult.faltantes
        : [];
      const primero = faltantes[0];
      const mensaje = primero
        ? `Stock insuficiente para ${primero.nombre}. Disponible: ${primero.disponible}`
        : "Stock insuficiente";
      return NextResponse.json(
        { error: mensaje, faltantes },
        { status: 409 }
      );
    }

    // 8b. Crear fila de donación si corresponde (FK ON DELETE CASCADE limpia
    // si se borra el pedido por cualquier razón).
    if (donacionFinal > 0) {
      const { error: donError } = await db.from("donaciones").insert({
        pedido_id: pedido.id,
        monto: donacionFinal,
        estado: "pendiente_pago",
      });
      if (donError) {
        console.error("Error al registrar donación:", donError);
        // No abortamos el pedido — la donación es opcional. Loggeamos para auditar.
      }
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
        donacionMonto: donacionFinal > 0 ? donacionFinal : undefined,
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
