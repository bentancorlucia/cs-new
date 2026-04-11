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

    // 1. Validar stock de cada item (por variante si aplica)
    for (const item of parsed.items) {
      if (item.variante_id) {
        const { data: variante, error } = await db
          .from("producto_variantes")
          .select("stock_actual, nombre, producto_id")
          .eq("id", item.variante_id)
          .eq("producto_id", item.producto_id)
          .single();

        if (error || !variante) {
          return NextResponse.json(
            { error: `Variante ${item.variante_id} no encontrada` },
            { status: 404 }
          );
        }

        if ((variante.stock_actual as number) < item.cantidad) {
          return NextResponse.json(
            {
              error: `Stock insuficiente para variante "${variante.nombre}". Disponible: ${variante.stock_actual}`,
            },
            { status: 400 }
          );
        }
      } else {
        const { data: producto, error } = await db
          .from("productos")
          .select("stock_actual, nombre")
          .eq("id", item.producto_id)
          .single();

        if (error || !producto) {
          return NextResponse.json(
            { error: `Producto ${item.producto_id} no encontrado` },
            { status: 404 }
          );
        }

        if ((producto.stock_actual as number) < item.cantidad) {
          return NextResponse.json(
            {
              error: `Stock insuficiente para "${producto.nombre}". Disponible: ${producto.stock_actual}`,
            },
            { status: 400 }
          );
        }
      }
    }

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

    // 4. Crear items del pedido
    const pedidoItems = parsed.items.map((item) => ({
      pedido_id: pedido.id,
      producto_id: item.producto_id,
      variante_id: item.variante_id || null,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      subtotal: item.precio_unitario * item.cantidad,
    }));

    const { error: itemsError } = await db
      .from("pedido_items")
      .insert(pedidoItems);

    if (itemsError) throw itemsError;

    // 5. Si es efectivo, descontar stock inmediatamente
    if (parsed.metodo_pago === "efectivo") {
      for (const item of parsed.items) {
        if (item.variante_id) {
          // Descontar stock de la variante
          const { data: variante } = await db
            .from("producto_variantes")
            .select("stock_actual")
            .eq("id", item.variante_id)
            .single();

          const stockAnterior = variante.stock_actual as number;
          const stockNuevo = stockAnterior - item.cantidad;

          await db
            .from("producto_variantes")
            .update({ stock_actual: stockNuevo })
            .eq("id", item.variante_id);

          // Recalcular stock total del producto (suma de variantes activas)
          const { data: todasVariantes } = await db
            .from("producto_variantes")
            .select("stock_actual")
            .eq("producto_id", item.producto_id)
            .eq("activo", true);

          const stockTotal = (todasVariantes || []).reduce(
            (sum: number, v: any) => sum + (v.stock_actual as number),
            0
          );

          await db
            .from("productos")
            .update({
              stock_actual: stockTotal,
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.producto_id);

          await db.from("stock_movimientos").insert({
            producto_id: item.producto_id,
            variante_id: item.variante_id,
            tipo: "venta",
            cantidad: -item.cantidad,
            stock_anterior: stockAnterior,
            stock_nuevo: stockNuevo,
            referencia_tipo: "pedido",
            referencia_id: pedido.id,
            motivo: `Venta POS #${pedido.numero_pedido}`,
            registrado_por: user?.id,
          });
        } else {
          // Producto sin variantes — descontar directo
          const { data: producto } = await db
            .from("productos")
            .select("stock_actual")
            .eq("id", item.producto_id)
            .single();

          const stockAnterior = producto.stock_actual as number;
          const stockNuevo = stockAnterior - item.cantidad;

          await db
            .from("productos")
            .update({
              stock_actual: stockNuevo,
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.producto_id);

          await db.from("stock_movimientos").insert({
            producto_id: item.producto_id,
            variante_id: null,
            tipo: "venta",
            cantidad: -item.cantidad,
            stock_anterior: stockAnterior,
            stock_nuevo: stockNuevo,
            referencia_tipo: "pedido",
            referencia_id: pedido.id,
            motivo: `Venta POS #${pedido.numero_pedido}`,
            registrado_por: user?.id,
          });
        }
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
