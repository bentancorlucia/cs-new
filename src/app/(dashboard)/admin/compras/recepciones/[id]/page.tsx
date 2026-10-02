import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerRecepcion, permisosCompras } from "@/lib/comercial/compras";
import { RecepcionVista } from "@/components/compras/recepciones";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Recepción" };

export default async function RecepcionPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [permisos, recepcion] = await Promise.all([permisosCompras(), obtenerRecepcion(id)]);
  if (!recepcion) notFound();
  return <RecepcionVista recepcion={recepcion} puedeOperar={permisos.puedeOperar} />;
}
