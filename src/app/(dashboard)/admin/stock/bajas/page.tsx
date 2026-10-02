import type { Metadata } from "next";
import { BajasLista, type BajaResumen } from "@/components/stock/bajas";
import { nombreUsuario } from "@/lib/comercial/stock";
import { leerPaginado } from "@/lib/contabilidad/reportes";
import { comercialSinTipos, nombresUsuarios, permisosStock, type FilaBaja, type FilaBajaItem } from "../_lib/extra";

export const metadata: Metadata = { title: "Bajas de mercadería" };
export const dynamic = "force-dynamic";

export default async function BajasPage() {
  const { puedeOperar } = await permisosStock();
  const com = await comercialSinTipos();
  const [bajas, items] = await Promise.all([
    leerPaginado<FilaBaja>((a, b) => com.from("bajas").select("*").order("id", { ascending: false }).range(a, b)),
    leerPaginado<Pick<FilaBajaItem, "baja_id" | "cantidad" | "valor">>((a, b) =>
      com.from("baja_items").select("baja_id, cantidad, valor").order("id").range(a, b)
    ),
  ]);
  const nombres = await nombresUsuarios(bajas.filas.map((b) => b.creado_por));
  const tot = new Map<number, { unidades: number; valor: number }>();
  for (const i of items.filas) {
    const t = tot.get(i.baja_id) ?? { unidades: 0, valor: 0 };
    t.unidades += i.cantidad;
    t.valor += Number(i.valor);
    tot.set(i.baja_id, t);
  }
  const lista: BajaResumen[] = bajas.filas.map((b) => ({
    id: b.id,
    numero: b.numero,
    fecha: b.fecha,
    tipo: b.tipo,
    descripcion: b.descripcion,
    creadoPor: nombreUsuario(b.creado_por, nombres),
    unidades: tot.get(b.id)?.unidades ?? 0,
    valor: puedeOperar ? tot.get(b.id)?.valor ?? 0 : null,
  }));
  return <BajasLista bajas={lista} error={bajas.error ?? items.error} />;
}
