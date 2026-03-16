import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { z } from "zod";

const TIENDA_ROLES = ["super_admin", "tienda"];

const compraItemSchema = z.object({
  producto_id: z.number().positive(),
  variante_id: z.number().optional().nullable(),
  cantidad: z.number().int().positive("Cantidad debe ser mayor a 0"),
  costo_unitario: z.number().positive("Costo debe ser mayor a 0"),
});

const compraSchema = z.object({
  proveedor_id: z.number().positive("Seleccionar proveedor"),
  fecha_compra: z.string(),
  notas: z.string().optional().nullable(),
  items: z.array(compraItemSchema).min(1, "Agregar al menos un item"),
  confirmar: z.boolean().default(false),
});

// GET /api/admin/compras — listar compras
export async function GET(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = await createServerClient();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const estado = searchParams.get("estado") || "";
    const proveedor_id = searchParams.get("proveedor_id") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    let query = supabase
      .from("compras_proveedor")
      .select("*, proveedores(id, nombre)", { count: "exact" })
      .order("created_at", { ascending: false });

    if (search) {
      query = query.ilike("numero_compra", `%${search}%`);
    }

    if (estado) {
      query = query.eq("estado", estado as "borrador" | "confirmada" | "recibida" | "cancelada");
    }

    if (proveedor_id) {
      query = query.eq("proveedor_id", parseInt(proveedor_id));
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/admin/compras — crear compra
export async function POST(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const user = await getCurrentUser();
    const supabase = await createServerClient();
    const body = await request.json();
    const parsed = compraSchema.parse(body);
    const db = supabase as any;

    // Calcular totales
    const subtotal = parsed.items.reduce(
      (sum, item) => sum + item.cantidad * item.costo_unitario,
      0
    );

    // Generar número de compra
    const { count } = await db
      .from("compras_proveedor")
      .select("id", { count: "exact", head: true });
    const numero = `CMP-${String((count || 0) + 1).padStart(4, "0")}`;

    const estado = parsed.confirmar ? "confirmada" : "borrador";

    // Crear compra
    const { data: compra, error: compraError } = await db
      .from("compras_proveedor")
      .insert({
        numero_compra: numero,
        proveedor_id: parsed.proveedor_id,
        estado,
        subtotal,
        impuestos: 0,
        total: subtotal,
        fecha_compra: parsed.fecha_compra,
        notas: parsed.notas || null,
        registrado_por: user?.id,
      })
      .select()
      .single();

    if (compraError) throw compraError;

    // Crear items
    const items = parsed.items.map((item) => ({
      compra_id: compra.id,
      producto_id: item.producto_id,
      variante_id: item.variante_id || null,
      cantidad: item.cantidad,
      costo_unitario: item.costo_unitario,
      subtotal: item.cantidad * item.costo_unitario,
    }));

    const { error: itemsError } = await db
      .from("compra_items")
      .insert(items);

    if (itemsError) throw itemsError;

    // Si se confirma, el trigger en DB actualiza saldo_cuenta_corriente
    // Pero el trigger sólo se activa en UPDATE, no en INSERT con estado 'confirmada'
    // Así que si confirmamos directo, primero insertamos como borrador y luego actualizamos
    if (parsed.confirmar) {
      // Re-set estado para que el trigger detecte el cambio
      await db
        .from("compras_proveedor")
        .update({ estado: "borrador" })
        .eq("id", compra.id);

      await db
        .from("compras_proveedor")
        .update({ estado: "confirmada" })
        .eq("id", compra.id);
    }

    return NextResponse.json({ data: compra }, { status: 201 });
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
    return NextResponse.json(
      { error: error.message || "Error al crear compra" },
      { status: 500 }
    );
  }
}
