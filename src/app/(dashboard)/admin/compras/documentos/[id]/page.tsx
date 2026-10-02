import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerDocumento, permisosCompras } from "@/lib/comercial/compras";
import { DocumentoVista } from "@/components/compras/documentos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Documento de proveedor" };

export default async function DocumentoPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [permisos, documento] = await Promise.all([permisosCompras(), obtenerDocumento(id)]);
  if (!documento) notFound();
  return <DocumentoVista documento={documento} puedeOperar={permisos.puedeOperar} />;
}
