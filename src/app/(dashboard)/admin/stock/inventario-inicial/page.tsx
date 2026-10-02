import type { Metadata } from "next";
import { permisosComercial } from "@/lib/comercial/server";
import { InventarioInicialCliente, type ItemInventario } from "@/components/stock/inventario-inicial-cliente";
import { cargarStock } from "../_lib/datos";

export const metadata: Metadata = { title: "Inventario inicial" };
export const dynamic = "force-dynamic";

export default async function InventarioInicialPage() {
  const { puedeOperar } = await permisosComercial();
  const { productos, error } = await cargarStock({ verCostos: puedeOperar });

  const pendientes: ItemInventario[] = [];
  let conMovimientos = 0;
  let heredados = 0;
  for (const p of productos) {
    for (const i of p.items) {
      if (i.conMovimientos) conMovimientos++;
      else if (i.heredado) heredados++;
      else
        pendientes.push({
          clave: i.clave,
          productoId: i.productoId,
          varianteId: i.varianteId,
          producto: p.nombre,
          variante: p.tieneVariantes ? i.nombre : null,
          sku: i.sku,
          activo: i.activo && (p.activo || p.activoPos),
        });
    }
  }

  return (
    <InventarioInicialCliente
      items={pendientes}
      conMovimientos={conMovimientos}
      heredados={heredados}
      puedeOperar={puedeOperar}
      error={error}
    />
  );
}
