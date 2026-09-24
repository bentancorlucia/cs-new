import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { z } from "zod";
import {
  validarValoresMto,
  validarRestriccionSocios,
} from "@/lib/mto/schema";
import { calcularPrecioExtra } from "@/lib/mto/pricing";
import type { MtoCampo } from "@/types/mto";

const TIENDA_ROLES = ["super_admin", "tienda"];

const itemSchema = z.object({
  producto_id: z.number().positive(),
  variante_id: z.number().positive().optional().nullable(),
  cantidad: z.number().int().positive(),
  precio_unitario: z.number().positive(),
  // Encargue (MTO): no descuenta stock; la personalización se valida contra
  // `productos.mto_campos` y el recargo se calcula acá, no en el cliente.
  es_encargue: z.boolean().optional().default(false),
  personalizacion: z
    .record(z.string(), z.union([z.string(), z.number()]))
    .optional()
    .default({}),
});

const ventaSchema = z.object({
  items: z.array(itemSchema).min(1, "Debe incluir al menos un producto"),
  metodo_pago: z.enum(["efectivo", "transferencia", "mixto"]),
  // Solo para `mixto`: parte cobrada en efectivo. El resto va por transferencia.
  monto_efectivo: z.number().positive().optional().nullable(),
  nombre_cliente: z.string().optional().nullable(),
  // Email para avisos del pedido (clientes presenciales sin cuenta).
  email_cliente: z
    .string()
    .trim()
    .max(255)
    .optional()
    .nullable()
    .refine((v) => !v || z.string().email().safeParse(v).success, {
      message: "Email inválido",
    }),
  perfil_socio_id: z.string().optional().nullable(),
  descuento: z.number().min(0).default(0),
  descuento_tipo: z
    .enum(["porcentaje", "fijo", "socio", "lista_precio"])
    .optional()
    .nullable(),
  descuento_porcentaje: z.number().min(0).max(100).optional().nullable(),
  descuento_motivo: z.string().optional().nullable(),
  notas: z.string().optional().nullable(),
});

