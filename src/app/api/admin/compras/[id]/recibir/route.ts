import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { uruguayDateKey } from "@/lib/timezone";

const TIENDA_ROLES = ["super_admin", "tienda"];

// POST /api/admin/compras/[id]/recibir — recibir mercadería
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const user = await getCurrentUser();
    const supabase = await createServerClient();
    const db = supabase as any;
    const admin = createAdminClient() as any;

    // Obtener compra con items
    const { data: compra, error: compraError } = await db
      .from("compras_proveedor")
      .select("*, compra_items(*)")
      .eq("id", parseInt(id))
      .single();

    if (compraError || !compra) {
      return NextResponse.json(
        { error: "Compra no encontrada" },
        { status: 404 }
      );
    }

    if (compra.estado !== "confirmada") {
      return NextResponse.json(
        { error: "Solo se pueden recibir compras confirmadas" },
        { status: 400 }
      );
    }

    const DEPOSITO_PRINCIPAL_ID = 1;

    // Para cada item: upsert en stock_deposito (fuente de verdad multi-depósito),
    // registrar movimiento, y actualizar cantidad recibida.
    for (const item of compra.compra_items) {
      const filtroDeposito = db
        .from("stock_deposito")
        .select("id, cantidad")
        .eq("producto_id", item.producto_id)
        .eq("deposito_id", DEPOSITO_PRINCIPAL_ID);

      const { data: filaDeposito, error: errSelectDep } = item.variante_id
        ? await filtroDeposito.eq("variante_id", item.variante_id).maybeSingle()
        : await filtroDeposito.is("variante_id", null).maybeSingle();

      if (errSelectDep) throw errSelectDep;

      // Si no existe fila en stock_deposito, sembrar con el stock_actual cacheado
      // del producto/variante para no perder stock pre-existente al recalcular.
      let cantidadAnterior = filaDeposito?.cantidad ?? 0;
      if (!filaDeposito) {
        const tablaCache = item.variante_id ? "producto_variantes" : "productos";
        const idCache = item.variante_id || item.producto_id;
        const { data: cached, error: errCache } = await db
          .from(tablaCache)
          .select("stock_actual")
          .eq("id", idCache)
          .single();
        if (errCache) throw errCache;
        cantidadAnterior = cached?.stock_actual ?? 0;
      }
      const cantidadNueva = cantidadAnterior + item.cantidad;

      if (filaDeposito) {
        const { error: errUpd } = await db
          .from("stock_deposito")
          .update({ cantidad: cantidadNueva, updated_at: new Date().toISOString() })
          .eq("id", filaDeposito.id);
        if (errUpd) throw errUpd;
      } else {
        const { error: errIns } = await db.from("stock_deposito").insert({
          producto_id: item.producto_id,
          variante_id: item.variante_id || null,
          deposito_id: DEPOSITO_PRINCIPAL_ID,
          cantidad: cantidadNueva,
        });
        if (errIns) throw errIns;
      }

      // Stock vendible (productos/variantes.stock_actual): se SUMA lo
      // recibido. No se recalcula desde stock_deposito porque las ventas no
      // descuentan de depósitos y recalcular "deshacía" lo vendido.
      const { data: inc, error: errInc } = await admin.rpc(
        "incrementar_stock_item",
        {
          p_producto_id: item.producto_id,
          p_variante_id: item.variante_id || null,
          p_cantidad: item.cantidad,
        }
      );
      if (errInc) throw errInc;
      if (inc?.ok === false) {
        throw new Error(`Producto ${item.producto_id} no encontrado al recibir`);
      }

      const { error: errMov } = await db.from("stock_movimientos").insert({
        producto_id: item.producto_id,
        variante_id: item.variante_id || null,
        deposito_id: DEPOSITO_PRINCIPAL_ID,
        tipo: "entrada",
        cantidad: item.cantidad,
        stock_anterior: inc.stock_anterior,
        stock_nuevo: inc.stock_nuevo,
        referencia_tipo: "compra",
        referencia_id: compra.id,
        motivo: `Recepción compra #${compra.numero_compra}`,
        registrado_por: user?.id,
      });
      if (errMov) throw errMov;

      const { error: errItem } = await db
        .from("compra_items")
        .update({ cantidad_recibida: item.cantidad })
        .eq("id", item.id);
      if (errItem) throw errItem;
    }

    // Marcar compra como recibida
    const { data, error } = await db
      .from("compras_proveedor")
      .update({
        estado: "recibida",
        fecha_recepcion: uruguayDateKey(new Date()),
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
