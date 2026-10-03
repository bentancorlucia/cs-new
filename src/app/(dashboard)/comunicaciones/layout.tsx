import { redirect } from "next/navigation";
import { permisosComunicaciones } from "@/lib/comunicaciones/server";
import { NavComunicaciones } from "@/components/comunicaciones/nav";

export default async function ComunicacionesLayout({ children }: { children: React.ReactNode }) {
  const { puedeVer, puedeGestionar, roles } = await permisosComunicaciones();
  if (!puedeVer) redirect("/mi-cuenta");
  return (
    <div className="space-y-5 pb-8">
      <NavComunicaciones puedeGestionar={puedeGestionar} esTienda={roles.includes("tienda")} />
      {children}
    </div>
  );
}
