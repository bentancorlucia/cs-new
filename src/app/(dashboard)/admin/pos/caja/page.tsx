import { redirect } from "next/navigation";
import { permisosComercial } from "@/lib/comercial/server";
import { leerHistorialCaja } from "@/lib/comercial/caja";
import { HistorialCaja } from "@/components/caja/historial-caja";

export const metadata = {
  title: "Historial de caja",
  description: "Sesiones de la caja del POS con su arqueo y asientos",
};

export const dynamic = "force-dynamic";

const ROLES_CONTABILIDAD = ["super_admin", "tesorero", "comision_fiscal"];

export default async function HistorialCajaPage() {
  const { puedeVer, roles } = await permisosComercial();
  if (!puedeVer) redirect("/login");
  const { caja, sesiones, error } = await leerHistorialCaja(40);
  return (
    <HistorialCaja
      nombreCaja={caja?.nombre ?? "Caja"}
      sesiones={sesiones}
      error={error}
      verAsientos={roles.some((r) => ROLES_CONTABILIDAD.includes(r))}
    />
  );
}
