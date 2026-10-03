import type { Metadata } from "next";
import { cargarPlanes } from "@/lib/socios/padron";
import { permisosSocios } from "@/lib/socios/server";
import { Planes } from "@/components/socios/secretaria/planes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Planes y cuotas" };

export default async function PlanesPage() {
  const permisos = await permisosSocios();
  let datos: Awaited<ReturnType<typeof cargarPlanes>> | null = null;
  let error: string | null = null;
  try {
    datos = await cargarPlanes();
  } catch (e) {
    error = e instanceof Error ? e.message : "error inesperado";
  }
  if (!datos) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        No se pudieron leer los planes: {error}
      </div>
    );
  }
  return (
    <Planes
      planes={datos.planes}
      disciplinas={datos.disciplinas}
      hoy={datos.hoy}
      puedeGestionar={permisos.puedeGestionar}
      puedePrecios={permisos.puedeTesoreria}
    />
  );
}
