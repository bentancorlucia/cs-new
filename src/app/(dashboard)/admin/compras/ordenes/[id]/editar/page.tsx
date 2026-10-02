import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  listarProductosOpciones,
  listarProveedoresOpciones,
  obtenerOrdenCompra,
  permisosCompras,
} from "@/lib/comercial/compras";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { OrdenForm } from "@/components/compras/orden-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Editar orden de compra" };

export default async function EditarOrdenPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [permisos, orden, proveedores, productos] = await Promise.all([
    permisosCompras(),
    obtenerOrdenCompra(id),
    listarProveedoresOpciones(),
    listarProductosOpciones(),
  ]);
  if (!orden) notFound();
  if (!permisos.puedeOperar || orden.estado !== "borrador") redirect(`/admin/compras/ordenes/${id}`);
  return <OrdenForm proveedores={proveedores} productos={productos} hoy={hoyUruguay()} orden={orden} />;
}
