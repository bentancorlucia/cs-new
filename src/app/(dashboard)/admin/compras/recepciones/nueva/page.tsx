import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  listarProductosOpciones,
  listarProveedoresOpciones,
  obtenerOrdenCompra,
  permisosCompras,
} from "@/lib/comercial/compras";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { RecepcionForm } from "@/components/compras/recepcion-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Recibir mercadería" };

export default async function NuevaRecepcionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const ordenId = Number(sp.orden);
  const prov = Number(sp.proveedor);
  const [permisos, proveedores, productos, orden] = await Promise.all([
    permisosCompras(),
    listarProveedoresOpciones(),
    listarProductosOpciones(),
    Number.isInteger(ordenId) && ordenId > 0 ? obtenerOrdenCompra(ordenId) : Promise.resolve(null),
  ]);
  if (!permisos.puedeOperar) redirect("/admin/compras/recepciones");
  if (sp.orden && !orden) notFound();
  if (orden && !["aprobada", "recibida_parcial"].includes(orden.estado)) redirect(`/admin/compras/ordenes/${orden.id}`);
  return (
    <RecepcionForm
      orden={orden}
      proveedores={proveedores}
      productos={productos}
      hoy={hoyUruguay()}
      proveedorInicial={Number.isInteger(prov) && prov > 0 ? prov : null}
    />
  );
}
