import { redirect } from "next/navigation";
import { permisosCuotas } from "@/lib/socios/cuotas-permisos";
import { NavCuotas } from "@/components/socios/cuotas/ui";

export default async function CuotasLayout({ children }: { children: React.ReactNode }) {
  const { puedeVer, verTesoreria } = await permisosCuotas();
  if (!puedeVer) redirect("/mi-cuenta");
  return (
    <div className="min-w-0 space-y-5 pb-8">
      <NavCuotas verTesoreria={verTesoreria} />
      {children}
    </div>
  );
}
