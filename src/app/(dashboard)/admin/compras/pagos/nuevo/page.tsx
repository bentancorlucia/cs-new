import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cargarCatalogoContable, listarProveedoresOpciones, permisosCompras } from "@/lib/comercial/compras";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { PagoForm } from "@/components/compras/pago-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nueva orden de pago" };

export default async function NuevoPagoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const [permisos, proveedores, catalogo] = await Promise.all([
    permisosCompras(),
    listarProveedoresOpciones(),
    cargarCatalogoContable(),
  ]);
  if (!permisos.puedeOperar) redirect("/admin/compras/pagos");
  const prov = Number(sp.proveedor);
  const doc = Number(sp.documento);
  const moneda = sp.moneda === "USD" || sp.moneda === "UYU" ? sp.moneda : null;
  return (
    <PagoForm
      proveedores={proveedores}
      catalogo={catalogo}
      hoy={hoyUruguay()}
      proveedorInicial={Number.isInteger(prov) && prov > 0 ? prov : null}
      monedaInicial={moneda}
      documentoInicial={Number.isInteger(doc) && doc > 0 ? doc : null}
    />
  );
}
