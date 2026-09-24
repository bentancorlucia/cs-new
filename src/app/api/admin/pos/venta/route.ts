import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { z } from "zod";
import {
  validarValoresMto,
  validarRestriccionSocios,
} from "@/lib/mto/schema";
import { calcularPrecioExtra } from "@/lib/mto/pricing";
import type { MtoCampo } from "@/types/mto";
import {
  calcularDescuentoManual,
  precioListaUnitario,
  precioSocioUnitario,
  round2,
} from "@/lib/tienda/precios";

const TIENDA_ROLES = ["super_admin", "tienda"];

const itemSchema = z.object({
  producto_id: z.number().int().positive(),
  variante_id: z.number().int().positive().optional().nullable(),
  cantidad: z.number().int().positive(),
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
  perfil_socio_id: z.string().uuid().optional().nullable(),
  // Descuento manual del cajero. Precios de lista y de socio los calcula el
  // servidor; el cliente nunca manda precios.
  descuento_manual_tipo: z.enum(["porcentaje", "fijo"]).optional().nullable(),
  descuento_manual_valor: z.number().min(0).optional().nullable(),
  descuento_motivo: z.string().max(500).optional().nullable(),
  // Total que vio el cajero. Si no coincide con el calculado, se rechaza.
  total_esperado: z.number().nonnegative().optional().nullable(),
  notas: z.string().optional().nullable(),
});