// POST /api/admin/pos/venta — crear pedido POS
export async function POST(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = await createServerClient();
    const user = await getCurrentUser();
    const body = await request.json();
    const parsed = ventaSchema.parse(body);

    const db = supabase as any;

    // La validación de stock (descontando reservas online concurrentes) se hace
    // de forma atómica más abajo vía RPC `reservar_stock_pedido` /
    // `descontar_stock_pedido`. No validamos aquí para evitar el race condition.

    // 1. Validar encargues + calcular recargos de personalización.
    const productoIds = [...new Set(parsed.items.map((i) => i.producto_id))];
    const { data: prods } = await db
      .from("productos")
      .select("id, nombre, mto_disponible, mto_solo, mto_campos")
      .in("id", productoIds);
    const prodById = new Map<number, any>(
      (prods ?? []).map((p: any) => [p.id, p])
    );

    const hayEncargues = parsed.items.some((i) => i.es_encargue);
    let esSocio = false;
    if (hayEncargues && parsed.perfil_socio_id) {
      const { data: perfilSocio } = await db
        .from("perfiles")
        .select("es_socio")
        .eq("id", parsed.perfil_socio_id)
        .single();
      esSocio = perfilSocio?.es_socio === true;
    }

    const itemsCalc: Array<
      (typeof parsed.items)[number] & { precio_extra: number }
    > = [];
    for (const item of parsed.items) {
      const prod = prodById.get(item.producto_id);
      if (!prod) {
        return NextResponse.json(
          { error: `Producto no encontrado (ID: ${item.producto_id})` },
          { status: 400 }
        );
      }

      if (prod.mto_solo && !item.es_encargue) {
        return NextResponse.json(
          { error: `${prod.nombre} solo se vende bajo encargue` },
          { status: 400 }
        );
      }

      if (!item.es_encargue) {
        itemsCalc.push({ ...item, precio_extra: 0 });
        continue;
      }

      if (!prod.mto_disponible) {
        return NextResponse.json(
          { error: `${prod.nombre} no admite encargue` },
          { status: 400 }
        );
      }

      const campos = (Array.isArray(prod.mto_campos)
        ? prod.mto_campos
        : []) as MtoCampo[];
      const validacion = validarValoresMto(campos, item.personalizacion);
      if (!validacion.valid) {
        const firstErr = Object.values(validacion.errors)[0];
        return NextResponse.json(
          { error: `${prod.nombre}: ${firstErr}` },
          { status: 400 }
        );
      }
      if (validarRestriccionSocios(campos, validacion.cleaned, esSocio).length > 0) {
        return NextResponse.json(
          {
            error: `${prod.nombre}: la personalización seleccionada es exclusiva de socios`,
          },
          { status: 403 }
        );
      }

      itemsCalc.push({
        ...item,
        // El encargue no se asocia a una variante del stock (igual que online).
        variante_id: null,
        personalizacion: validacion.cleaned,
        precio_extra: calcularPrecioExtra(campos, validacion.cleaned),
      });
    }

    // 2. Calcular totales
    // `precio_unitario` es el precio de lista (sin descuento). Todos los
    // descuentos (socio + manual) llegan agregados en `descuento`, por lo que
    // el total nunca debe restar el descuento de socio dos veces.
    // Los encargues suman su recargo de personalización por unidad.
    const subtotal = itemsCalc.reduce(
      (sum, item) =>
        sum + (item.precio_unitario + item.precio_extra) * item.cantidad,
      0
    );

    // El descuento no puede superar el subtotal (evita totales negativos).
    if (parsed.descuento > subtotal) {
      return NextResponse.json(
        { error: "El descuento no puede ser mayor que el subtotal" },
        { status: 400 }
      );
    }

    const total = subtotal - parsed.descuento;

    // Pago mixto: la parte en efectivo debe dejar un saldo > 0 a transferir.
    const esMixto = parsed.metodo_pago === "mixto";
    const montoEfectivoMixto = esMixto
      ? Math.round((parsed.monto_efectivo ?? 0) * 100) / 100
      : 0;
    if (esMixto && (montoEfectivoMixto <= 0 || montoEfectivoMixto >= total)) {
      return NextResponse.json(
        {
          error:
            "En pago mixto el monto en efectivo debe ser mayor a 0 y menor al total",
        },
        { status: 400 }
      );
    }

    // Todo lo que no sea 100% efectivo requiere verificar una transferencia.
    const requiereVerificacion = parsed.metodo_pago !== "efectivo";

    // 3. Crear pedido
    // Efectivo con encargues: queda 'encargado' hasta que llegue el producto.
    // Con transferencia pasa a 'encargado' al verificar el comprobante.
    const estadoInicial = requiereVerificacion
      ? "pendiente_verificacion"
      : hayEncargues
        ? "encargado"
        : "pagado";

    const pedidoData: Record<string, any> = {
      perfil_id: parsed.perfil_socio_id || null,
      tipo: "pos",
      estado: estadoInicial,
      subtotal,
      descuento: parsed.descuento,
      descuento_tipo: parsed.descuento_tipo ?? null,
      descuento_porcentaje: parsed.descuento_porcentaje ?? null,
      descuento_motivo: parsed.descuento_motivo || null,
      total,
      metodo_pago: parsed.metodo_pago,
      nombre_cliente: parsed.nombre_cliente || null,
      email_cliente: parsed.email_cliente?.toLowerCase() || null,
      notas: parsed.notas || null,
      vendedor_id: user?.id || null,
    };

    if (esMixto) {
      pedidoData.monto_efectivo = montoEfectivoMixto;
      pedidoData.monto_transferencia =
        Math.round((total - montoEfectivoMixto) * 100) / 100;
    }

    // Transferencia / mixto: reservar stock sin descontar
    if (requiereVerificacion) {
      pedidoData.stock_reservado = true;
      pedidoData.stock_reservado_at = new Date().toISOString();
    }

    const { data: pedido, error: pedidoError } = await db
      .from("pedidos")
      .insert(pedidoData)
      .select()
      .single();

    if (pedidoError) throw pedidoError;

    // 4. Reservar / descontar stock atómicamente vía RPC.
    // - efectivo:      `descontar_stock_pedido` valida + inserta pedido_items
    //                  + descuenta stock_actual + crea stock_movimientos.
    // - transferencia / mixto: `reservar_stock_pedido` valida + inserta
    //                  pedido_items (stock se descuenta al verificar/aprobar).
    const itemsPayload = itemsCalc.map((item) => ({
      producto_id: item.producto_id,
      variante_id: item.variante_id ?? null,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      subtotal: (item.precio_unitario + item.precio_extra) * item.cantidad,
      es_encargue: item.es_encargue,
      personalizacion: item.personalizacion,
      precio_extra_personalizacion: item.precio_extra,
    }));

    const rpcName = requiereVerificacion
      ? "reservar_stock_pedido"
      : "descontar_stock_pedido";

    const rpcArgs: Record<string, any> = {
      p_pedido_id: pedido.id,
      p_items: itemsPayload,
    };
    if (!requiereVerificacion) {
      rpcArgs.p_registrado_por = user?.id ?? null;
    }

    const { data: rpcResult, error: rpcError } = await db.rpc(rpcName, rpcArgs);

    if (rpcError) {
      console.error(`Error en ${rpcName}:`, rpcError);
      await db.from("pedidos").delete().eq("id", pedido.id);
      return NextResponse.json(
        { error: "Error al procesar el pedido" },
        { status: 500 }
      );
    }

    if (rpcResult?.ok === false) {
      await db.from("pedidos").delete().eq("id", pedido.id);
      const faltantes = Array.isArray(rpcResult.faltantes)
        ? rpcResult.faltantes
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

    // 5. Registrar movimiento financiero por lo cobrado en efectivo. La parte
    // por transferencia se registra al verificar el comprobante.
    if (parsed.metodo_pago === "efectivo" || esMixto) {
      try {
        const { registrarMovimientoVentaPedido } = await import(
          "@/lib/tienda/registrar-movimiento"
        );
        await registrarMovimientoVentaPedido(db, {
          pedidoId: pedido.id,
          numeroPedido: pedido.numero_pedido,
          tipoPedido: "pos",
          total,
          metodoPago: "efectivo",
          registradoPor: user?.id ?? null,
          montoOverride: esMixto ? montoEfectivoMixto : undefined,
          pagoParcial: esMixto,
        });
      } catch (movError) {
        console.error("Error al registrar movimiento financiero:", movError);
      }
    }

    // 6. Encargue cobrado en efectivo: confirmar por mail al cliente. Con
    // transferencia / mixto el mail sale al verificar el comprobante.
    if (!requiereVerificacion && hayEncargues) {
      try {
        const { resolverEmailPedido } = await import("@/lib/tienda/email-pedido");
        const { createAdminClient } = await import("@/lib/supabase/admin");
        const { email } = await resolverEmailPedido(createAdminClient(), pedido);
        if (email) {
          const { sendOrderConfirmation } = await import("@/lib/email/send");
          await sendOrderConfirmation(email, {
            nombreCliente: parsed.nombre_cliente || "",
            numeroPedido: pedido.numero_pedido,
            items: itemsCalc.map((item) => ({
              nombre: prodById.get(item.producto_id)?.nombre ?? "",
              cantidad: item.cantidad,
              precioUnitario: item.precio_unitario + item.precio_extra,
            })),
            total,
          });
        }
      } catch (emailError) {
        console.error("Error al enviar email de confirmación POS:", emailError);
      }
    }

    return NextResponse.json({ data: pedido });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
