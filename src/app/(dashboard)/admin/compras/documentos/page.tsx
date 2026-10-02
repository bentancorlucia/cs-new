import type { Metadata } from "next";
import { cargarCuentaCorriente, permisosCompras } from "@/lib/comercial/compras";
import { DocumentosLista } from "@/components/compras/documentos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Facturas y notas de proveedores" };

export default async function DocumentosPage() {
  const [permisos, cc] = await Promise.all([permisosCompras(), cargarCuentaCorriente()]);
  return <DocumentosLista documentos={cc.documentos} puedeOperar={permisos.puedeOperar} />;
}
