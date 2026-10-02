import type { Metadata } from "next";
import { InventarioInicialCliente, type ItemInventario } from "@/components/stock/inventario-inicial-cliente";
import { cargarStock } from "../_lib/datos";
import { permisosStock } from "../_lib/extra";
import { createComercialClient } from "@/lib/comercial/server";
import { claveItem } from "@/lib/comercial/stock";

export const metadata: Metadata = { title: "Inventario inicial" };
export const dynamic = "force-dynamic";

export default async function InventarioInicialPage() {
  const { puedeInventario } = await permisosStock();
  if (!puedeInventario) {
    return <InventarioInicialCliente items={[]} conMovimientos={0} heredados={0} puedeOperar={false} error={null} />;
  }
  const com = await createComercialClient();
  const [{ productos, error }, { data: previos }] = await Promise.all([
    cargarStock({ verCostos: true }),
    // Último costo conocido antes del motor: sugerencia para el inventario inicial
    com.from("costos_previos").select("producto_id, variante_id, costo"),
  ]);
  const costoPrevio = new Map((previos ?? []).map((c) => [claveItem(c.producto_id, c.variante_id), Number(c.costo)]));

  const pendientes: ItemInventario[] = [];
  let conMovimientos = 0;
  let heredados = 0;
  for (const p of productos) {
    for (const i of p.items) {
      if (i.conMovimientos) {
        conMovimientos++;
        continue;
      }
      if (i.heredado) heredados++;
      pendientes.push({
        clave: i.clave,
        productoId: i.productoId,
        varianteId: i.varianteId,
        producto: p.nombre,
        variante: p.tieneVariantes ? i.nombre : null,
        sku: i.sku,
        activo: i.activo && (p.activo || p.activoPos),
        heredado: i.heredado ? i.stock : 0,
        costoSugerido: costoPrevio.get(i.clave) ?? null,
      });
    }
  }

  return (
    <InventarioInicialCliente
      items={pendientes}
      conMovimientos={conMovimientos}
      heredados={heredados}
      puedeOperar
      error={error}
    />
  );
}
