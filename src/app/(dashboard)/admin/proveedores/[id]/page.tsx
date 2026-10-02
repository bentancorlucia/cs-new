import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cargarCatalogoContable, fichaProveedor, permisosCompras } from "@/lib/comercial/compras";
import { FichaProveedorVista } from "@/components/compras/ficha-proveedor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Proveedor" };

export default async function FichaProveedorPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [permisos, ficha, catalogo] = await Promise.all([
    permisosCompras(),
    fichaProveedor(id),
    cargarCatalogoContable(),
  ]);
  if (!ficha) notFound();
  return <FichaProveedorVista ficha={ficha} catalogo={catalogo} puedeOperar={permisos.puedeOperar} />;
}
