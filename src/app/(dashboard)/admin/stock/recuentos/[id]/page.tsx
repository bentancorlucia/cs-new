import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RecuentoEditor } from "@/components/stock/recuento-editor";
import { RecuentoDetalle, type FilaDetalleRecuento } from "@/components/stock/recuento-detalle";
import { nombreUsuario } from "@/lib/comercial/stock";
import { cargarStock } from "../../_lib/datos";
import {
  comercialSinTipos,
  nombresItems,
  nombresUsuarios,
  permisosStock,
  type FilaRecuento,
  type FilaRecuentoItem,
} from "../../_lib/extra";

export const metadata: Metadata = { title: "Recuento" };
export const dynamic = "force-dynamic";

export default async function RecuentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { puedeOperar } = await permisosStock();
  const com = await comercialSinTipos();

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
    estado: recuento.estado,
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
    const guardados: Record<string, number> = {};
    for (const it of items) {
      const clave = clavePorItem.get(it.item_id);
      if (clave) guardados[clave] = it.contado;
    }
    return <RecuentoEditor recuento={cabecera} guardados={guardados} productos={productos} error={error} />;
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
