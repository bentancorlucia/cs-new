import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { listarDisciplinas, listarPlanes } from "@/lib/socios/padron";
import { permisosSocios } from "@/lib/socios/server";
import { AltaSocio } from "@/components/socios/secretaria/alta-socio";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nuevo socio" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function cargar() {
  const [{ planes }, disciplinas] = await Promise.all([listarPlanes(), listarDisciplinas()]);
  return { planes, disciplinas };
}

export default async function NuevoSocioPage({ searchParams }: { searchParams: SearchParams }) {
  const { puedeGestionar } = await permisosSocios();
  if (!puedeGestionar) redirect("/secretaria/socios");
  const sp = await searchParams;
  let datos: Awaited<ReturnType<typeof cargar>> | null = null;
  let error: string | null = null;
  try {
    datos = await cargar();
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
    <AltaSocio
      planes={datos.planes}
      disciplinas={datos.disciplinas}
      hoy={hoyUruguay()}
      cedulaInicial={typeof sp.cedula === "string" ? sp.cedula : undefined}
    />
  );
}
