import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { z } from "zod";

const TIENDA_ROLES = ["super_admin", "tienda"];

const itemSchema = z.object({
  producto_id: z.number().positive(),
  variante_id: z.number().positive().optional().nullable(),
  cantidad: z.number().int().positive(),
  precio_unitario: z.number().min(0),
});

const pedidoSchema = z.object({
  disciplina_id: z.number().positive(),
  items: z.array(itemSchema).min(1, "Debe incluir al menos un item"),
  notas: z.string().optional().nullable(),
});

// GET /api/admin/pedidos-disciplina — listar pedidos de disciplinas
export async function GET(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = await createServerClient();

    const { searchParams } = new URL(request.url);
    const disciplinaId = searchParams.get("disciplina_id");

    let query = supabase
      .from("pedidos")
      .select(`
        *,
        disciplinas(id, nombre),
        perfiles!vendedor_id(nombre_completo),
        pedido_items(id, producto_id, cantidad, precio_unitario, subtotal, productos(id, nombre), producto_variantes(id, nombre))
      `)
      .eq("tipo", "disciplina" as any)
      .order("created_at", { ascending: false })
      .limit(50);

    if (disciplinaId) {
      query = query.eq("disciplina_id", parseInt(disciplinaId));
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/admin/pedidos-disciplina — crear pedido mayorista
export async function POST(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const user = await getCurrentUser();
    const supabase = await createServerClient();

    const body = await request.json();
    const parsed = pedidoSchema.parse(body);

    // Generate order number
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const { count } = await supabase
      .from("pedidos")
      .select("*", { count: "exact", head: true })
      .gte("created_at", now.toISOString().slice(0, 10));

    const numeroPedido = `CS-${dateStr}-${String((count || 0) + 1).padStart(3, "0")}`;

    // Calculate totals
    const subtotal = parsed.items.reduce(
      (sum, item) => sum + item.precio_unitario * item.cantidad,
      0
    );

    // Create order
    const { data: pedido, error: pedidoError } = await supabase
      .from("pedidos")
      .insert({
        numero_pedido: numeroPedido,
        tipo: "disciplina",
        estado: "pagado",
        subtotal,
        descuento: 0,
        total: subtotal,
        moneda: "UYU",
        metodo_pago: "cuenta_corriente",
        disciplina_id: parsed.disciplina_id,
        vendedor_id: user!.id,
        notas: parsed.notas || null,
      } as any)
      .select()
      .single();

    if (pedidoError) throw pedidoError;

    // Insert items
    const itemRows = parsed.items.map((item) => ({
      pedido_id: pedido.id,
      producto_id: item.producto_id,
      variante_id: item.variante_id || null,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      subtotal: item.precio_unitario * item.cantidad,
    }));

    const { error: itemsError } = await supabase
      .from("pedido_items")
      .insert(itemRows as any);

    if (itemsError) throw itemsError;

    // Deduct stock and log movements
    for (const item of parsed.items) {
      const table = item.variante_id ? "producto_variantes" : "productos";
      const idField = item.variante_id ? "id" : "id";
      const idValue = item.variante_id || item.producto_id;

      // Get current stock
      const { data: current } = await supabase
        .from(table)
        .select("stock_actual")
        .eq(idField, idValue)
        .single();

      const stockAnterior = current?.stock_actual || 0;
      const stockNuevo = Math.max(0, stockAnterior - item.cantidad);

      // Update stock
      await (supabase as any)
        .from(table)
        .update({ stock_actual: stockNuevo })
        .eq(idField, idValue);

      // If variant, also update product total
      if (item.variante_id) {
        const { data: variants } = await supabase
          .from("producto_variantes")
          .select("stock_actual")
          .eq("producto_id", item.producto_id);

        const totalStock = (variants || []).reduce(
          (sum: number, v: any) => sum + v.stock_actual,
          0
        );

        await (supabase as any)
          .from("productos")
          .update({ stock_actual: totalStock, updated_at: new Date().toISOString() })
          .eq("id", item.producto_id);
      }

      // Log stock movement
      await supabase.from("stock_movimientos").insert({
        producto_id: item.producto_id,
        variante_id: item.variante_id || null,
        tipo: "venta",
        cantidad: -item.cantidad,
        stock_anterior: stockAnterior,
        stock_nuevo: stockNuevo,
        referencia_tipo: "pedido",
        referencia_id: pedido.id,
        motivo: `Pedido mayorista disciplina`,
        registrado_por: user!.id,
      } as any);
    }

    return NextResponse.json({ data: pedido }, { status: 201 });
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
