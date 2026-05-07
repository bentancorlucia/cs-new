import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";

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

      const { error: errMov } = await db.from("stock_movimientos").insert({
        producto_id: item.producto_id,
        variante_id: item.variante_id || null,
        deposito_id: DEPOSITO_PRINCIPAL_ID,
        tipo: "entrada",
        cantidad: item.cantidad,
        stock_anterior: cantidadAnterior,
        stock_nuevo: cantidadNueva,
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

    // Sincronizar columnas cacheadas productos.stock_actual / producto_variantes.stock_actual
    const productosUnicos = Array.from(
      new Set(compra.compra_items.map((i: any) => i.producto_id as number))
    );
    for (const pid of productosUnicos) {
      const { error: errRpc } = await db.rpc("recalcular_stock_producto", {
        p_producto_id: pid,
      });
      if (errRpc) throw errRpc;
    }

    // Marcar compra como recibida
    const { data, error } = await db
      .from("compras_proveedor")
      .update({
        estado: "recibida",
        fecha_recepcion: new Date().toISOString().split("T")[0],
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
