import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listarProductosOpciones, listarProveedoresOpciones, permisosCompras } from "@/lib/comercial/compras";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { OrdenForm } from "@/components/compras/orden-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nueva orden de compra" };

export default async function NuevaOrdenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const [permisos, proveedores, productos] = await Promise.all([
    permisosCompras(),
    listarProveedoresOpciones(),
    listarProductosOpciones(),
  ]);
  if (!permisos.puedeOperar) redirect("/admin/compras");
  const prov = Number(sp.proveedor);
  return (
    <OrdenForm
      proveedores={proveedores}
      productos={productos}
      hoy={hoyUruguay()}
      proveedorInicial={Number.isInteger(prov) && prov > 0 ? prov : null}
    />
  );
}
