import type { Metadata } from "next";
import { obtenerDashboardTienda } from "@/lib/tienda/dashboard";
import { puedeVerReportes } from "@/lib/reportes/acceso";
import { DashboardCliente } from "@/components/tienda/dashboard/dashboard-cliente";
import type { DashboardTienda } from "@/types/reportes";

export const metadata: Metadata = { title: "Panel Tienda" };
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  // El proxy ya exige rol de tienda; se vuelve a validar porque el panel lee con service role.
  if (!(await puedeVerReportes())) {
    return <DashboardCliente data={null} error="No tenés permiso para ver el panel de la tienda." />;
  }

  let data: DashboardTienda | null = null;
  let error: string | null = null;
  try {
    data = await obtenerDashboardTienda();
  } catch (e) {
    console.error("[admin/dashboard]", e);
    error = e instanceof Error ? e.message : "Error al leer los datos";
  }
  return <DashboardCliente data={data} error={error} />;
}
