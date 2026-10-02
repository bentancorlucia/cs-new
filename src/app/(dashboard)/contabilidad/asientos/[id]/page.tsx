import { notFound } from "next/navigation";
import { permisosContabilidad } from "@/lib/contabilidad/permisos";
import { obtenerAsientoDetalle } from "@/lib/contabilidad/asientos";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { AsientoDetalleVista } from "@/components/contabilidad/asientos/asiento-detalle";

export const dynamic = "force-dynamic";

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AsientoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!RE_UUID.test(id)) notFound();

  const [{ puedeEscribir }, asiento] = await Promise.all([permisosContabilidad(), obtenerAsientoDetalle(id)]);
  if (!asiento) notFound();

  return <AsientoDetalleVista asiento={asiento} puedeEscribir={puedeEscribir} hoy={hoyUruguay()} />;
}
