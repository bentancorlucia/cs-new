import type { Metadata } from "next";
import { permisosComercial } from "@/lib/comercial/server";
import { StockCliente } from "@/components/stock/stock-cliente";
import { cargarStock, controlMercaderia } from "./_lib/datos";

export const metadata: Metadata = { title: "Stock" };
export const dynamic = "force-dynamic";

export default async function AdminStockPage({
  searchParams,
}: {
  searchParams: Promise<{ ajustar?: string }>;
}) {
  const [{ ajustar }, { puedeOperar }] = await Promise.all([searchParams, permisosComercial()]);
  // Costo y valor: solo operadores (tienda, tesorero, super_admin).
  const verCostos = puedeOperar;
  const [{ productos, error }, control] = await Promise.all([
    cargarStock({ verCostos }),
    verCostos ? controlMercaderia() : Promise.resolve(null),
  ]);

  return (
    <StockCliente
      productos={productos}
      control={control}
      verCostos={verCostos}
      puedeOperar={puedeOperar}
      ajustarInicial={ajustar && /^\d+:\d+$/.test(ajustar) ? ajustar : null}
      error={error}
    />
  );
}
