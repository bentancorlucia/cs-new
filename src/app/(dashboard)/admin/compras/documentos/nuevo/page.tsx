import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  cargarCatalogoContable,
  listarProductosOpciones,
  listarProveedoresOpciones,
  permisosCompras,
} from "@/lib/comercial/compras";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { DocumentoForm } from "@/components/compras/documento-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cargar documento de proveedor" };

const TIPOS = ["factura", "nota_credito", "nota_debito"] as const;

export default async function NuevoDocumentoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const [permisos, proveedores, productos, catalogo] = await Promise.all([
    permisosCompras(),
    listarProveedoresOpciones(),
    listarProductosOpciones(),
    cargarCatalogoContable(),
  ]);
  if (!permisos.puedeOperar) redirect("/admin/compras/documentos");
  const prov = Number(sp.proveedor);
  const tipo = TIPOS.find((t) => t === sp.tipo) ?? "factura";
  const moneda = sp.moneda === "USD" || sp.moneda === "UYU" ? sp.moneda : null;
  return (
    <DocumentoForm
      proveedores={proveedores}
      productos={productos}
      catalogo={catalogo}
      hoy={hoyUruguay()}
      proveedorInicial={Number.isInteger(prov) && prov > 0 ? prov : null}
      tipoInicial={tipo}
      monedaInicial={moneda}
    />
  );
}
