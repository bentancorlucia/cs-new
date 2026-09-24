import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { z } from "zod";
import { resolverEmailPedido } from "@/lib/tienda/email-pedido";

const TIENDA_ROLES = ["super_admin", "tienda"];

const verificarSchema = z.object({
  accion: z.enum(["aprobar", "rechazar"]),
  motivo: z.string().max(500).optional(),
});

// POST /api/admin/pedidos/[id]/verificar — Aprobar o rechazar transferencia
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const user = await getCurrentUser();
    const db = createAdminClient() as any;

    const { id } = await params;
    const pedidoId = parseInt(id);
    if (isNaN(pedidoId)) {
      return NextResponse.json(
        { error: "ID de pedido inválido" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = verificarSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { accion, motivo } = parsed.data;

    // 1. Fetch pedido
    const { data: pedido } = await db
      .from("pedidos")
      .select(
        "id, estado, perfil_id, email_cliente, total, numero_pedido, nombre_cliente, tipo, metodo_pago, monto_transferencia"
      )
      .eq("id", pedidoId)
      .single();

    if (!pedido) {
      return NextResponse.json(
        { error: "Pedido no encontrado" },
        { status: 404 }
      );
    }

    if (pedido.estado !== "pendiente_verificacion") {
      return NextResponse.json(
        { error: "Este pedido no está pendiente de verificación" },
        { status: 400 }
      );
    }

    // 2. ¿Tiene encargues? Define el estado al aprobar.
    const { data: pedidoItemsRaw } = await db
      .from("pedido_items")
      .select("es_encargue")
      .eq("pedido_id", pedidoId);

    if (accion === "aprobar") {
      // 3a. Descontar stock + cambiar estado de forma atómica. La RPC toma
      // lock del pedido: una segunda aprobación simultánea recibe error y no
      // duplica stock ni ingresos.
      const tieneEncargues = (pedidoItemsRaw || []).some(
        (i: any) => i.es_encargue
      );
      const nuevoEstado = tieneEncargues ? "encargado" : "preparando";
      const { data: conf, error: confError } = await db.rpc(
        "confirmar_reserva_pedido",
        {
          p_pedido_id: pedidoId,
          p_estado_nuevo: nuevoEstado,
          p_registrado_por: user?.id ?? null,
        }
      );

      if (confError) {
        console.error("Error en confirmar_reserva_pedido:", confError);
        return NextResponse.json(
          { error: "Error al aprobar el pedido" },
          { status: 500 }
        );
      }

      if (conf?.ok === false) {
        if (conf.error === "stock") {
          const primero = (conf.faltantes ?? [])[0];
          return NextResponse.json(
            {
              error: primero
                ? `Stock insuficiente para "${primero.nombre}". Disponible: ${primero.disponible}, necesario: ${primero.solicitado}`
                : "Stock insuficiente",
            },
            { status: 400 }
          );
        }
        return NextResponse.json(
          { error: "Este pedido ya no está pendiente de verificación" },
          { status: 409 }
        );
      }

      // 6a. Update comprobante → verificado
      await db
        .from("comprobantes")
        .update({
          estado: "verificado",
          verificado_por: user?.id,
          verificado_at: new Date().toISOString(),
        })
        .eq("pedido_id", pedidoId);

      // Marcar donación como cobrada y restarla del monto que entra a tesorería.
      let donacionMonto = 0;
      try {
        const { data: donacion } = await db
          .from("donaciones")
          .select("id, monto, estado")
          .eq("pedido_id", pedidoId)
          .maybeSingle();

        if (donacion && donacion.estado === "pendiente_pago") {
          await db
            .from("donaciones")
            .update({
              estado: "cobrada",
              cobrada_at: new Date().toISOString(),
            })
            .eq("id", donacion.id);
          donacionMonto = Number(donacion.monto);
        } else if (donacion && donacion.estado === "cobrada") {
          // idempotencia: ya estaba cobrada, igual descontamos del movimiento
          donacionMonto = Number(donacion.monto);
        }
      } catch (donError) {
        console.error("Error al marcar donación cobrada:", donError);
      }

      try {
        const { registrarMovimientoVentaPedido } = await import(
          "@/lib/tienda/registrar-movimiento"
        );
        // Pago mixto: el efectivo ya se registró al vender; acá solo entra
        // la parte transferida.
        const esMixto = pedido.metodo_pago === "mixto";
        const montoTransferido = esMixto
          ? Number(pedido.monto_transferencia)
          : Number(pedido.total);
        await registrarMovimientoVentaPedido(db, {
          pedidoId,
          numeroPedido: pedido.numero_pedido,
          tipoPedido: pedido.tipo === "pos" ? "pos" : "online",
          total: pedido.total,
          metodoPago: "transferencia",
          registradoPor: user?.id ?? null,
          // La donación NO se cuenta como ingreso de tienda
          montoOverride:
            esMixto || donacionMonto > 0
              ? montoTransferido - donacionMonto
              : undefined,
          pagoParcial: esMixto,
        });
      } catch (movError) {
        console.error("Error al registrar movimiento financiero:", movError);
      }

      // 7a. Send confirmation email (cuenta o email_cliente del POS)
      try {
        const { email, tieneCuenta } = await resolverEmailPedido(db, pedido);

        if (email) {
          const { data: perfil } = pedido.perfil_id
            ? await db
                .from("perfiles")
                .select("nombre, apellido")
                .eq("id", pedido.perfil_id)
                .single()
            : { data: null };

          const { data: items } = await db
            .from("pedido_items")
            .select(
              "cantidad, precio_unitario, precio_extra_personalizacion, productos(nombre), producto_variantes(nombre)"
            )
            .eq("pedido_id", pedidoId);

          const itemsConNombre = (items ?? []).map((item: any) => ({
            nombre: item.producto_variantes?.nombre
              ? `${item.productos?.nombre ?? ""} - ${item.producto_variantes.nombre}`
              : item.productos?.nombre ?? "",
            cantidad: item.cantidad,
            precioUnitario:
              Number(item.precio_unitario) +
              Number(item.precio_extra_personalizacion || 0),
          }));

          const { sendOrderConfirmation } = await import(
            "@/lib/email/send"
          );
          const APP_URL =
            process.env.NEXT_PUBLIC_APP_URL ||
            process.env.NEXT_PUBLIC_SITE_URL ||
            "https://clubseminario.com.uy";

          await sendOrderConfirmation(email, {
            nombreCliente:
              perfil
                ? `${perfil.nombre} ${perfil.apellido}`
                : pedido.nombre_cliente || "",
            numeroPedido: pedido.numero_pedido,
            items: itemsConNombre,
            total: pedido.total,
            pedidoUrl: tieneCuenta
              ? `${APP_URL}/tienda/pedido/${pedidoId}`
              : undefined,
          });
        }
      } catch (emailError) {
        console.error("Error al enviar email de confirmación:", emailError);
      }

      return NextResponse.json({ success: true, estado: nuevoEstado });
    } else {
      // RECHAZAR

      // 3b. Cancelar: libera la reserva, revierte el efectivo del pago mixto,
      // cancela la donación y devuelve el uso del promocode (atómico).
      const { data: canc, error: cancError } = await db.rpc("cancelar_pedido", {
        p_pedido_id: pedidoId,
        p_motivo: motivo || "Transferencia rechazada",
        p_registrado_por: user?.id ?? null,
      });

      if (cancError || canc?.ok === false) {
        console.error("Error en cancelar_pedido:", cancError ?? canc);
        return NextResponse.json(
          { error: "Error al rechazar el pedido" },
          { status: 500 }
        );
      }

      // 4b. Update comprobante → rechazado
      await db
        .from("comprobantes")
        .update({
          estado: "rechazado",
          verificado_por: user?.id,
          verificado_at: new Date().toISOString(),
          motivo_rechazo: motivo || null,
        })
        .eq("pedido_id", pedidoId);

      // 5b. Send cancellation email
      try {
        const { email } = await resolverEmailPedido(db, pedido);
        if (email) {
          const { sendOrderCancelled } = await import("@/lib/email/send");
          await sendOrderCancelled(email, {
            nombreCliente: pedido.nombre_cliente || "",
            numeroPedido: pedido.numero_pedido,
            motivo:
              motivo || "La transferencia no pudo ser verificada.",
          });
        }
      } catch (emailError) {
        console.error("Error al enviar email de cancelación:", emailError);
      }

      return NextResponse.json({ success: true, estado: "cancelado" });
    }
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    console.error("Error al verificar pedido:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
