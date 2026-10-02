import { createComercialClient } from "@/lib/comercial/server";
import type { Metadata } from "next";
import { StockCliente } from "@/components/stock/stock-cliente";
import { cargarStock, controlMercaderia } from "./_lib/datos";
import { centrosCosto, permisosStock } from "./_lib/extra";

export const metadata: Metadata = { title: "Stock" };
export const dynamic = "force-dynamic";

export default async function AdminStockPage({
  searchParams,
}: {
  searchParams: Promise<{ baja?: string }>;
}) {
  const [{ baja }, { puedeOperar, puedeInventario }] = await Promise.all([searchParams, permisosStock()]);
  // Costo y valor: solo operadores (tienda, tesorero, super_admin).
  const verCostos = puedeOperar;
  const com = await createComercialClient();
  const [{ productos, error }, control, centros, borradores] = await Promise.all([
    cargarStock({ verCostos }),
    verCostos ? controlMercaderia() : Promise.resolve(null),
    puedeOperar ? centrosCosto() : Promise.resolve([]),
    com.from("recuentos").select("id", { count: "exact", head: true }).eq("estado", "borrador"),
  ]);

  return (
    <StockCliente
      productos={productos}
      control={control}
      verCostos={verCostos}
      puedeOperar={puedeOperar}
      puedeInventario={puedeInventario}
      bajaInicial={baja && /^\d+:\d+$/.test(baja) ? baja : null}
      centros={centros}
      recuentosAbiertos={borradores.count ?? 0}
      error={error}
    />
  );
}
