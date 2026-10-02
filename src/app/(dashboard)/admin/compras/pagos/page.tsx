import type { Metadata } from "next";
import { cargarCuentaCorriente, permisosCompras } from "@/lib/comercial/compras";
import { PagosLista } from "@/components/compras/pagos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Órdenes de pago" };

export default async function PagosPage() {
  const [permisos, cc] = await Promise.all([permisosCompras(), cargarCuentaCorriente()]);
  return <PagosLista pagos={cc.pagos} puedeOperar={permisos.puedeOperar} />;
}