// POST /api/admin/pos/venta — crear pedido POS
export async function POST(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const user = await getCurrentUser();
    const body = await request.json();
    const parsed = ventaSchema.parse(body);

    // Las RPC de stock solo las ejecuta service_role (mig 045).
    const db = createAdminClient() as any;

    // 1. Productos, variantes y condición de socio.
    const productoIds = [...new Set(parsed.items.map((i) => i.producto_id))];
    const varianteIds = [
      ...new Set(
        parsed.items
          .filter((i) => !i.es_encargue && i.variante_id != null)
          .map((i) => i.variante_id as number)
      ),
    ];

    const [{ data: prods }, { data: varis }, { data: perfilSocio }] =
      await Promise.all([
        db
          .from("productos")
          .select("id, nombre, precio, precio_socio, activo, mto_disponible, mto_solo, mto_campos")
          .in("id", productoIds),
        varianteIds.length > 0
          ? db
              .from("producto_variantes")
              .select("id, producto_id, nombre, precio_override, activo")
              .in("id", varianteIds)
          : Promise.resolve({ data: [] }),
        parsed.perfil_socio_id
          ? db
              .from("perfiles")
              .select("es_socio")
              .eq("id", parsed.perfil_socio_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

    const prodById = new Map<number, any>((prods ?? []).map((p: any) => [p.id, p]));
    const variById = new Map<number, any>((varis ?? []).map((v: any) => [v.id, v]));
    const esSocio = perfilSocio?.es_socio === true;

    // 2. Precio por ítem (lista + socio + recargo de encargue).
    const itemsCalc: Array<{
      producto_id: number;
      variante_id: number | null;
      nombre: string;
      cantidad: number;
      es_encargue: boolean;
      personalizacion: Record<string, string | number>;
      precio_lista: number;
      precio_socio: number | null;
      precio_extra: number;
    }> = [];

    for (const item of parsed.items) {
      const prod = prodById.get(item.producto_id);
      if (!prod || prod.activo === false) {
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
        let override: number | null = null;
        let nombre = prod.nombre;
        if (item.variante_id != null) {
          const vari = variById.get(item.variante_id);
          if (!vari || vari.producto_id !== prod.id || vari.activo === false) {
            return NextResponse.json(
              { error: `Variante no encontrada para ${prod.nombre}` },
              { status: 400 }
            );
          }
          override = vari.precio_override;
          nombre = `${prod.nombre} - ${vari.nombre}`;
        }

        itemsCalc.push({
          producto_id: prod.id,
          variante_id: item.variante_id ?? null,
          nombre,
          cantidad: item.cantidad,
          es_encargue: false,
          personalizacion: {},
          precio_lista: precioListaUnitario(prod, override),
          precio_socio: esSocio ? precioSocioUnitario(prod, override) : null,
          precio_extra: 0,
        });
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
        producto_id: prod.id,
        // El encargue no se asocia a una variante del stock (igual que online).
        variante_id: null,
        nombre: prod.nombre,
        cantidad: item.cantidad,
        es_encargue: true,
        personalizacion: validacion.cleaned,
        precio_lista: precioListaUnitario(prod),
        precio_socio: esSocio ? precioSocioUnitario(prod) : null,
        precio_extra: calcularPrecioExtra(campos, validacion.cleaned),
      });
    }

    // 3. Totales. `pedido_items.precio_unitario` guarda el precio de lista;
    // el beneficio de socio y el descuento manual van en `pedidos.descuento`.
    const subtotal = round2(
      itemsCalc.reduce(
        (sum, i) => sum + (i.precio_lista + i.precio_extra) * i.cantidad,
        0
      )
    );
    const descuentoSocio = round2(
      itemsCalc.reduce(
        (sum, i) =>
          i.precio_socio != null
            ? sum + (i.precio_lista - i.precio_socio) * i.cantidad
            : sum,
        0
      )
    );
    const descuentoManual = calcularDescuentoManual(
      subtotal - descuentoSocio,
      parsed.descuento_manual_tipo,
      parsed.descuento_manual_valor
    );
    const descuento = round2(descuentoSocio + descuentoManual);
    const total = round2(subtotal - descuento);

    if (
      parsed.total_esperado != null &&
      Math.abs(parsed.total_esperado - total) > 0.01
    ) {
      return NextResponse.json(
        {
          error: `El total calculado ($${total.toLocaleString("es-UY")}) no coincide con el de la pantalla ($${parsed.total_esperado.toLocaleString("es-UY")}). Recargá el POS: puede haber cambiado un precio.`,
          code: "total_cambio",
          total,
        },
        { status: 409 }
      );
    }

    // Pago mixto: la parte en efectivo debe dejar un saldo > 0 a transferir.
    const esMixto = parsed.metodo_pago === "mixto";
    const montoEfectivoMixto = esMixto
      ? round2(parsed.monto_efectivo ?? 0)
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
    const hayEncargues = itemsCalc.some((i) => i.es_encargue);

    // 4. Crear pedido
    // Efectivo con encargues: queda 'encargado' hasta que llegue el producto.
    // Con transferencia pasa a 'encargado' al verificar el comprobante.
    const estadoInicial = requiereVerificacion
      ? "pendiente_verificacion"
      : hayEncargues
        ? "encargado"
        : "pagado";

    const tipoManual = descuentoManual > 0 ? parsed.descuento_manual_tipo : null;

    const pedidoData: Record<string, any> = {
      perfil_id: parsed.perfil_socio_id || null,
      tipo: "pos",
      estado: estadoInicial,
      subtotal,
      descuento,
      descuento_tipo: tipoManual ?? (descuentoSocio > 0 ? "socio" : null),
      descuento_porcentaje:
        tipoManual === "porcentaje"
          ? Math.min(Number(parsed.descuento_manual_valor) || 0, 100)
          : null,
      descuento_motivo: parsed.descuento_motivo || null,
      total,
      metodo_pago: parsed.metodo_pago,
      nombre_cliente: parsed.nombre_cliente || null,
      email_cliente: parsed.email_cliente?.toLowerCase() || null,
      notas: parsed.notas || null,
      vendedor_id: user?.id || null,
      aplico_precio_socio: descuentoSocio > 0,
    };

    if (esMixto) {
      pedidoData.monto_efectivo = montoEfectivoMixto;
      pedidoData.monto_transferencia = round2(total - montoEfectivoMixto);
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

    // 5. Reservar / descontar stock atómicamente vía RPC.
    // - efectivo:      `descontar_stock_pedido` valida + inserta pedido_items
    //                  + descuenta stock_actual + crea stock_movimientos.
    // - transferencia / mixto: `reservar_stock_pedido` valida + inserta
    //                  pedido_items (stock se descuenta al verificar/aprobar).
    const itemsPayload = itemsCalc.map((item) => ({
      producto_id: item.producto_id,
      variante_id: item.variante_id,
      cantidad: item.cantidad,
      precio_unitario: item.precio_lista,
      subtotal: round2((item.precio_lista + item.precio_extra) * item.cantidad),
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

    // 6. Registrar movimiento financiero por lo cobrado en efectivo. La parte
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

    // 7. Encargue cobrado en efectivo: confirmar por mail al cliente. Con
    // transferencia / mixto el mail sale al verificar el comprobante.
    if (!requiereVerificacion && hayEncargues) {
      try {
        const { resolverEmailPedido } = await import("@/lib/tienda/email-pedido");
        const { email } = await resolverEmailPedido(db, pedido);
        if (email) {
          const { sendOrderConfirmation } = await import("@/lib/email/send");
          await sendOrderConfirmation(email, {
            nombreCliente: parsed.nombre_cliente || "",
            numeroPedido: pedido.numero_pedido,
            items: itemsCalc.map((item) => ({
              nombre: item.nombre,
              cantidad: item.cantidad,
              precioUnitario: item.precio_lista + item.precio_extra,
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
