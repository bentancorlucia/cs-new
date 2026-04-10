import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { z } from "zod";

const TIENDA_ROLES = ["super_admin", "tienda"];

const ajusteSchema = z.object({
  producto_id: z.number().positive(),
  variante_id: z.number().positive().optional().nullable(),
  cantidad: z.number().int(),
  motivo: z.string().min(1, "Motivo requerido"),
});

// POST /api/admin/stock/ajuste — ajuste manual de stock
export async function POST(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = await createServerClient();
    const user = await getCurrentUser();
    const body = await request.json();
    const parsed = ajusteSchema.parse(body);

    // Cast for admin operations
    const db = supabase as any;

    if (parsed.variante_id) {
      // --- Ajuste a nivel de variante ---
      const { data: variante, error: varError } = await db
        .from("producto_variantes")
        .select("stock_actual, producto_id")
        .eq("id", parsed.variante_id)
        .eq("producto_id", parsed.producto_id)
        .single();

      if (varError || !variante) {
        return NextResponse.json(
          { error: "Variante no encontrada" },
          { status: 404 }
        );
      }

      const stockAnterior = variante.stock_actual as number;
      const stockNuevo = stockAnterior + parsed.cantidad;

      if (stockNuevo < 0) {
        return NextResponse.json(
          { error: "El stock no puede ser negativo" },
          { status: 400 }
        );
      }

      // Actualizar stock de la variante
      const { error: updateError } = await db
        .from("producto_variantes")
        .update({ stock_actual: stockNuevo })
        .eq("id", parsed.variante_id);

      if (updateError) throw updateError;

      // Recalcular stock total del producto como suma de variantes activas
      const { data: variantes } = await db
        .from("producto_variantes")
        .select("stock_actual")
        .eq("producto_id", parsed.producto_id)
        .eq("activo", true);

      const totalStock = (variantes || []).reduce(
        (sum: number, v: any) => sum + (v.stock_actual as number),
        0
      );

      await db
        .from("productos")
        .update({ stock_actual: totalStock, updated_at: new Date().toISOString() })
        .eq("id", parsed.producto_id);

      // Registrar movimiento
      const { error: movError } = await db
        .from("stock_movimientos")
        .insert({
          producto_id: parsed.producto_id,
          variante_id: parsed.variante_id,
          tipo: "ajuste",
          cantidad: parsed.cantidad,
          stock_anterior: stockAnterior,
          stock_nuevo: stockNuevo,
          referencia_tipo: "ajuste_manual",
          motivo: parsed.motivo,
          registrado_por: user?.id,
        });

      if (movError) throw movError;

      return NextResponse.json({
        data: {
          producto_id: parsed.producto_id,
          variante_id: parsed.variante_id,
          stock_anterior: stockAnterior,
          stock_nuevo: stockNuevo,
          ajuste: parsed.cantidad,
        },
      });
    }

    // --- Ajuste a nivel de producto (sin variante) ---
    const { data: producto, error: prodError } = await db
      .from("productos")
      .select("stock_actual")
      .eq("id", parsed.producto_id)
      .single();

    if (prodError || !producto) {
      return NextResponse.json(
        { error: "Producto no encontrado" },
        { status: 404 }
      );
    }

    const stockAnterior = producto.stock_actual as number;
    const stockNuevo = stockAnterior + parsed.cantidad;

    if (stockNuevo < 0) {
      return NextResponse.json(
        { error: "El stock no puede ser negativo" },
        { status: 400 }
      );
    }

    // Actualizar stock
    const { error: updateError } = await db
      .from("productos")
      .update({ stock_actual: stockNuevo, updated_at: new Date().toISOString() })
      .eq("id", parsed.producto_id);

    if (updateError) throw updateError;

    // Registrar movimiento
    const { error: movError } = await db
      .from("stock_movimientos")
      .insert({
        producto_id: parsed.producto_id,
        variante_id: null,
        tipo: "ajuste",
        cantidad: parsed.cantidad,
        stock_anterior: stockAnterior,
        stock_nuevo: stockNuevo,
        referencia_tipo: "ajuste_manual",
        motivo: parsed.motivo,
        registrado_por: user?.id,
      });

    if (movError) throw movError;

    return NextResponse.json({
      data: {
        producto_id: parsed.producto_id,
        stock_anterior: stockAnterior,
        stock_nuevo: stockNuevo,
        ajuste: parsed.cantidad,
      },
    });
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
