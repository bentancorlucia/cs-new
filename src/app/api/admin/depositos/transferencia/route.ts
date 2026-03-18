import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { z } from "zod";

const TIENDA_ROLES = ["super_admin", "tienda"];

const itemSchema = z.object({
  producto_id: z.number().positive(),
  variante_id: z.number().positive().optional().nullable(),
  cantidad: z.number().int().positive(),
});

const transferenciaSchema = z.object({
  deposito_origen_id: z.number().positive(),
  deposito_destino_id: z.number().positive(),
  notas: z.string().optional().nullable(),
  items: z.array(itemSchema).min(1, "Debe incluir al menos un item"),
});

// GET /api/admin/depositos/transferencia — listar transferencias
export async function GET(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = await createServerClient();

    const { searchParams } = new URL(request.url);
    const estado = searchParams.get("estado") || "";

    let query = supabase
      .from("transferencias_deposito")
      .select(
        `
        *,
        deposito_origen:depositos!deposito_origen_id(id, nombre),
        deposito_destino:depositos!deposito_destino_id(id, nombre),
        perfiles!registrado_por(nombre_completo),
        transferencia_items(id, producto_id, variante_id, cantidad, productos(id, nombre, sku), producto_variantes(id, nombre))
      `
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (estado) {
      query = query.eq("estado", estado);
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

// POST /api/admin/depositos/transferencia — crear y ejecutar transferencia
export async function POST(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const user = await getCurrentUser();
    const supabase = await createServerClient();
    const body = await request.json();
    const parsed = transferenciaSchema.parse(body);

    if (parsed.deposito_origen_id === parsed.deposito_destino_id) {
      return NextResponse.json(
        { error: "Origen y destino deben ser diferentes" },
        { status: 400 }
      );
    }

    // Validate stock availability in origin
    for (const item of parsed.items) {
      const { data: stockOrigen } = await supabase
        .from("stock_deposito")
        .select("cantidad")
        .eq("deposito_id", parsed.deposito_origen_id)
        .eq("producto_id", item.producto_id)
        .eq("variante_id", item.variante_id ?? null as any)
        .maybeSingle();

      const disponible = stockOrigen?.cantidad || 0;
      if (disponible < item.cantidad) {
        return NextResponse.json(
          {
            error: `Stock insuficiente para producto ${item.producto_id}${
              item.variante_id ? ` variante ${item.variante_id}` : ""
            }. Disponible: ${disponible}, solicitado: ${item.cantidad}`,
          },
          { status: 400 }
        );
      }
    }

    // Create transfer record
    const { data: transferencia, error: tError } = await supabase
      .from("transferencias_deposito")
      .insert({
        deposito_origen_id: parsed.deposito_origen_id,
        deposito_destino_id: parsed.deposito_destino_id,
        notas: parsed.notas || null,
        registrado_por: user.id,
        estado: "completada",
        completada_at: new Date().toISOString(),
      } as any)
      .select()
      .single();

    if (tError) throw tError;

    // Insert items
    const itemRows = parsed.items.map((item) => ({
      transferencia_id: transferencia.id,
      producto_id: item.producto_id,
      variante_id: item.variante_id || null,
      cantidad: item.cantidad,
    }));

    const { error: iError } = await supabase
      .from("transferencia_items")
      .insert(itemRows as any);

    if (iError) throw iError;

    // Execute stock movements
    for (const item of parsed.items) {
      // Decrease origin
      await supabase.rpc("transferir_stock_deposito" as any, {
        p_producto_id: item.producto_id,
        p_variante_id: item.variante_id || null,
        p_deposito_origen: parsed.deposito_origen_id,
        p_deposito_destino: parsed.deposito_destino_id,
        p_cantidad: item.cantidad,
      }).then(async (res: any) => {
        // If RPC doesn't exist, do it manually
        if (res.error) {
          // Decrease from origin
          const { data: origenStock } = await supabase
            .from("stock_deposito")
            .select("id, cantidad")
            .eq("deposito_id", parsed.deposito_origen_id)
            .eq("producto_id", item.producto_id)
            .eq("variante_id", item.variante_id ?? null as any)
            .single();

          if (origenStock) {
            await (supabase as any)
              .from("stock_deposito")
              .update({
                cantidad: origenStock.cantidad - item.cantidad,
                updated_at: new Date().toISOString(),
              })
              .eq("id", origenStock.id);
          }

          // Increase in destination (upsert)
          const { data: destinoStock } = await supabase
            .from("stock_deposito")
            .select("id, cantidad")
            .eq("deposito_id", parsed.deposito_destino_id)
            .eq("producto_id", item.producto_id)
            .eq("variante_id", item.variante_id ?? null as any)
            .maybeSingle();

          if (destinoStock) {
            await (supabase as any)
              .from("stock_deposito")
              .update({
                cantidad: destinoStock.cantidad + item.cantidad,
                updated_at: new Date().toISOString(),
              })
              .eq("id", destinoStock.id);
          } else {
            await supabase
              .from("stock_deposito")
              .insert({
                deposito_id: parsed.deposito_destino_id,
                producto_id: item.producto_id,
                variante_id: item.variante_id || null,
                cantidad: item.cantidad,
              } as any);
          }

          // Log stock movements
          const stockAnteriorOrigen = origenStock?.cantidad || 0;
          await supabase.from("stock_movimientos").insert([
            {
              producto_id: item.producto_id,
              variante_id: item.variante_id || null,
              tipo: "transferencia",
              cantidad: -item.cantidad,
              stock_anterior: stockAnteriorOrigen,
              stock_nuevo: stockAnteriorOrigen - item.cantidad,
              referencia_tipo: "transferencia",
              referencia_id: transferencia.id,
              motivo: `Transferencia a depósito destino`,
              registrado_por: user.id,
              deposito_id: parsed.deposito_origen_id,
            },
            {
              producto_id: item.producto_id,
              variante_id: item.variante_id || null,
              tipo: "transferencia",
              cantidad: item.cantidad,
              stock_anterior: destinoStock?.cantidad || 0,
              stock_nuevo: (destinoStock?.cantidad || 0) + item.cantidad,
              referencia_tipo: "transferencia",
              referencia_id: transferencia.id,
              motivo: `Transferencia desde depósito origen`,
              registrado_por: user.id,
              deposito_id: parsed.deposito_destino_id,
            },
          ] as any);
        }
      });
    }

    return NextResponse.json({ data: transferencia }, { status: 201 });
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
