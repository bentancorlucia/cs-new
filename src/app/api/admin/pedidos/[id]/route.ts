import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { z } from "zod";

const TIENDA_ROLES = ["super_admin", "tienda"];

const estadoSchema = z.object({
  estado: z.enum([
    "pendiente",
    "pagado",
    "preparando",
    "listo_retiro",
    "retirado",
    "cancelado",
  ]),
  motivo_cancelacion: z.string().optional(),
});

// GET /api/admin/pedidos/[id] — detalle de pedido
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("pedidos")
      .select(
        `
        *,
        perfiles!perfil_id(id, nombre, apellido, telefono, cedula, es_socio),
        pedido_items(
          id, cantidad, precio_unitario, subtotal,
          productos(id, nombre, slug),
          producto_variantes(id, nombre)
        )
      `
      )
      .eq("id", parseInt(id))
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT /api/admin/pedidos/[id] — actualizar estado
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const supabase = createAdminClient();
    const body = await request.json();
    const parsed = estadoSchema.parse(body);

    // Use admin client directly (bypasses RLS for admin operations)
    const db = supabase as any;

    // Si se cancela, devolver stock
    if (parsed.estado === "cancelado") {
      const user = await getCurrentUser();
      const { data: pedido } = await db
        .from("pedidos")
        .select("id, estado")
        .eq("id", parseInt(id))
        .single();

      if (pedido && pedido.estado !== "cancelado") {
        const { data: items } = await db
          .from("pedido_items")
          .select("producto_id, variante_id, cantidad")
          .eq("pedido_id", parseInt(id));

        if (items) {
          for (const item of items as any[]) {
            const { data: prod } = await db
              .from("productos")
              .select("stock_actual")
              .eq("id", item.producto_id)
              .single();

            if (prod) {
              const nuevoStock = prod.stock_actual + item.cantidad;
              await db
                .from("productos")
                .update({ stock_actual: nuevoStock })
                .eq("id", item.producto_id);

              await db.from("stock_movimientos").insert({
                producto_id: item.producto_id,
                variante_id: item.variante_id,
                tipo: "devolucion",
                cantidad: item.cantidad,
                stock_anterior: prod.stock_actual,
                stock_nuevo: nuevoStock,
                referencia_tipo: "pedido",
                referencia_id: parseInt(id),
                motivo: parsed.motivo_cancelacion || "Pedido cancelado",
                registrado_por: user?.id,
              });
            }
          }
        }
      }
    }

    const { data, error } = await db
      .from("pedidos")
      .update({
        estado: parsed.estado,
        notas: parsed.estado === "cancelado" ? parsed.motivo_cancelacion : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parseInt(id))
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
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
