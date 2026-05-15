import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { z } from "zod";

const TIENDA_ROLES = ["super_admin", "tienda"];

const itemSchema = z.object({
  producto_id: z.number().positive(),
  variante_id: z.number().positive().optional().nullable(),
  cantidad: z.number().int().positive(),
  precio_unitario: z.number().positive(),
});

const ventaSchema = z.object({
  items: z.array(itemSchema).min(1, "Debe incluir al menos un producto"),
  metodo_pago: z.enum(["efectivo", "transferencia"]),
  nombre_cliente: z.string().optional().nullable(),
  perfil_socio_id: z.string().optional().nullable(),
  descuento: z.number().min(0).default(0),
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

    // 2. Calcular totales
    const subtotal = parsed.items.reduce(
      (sum, item) => sum + item.precio_unitario * item.cantidad,
      0
    );
    const total = subtotal - parsed.descuento;

    // 3. Crear pedido
    const estadoInicial =
      parsed.metodo_pago === "efectivo"
        ? "pagado"
        : parsed.metodo_pago === "transferencia"
          ? "pendiente_verificacion"
          : "pendiente";

    const pedidoData: Record<string, any> = {
      perfil_id: parsed.perfil_socio_id || null,
      tipo: "pos",
      estado: estadoInicial,
      subtotal,
      descuento: parsed.descuento,
      total,
      metodo_pago: parsed.metodo_pago,
      nombre_cliente: parsed.nombre_cliente || null,
      notas: parsed.notas || null,
      vendedor_id: user?.id || null,
    };

    // Transferencia: reservar stock sin descontar
    if (parsed.metodo_pago === "transferencia") {
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
    // - transferencia: `reservar_stock_pedido` valida + inserta pedido_items
    //                  (stock se descuenta al verificar/aprobar el pedido).
    const itemsPayload = parsed.items.map((item) => ({
      producto_id: item.producto_id,
      variante_id: item.variante_id ?? null,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      subtotal: item.precio_unitario * item.cantidad,
      es_encargue: false,
      personalizacion: {},
      precio_extra_personalizacion: 0,
    }));

    const rpcName =
      parsed.metodo_pago === "efectivo"
        ? "descontar_stock_pedido"
        : "reservar_stock_pedido";

    const rpcArgs: Record<string, any> = {
      p_pedido_id: pedido.id,
      p_items: itemsPayload,
    };
    if (parsed.metodo_pago === "efectivo") {
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

    // 5. Registrar movimiento financiero solo para efectivo (transferencia se
    // confirma al verificar el comprobante).
    if (parsed.metodo_pago === "efectivo") {
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
        });
      } catch (movError) {
        console.error("Error al registrar movimiento financiero:", movError);
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
