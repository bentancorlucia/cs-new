import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { obtenerPago, permisosCompras } from "@/lib/comercial/compras";
import { PagoVista } from "@/components/compras/pagos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Orden de pago" };

export default async function PagoPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [permisos, pago] = await Promise.all([permisosCompras(), obtenerPago(id)]);
  if (!pago) notFound();
  return <PagoVista pago={pago} puedeOperar={permisos.puedeOperar} />;
}
