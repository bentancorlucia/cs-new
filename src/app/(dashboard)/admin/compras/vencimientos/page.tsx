import type { Metadata } from "next";
import { permisosCompras, vencimientosDelClub } from "@/lib/comercial/compras";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { Vencimientos } from "@/components/compras/vencimientos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vencimientos de proveedores" };

export default async function VencimientosPage() {
  const [permisos, datos] = await Promise.all([permisosCompras(), vencimientosDelClub()]);
  return <Vencimientos {...datos} hoy={hoyUruguay()} puedeOperar={permisos.puedeOperar} />;
}
