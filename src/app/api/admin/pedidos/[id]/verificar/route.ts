import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { z } from "zod";

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
    const db = createAdminClient();

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
      .select("id, estado, perfil_id, total, numero_pedido, nombre_cliente")
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

    // 2. Fetch pedido items
    const { data: pedidoItems } = await db
      .from("pedido_items")
      .select("producto_id, variante_id, cantidad")
      .eq("pedido_id", pedidoId);

    if (accion === "aprobar") {
      // 3a. Re-validate stock before approving
      if (pedidoItems) {
        for (const item of pedidoItems) {
          if (item.variante_id) {
            const { data: variante } = await db
              .from("producto_variantes")
              .select("stock_actual, nombre")
              .eq("id", item.variante_id)
              .single();

            if (variante && variante.stock_actual < item.cantidad) {
              return NextResponse.json(
                {
                  error: `Stock insuficiente para variante "${variante.nombre}". Disponible: ${variante.stock_actual}, necesario: ${item.cantidad}`,
                },
                { status: 400 }
              );
            }
          } else {
            const { data: producto } = await db
              .from("productos")
              .select("stock_actual, nombre")
              .eq("id", item.producto_id)
              .single();

            if (producto && producto.stock_actual < item.cantidad) {
              return NextResponse.json(
                {
                  error: `Stock insuficiente para "${producto.nombre}". Disponible: ${producto.stock_actual}, necesario: ${item.cantidad}`,
                },
                { status: 400 }
              );
            }
          }
        }

        // 4a. Deduct stock
        for (const item of pedidoItems) {
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
                referencia_id: pedidoId,
                registrado_por: user?.id,
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
                referencia_id: pedidoId,
                registrado_por: user?.id,
              });
            }
          }
        }
      }

      // 5a. Update pedido → preparando (verificar = confirmar pago)
      await db
        .from("pedidos")
        .update({
          estado: "preparando",
          updated_at: new Date().toISOString(),
        })
        .eq("id", pedidoId);

      // 6a. Update comprobante → verificado
      await db
        .from("comprobantes")
        .update({
          estado: "verificado",
          verificado_por: user?.id,
          verificado_at: new Date().toISOString(),
        })
        .eq("pedido_id", pedidoId);

      // 7a. Send confirmation email
      try {
        if (!pedido.perfil_id) throw new Error("No perfil_id");

        const { data: perfil } = await db
          .from("perfiles")
          .select("nombre, apellido")
          .eq("id", pedido.perfil_id!)
          .single();

        const { data: items } = await db
          .from("pedido_items")
          .select("producto_id, cantidad, precio_unitario")
          .eq("pedido_id", pedidoId);

        // Fetch product names for the email
        const itemsConNombre = [];
        if (items) {
          for (const item of items) {
            const { data: prod } = await db
              .from("productos")
              .select("nombre")
              .eq("id", item.producto_id)
              .single();
            itemsConNombre.push({
              nombre: prod?.nombre || "",
              cantidad: item.cantidad,
              precioUnitario: item.precio_unitario,
            });
          }
        }

        const { data: authUser } = await db.auth.admin.getUserById(
          pedido.perfil_id!
        );
        const email = authUser?.user?.email;

        if (email) {
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
            pedidoUrl: `${APP_URL}/tienda/pedido/${pedidoId}`,
          });
        }
      } catch (emailError) {
        console.error("Error al enviar email de confirmación:", emailError);
      }

      return NextResponse.json({ success: true, estado: "preparando" });
    } else {
      // RECHAZAR

      // 3b. Update pedido → cancelado, liberar reserva
      await db
        .from("pedidos")
        .update({
          estado: "cancelado",
          stock_reservado: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pedidoId);

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
        if (pedido.perfil_id) {
          const { data: authUser } = await db.auth.admin.getUserById(
            pedido.perfil_id
          );
          const email = authUser?.user?.email;

          if (email) {
            const { sendOrderCancelled } = await import("@/lib/email/send");
            await sendOrderCancelled(email, {
              nombreCliente: pedido.nombre_cliente || "",
              numeroPedido: pedido.numero_pedido,
              motivo:
                motivo || "La transferencia no pudo ser verificada.",
            });
          }
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
