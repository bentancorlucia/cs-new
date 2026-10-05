import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { enviosOrdenCompra, obtenerOrdenCompra, obtenerProveedor, permisosCompras } from "@/lib/comercial/compras";
import { OrdenDetalle } from "@/components/compras/orden-detalle";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Orden de compra" };

export default async function OrdenPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [permisos, orden, envios] = await Promise.all([permisosCompras(), obtenerOrdenCompra(id), enviosOrdenCompra(id)]);
  if (!orden) notFound();
  const proveedor = await obtenerProveedor(orden.proveedor_id);
  return (
    <OrdenDetalle
      orden={orden}
      puedeOperar={permisos.puedeOperar}
      emailProveedor={proveedor?.contacto_email ?? null}
      envios={envios}
    />
  );
}
