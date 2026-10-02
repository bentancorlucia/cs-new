import { createComercialClient } from "@/lib/comercial/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecuentoEditor } from "@/components/stock/recuento-editor";
import { RecuentoDetalle, type FilaDetalleRecuento } from "@/components/stock/recuento-detalle";
import { claveItem, nombreUsuario, type EstadoRecuento } from "@/lib/comercial/stock";
import { leerPaginado } from "@/lib/contabilidad/reportes";
import { cargarStock, type ProductoStock } from "../../_lib/datos";
import {
  nombresItems,
  nombresUsuarios,
  permisosStock,
  type FilaRecuento,
  type FilaRecuentoItem,
} from "../../_lib/extra";

export const metadata: Metadata = { title: "Recuento" };
export const dynamic = "force-dynamic";

/**
 * Costo con que la base valuaría un sobrante, en el mismo orden que
 * confirmar_recuento (sin el indicado al contar): promedio vigente, último
 * costo del ítem, promedio de los otros talles, costo previo al motor.
 * null = hay que indicarlo en el recuento.
 */
async function costosDeReferencia(productos: ProductoStock[]): Promise<Record<string, number | null>> {
  const com = await createComercialClient();
  const sinStock = productos.flatMap((p) => p.items.filter((i) => i.stock === 0 && i.itemId !== null).map((i) => i.itemId as number));
  const ultimo = new Map<number, number>();
  for (let k = 0; k < sinStock.length; k += 200) {
    const lote = sinStock.slice(k, k + 200);
    const r = await leerPaginado<{ item_id: number; costo_unitario: number }>((a, b) =>
      com
        .from("movimientos")
        .select("item_id, costo_unitario")
        .in("item_id", lote)
        .gt("costo_unitario", 0)
        .order("id", { ascending: false })
        .range(a, b)
    );
    for (const m of r.filas) if (!ultimo.has(m.item_id)) ultimo.set(m.item_id, Number(m.costo_unitario));
  }
  const { data: previos } = await com.from("costos_previos").select("producto_id, variante_id, costo");
  const previo = new Map((previos ?? []).map((c) => [claveItem(c.producto_id, c.variante_id), Number(c.costo)]));

  const ref: Record<string, number | null> = {};
  for (const p of productos) {
    for (const i of p.items) {
      const otros = p.items.filter((o) => o.clave !== i.clave && o.stock > 0 && o.itemId !== null);
      const stockOtros = otros.reduce((s, o) => s + o.stock, 0);
      ref[i.clave] =
        (i.stock > 0 ? i.valor / i.stock : null) ??
        (i.itemId !== null ? ultimo.get(i.itemId) ?? null : null) ??
        (stockOtros > 0 ? otros.reduce((s, o) => s + o.valor, 0) / stockOtros : null) ??
        previo.get(i.clave) ??
        null;
    }
  }
  return ref;
}

export default async function RecuentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { puedeOperar } = await permisosStock();
  const com = await createComercialClient();

  let recuento: FilaRecuento | null = null;
  let items: FilaRecuentoItem[] = [];
  if (id !== "nuevo") {
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) notFound();
    const [{ data: r }, { data: its }] = await Promise.all([
      com.from("recuentos").select("*").eq("id", n).maybeSingle(),
      com.from("recuento_items").select("*").eq("recuento_id", n).order("id"),
    ]);
    if (!r) notFound();
    recuento = r as FilaRecuento;
    items = (its ?? []) as FilaRecuentoItem[];
  }

  const nombres = await nombresUsuarios([recuento?.creado_por ?? null, recuento?.confirmado_por ?? null]);
  const cabecera = recuento && {
    id: recuento.id,
    numero: recuento.numero,
    estado: recuento.estado as EstadoRecuento,
    notas: recuento.notas,
    creado: recuento.created_at,
    creadoPor: nombreUsuario(recuento.creado_por, nombres),
    confirmado: recuento.confirmado_at,
    confirmadoPor: nombreUsuario(recuento.confirmado_por, nombres),
    asientoId: recuento.asiento_id,
  };

  // Borrador (o nuevo): se edita con el stock actual a la vista.
  if (puedeOperar && (!recuento || recuento.estado === "borrador")) {
    const { productos, error } = await cargarStock({ verCostos: true });
    const clavePorItem = new Map(
      productos.flatMap((p) => p.items.filter((i) => i.itemId !== null).map((i) => [i.itemId as number, i.clave]))
    );
    const guardados: Record<string, { contado: number; costo: number | null }> = {};
    for (const it of items) {
      const clave = clavePorItem.get(it.item_id);
      if (clave) guardados[clave] = { contado: it.contado, costo: it.costo_unitario === null ? null : Number(it.costo_unitario) };
    }
    const costoRef = await costosDeReferencia(productos);
    return (
      <RecuentoEditor recuento={cabecera} guardados={guardados} productos={productos} costoRef={costoRef} error={error} />
    );
  }
  if (!recuento || !cabecera) notFound();

  const porItem = await nombresItems(items.map((i) => i.item_id));
  const filas: FilaDetalleRecuento[] = items.map((i) => {
    const n = porItem.get(i.item_id);
    return {
      id: i.id,
      productoId: n?.productoId ?? null,
      varianteId: n?.varianteId ?? null,
      producto: n?.producto ?? `Ítem ${i.item_id}`,
      variante: n?.variante ?? null,
      sku: n?.sku ?? null,
      contado: i.contado,
      stockSistema: i.stock_sistema,
      diferencia: i.diferencia,
      valor: puedeOperar && i.valor !== null ? Number(i.valor) : null,
    };
  });

  return <RecuentoDetalle recuento={cabecera} filas={filas} verCostos={puedeOperar} />;
}
