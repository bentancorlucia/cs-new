import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerOrdenCompra, permisosCompras } from "@/lib/comercial/compras";
import { OrdenDetalle } from "@/components/compras/orden-detalle";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Orden de compra" };

export default async function OrdenPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [permisos, orden] = await Promise.all([permisosCompras(), obtenerOrdenCompra(id)]);
  if (!orden) notFound();
  return <OrdenDetalle orden={orden} puedeOperar={permisos.puedeOperar} />;
}
