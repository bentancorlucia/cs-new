import type { Metadata } from "next";
import { listarOrdenesCompra, permisosCompras } from "@/lib/comercial/compras";
import { OrdenesLista } from "@/components/compras/ordenes-lista";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Órdenes de compra" };

export default async function OrdenesCompraPage() {
  const [permisos, ordenes] = await Promise.all([permisosCompras(), listarOrdenesCompra()]);
  return <OrdenesLista ordenes={ordenes} puedeOperar={permisos.puedeOperar} />;
}
