import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { listarPlanes, type PlanConPrecio } from "@/lib/socios/padron";
import { permisosSocios } from "@/lib/socios/server";
import { ImportarPadron } from "@/components/socios/secretaria/importar-padron";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Importar padrón" };

export default async function ImportarPadronPage() {
  const { puedeGestionar } = await permisosSocios();
  if (!puedeGestionar) redirect("/secretaria/socios");
  let planes: PlanConPrecio[] | null = null;
  let error: string | null = null;
  try {
    planes = (await listarPlanes()).planes;
  } catch (e) {
    error = e instanceof Error ? e.message : "error inesperado";
  }
  if (!planes) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        No se pudieron leer los planes: {error}
      </div>
    );
  }
  return <ImportarPadron planes={planes} hoy={hoyUruguay()} />;
}
