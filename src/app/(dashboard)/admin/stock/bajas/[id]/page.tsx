import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BajaDetalle } from "@/components/stock/bajas";
import { nombreUsuario } from "@/lib/comercial/stock";
import {
  centrosCosto,
  comercialSinTipos,
  nombresItems,
  nombresUsuarios,
  permisosStock,
  type FilaBaja,
  type FilaBajaItem,
} from "../../_lib/extra";

export const metadata: Metadata = { title: "Baja de mercadería" };
export const dynamic = "force-dynamic";

export default async function BajaPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const { puedeOperar } = await permisosStock();
  const com = await comercialSinTipos();
  const [{ data: b }, { data: its }, centros] = await Promise.all([
    com.from("bajas").select("*").eq("id", id).maybeSingle(),
    com.from("baja_items").select("*").eq("baja_id", id).order("id"),
    centrosCosto(),
  ]);
  if (!b) notFound();
  const baja = b as FilaBaja;
  const items = (its ?? []) as FilaBajaItem[];
  const [porItem, nombres] = await Promise.all([nombresItems(items.map((i) => i.item_id)), nombresUsuarios([baja.creado_por])]);

  return (
    <BajaDetalle
      baja={{
        id: baja.id,
        numero: baja.numero,
        fecha: baja.fecha,
        tipo: baja.tipo,
        descripcion: baja.descripcion,
        creado: baja.created_at,
        creadoPor: nombreUsuario(baja.creado_por, nombres),
        centro: centros.find((c) => c.id === baja.centro_costo_id)?.nombre ?? null,
        asientoId: baja.asiento_id,
      }}
      filas={items.map((i) => {
        const n = porItem.get(i.item_id);
        return {
          id: i.id,
          productoId: n?.productoId ?? null,
          varianteId: n?.varianteId ?? null,
          producto: n?.producto ?? `Ítem ${i.item_id}`,
          variante: n?.variante ?? null,
          sku: n?.sku ?? null,
          cantidad: i.cantidad,
          valor: puedeOperar ? Number(i.valor) : null,
        };
      })}
    />
  );
}
