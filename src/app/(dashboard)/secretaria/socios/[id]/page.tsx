import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cargarFicha, leerConfig, listarDisciplinas, listarMotivosBaja, listarPlanes } from "@/lib/socios/padron";
import { permisosSocios } from "@/lib/socios/server";
import { FichaSocio } from "@/components/socios/secretaria/ficha-socio";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ficha de socio" };

async function cargar(personaId: number) {
  const [ficha, permisos, { planes }, disciplinas, motivos, config] = await Promise.all([
    cargarFicha(personaId),
    permisosSocios(),
    listarPlanes(),
    listarDisciplinas(),
    listarMotivosBaja(),
    leerConfig(),
  ]);
  return { ficha, permisos, planes, disciplinas, motivos, config };
}

export default async function FichaSocioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const personaId = Number(id);
  if (!Number.isInteger(personaId) || personaId <= 0) notFound();

  let datos: Awaited<ReturnType<typeof cargar>> | null = null;
  let error: string | null = null;
  try {
    datos = await cargar(personaId);
  } catch (e) {
    error = e instanceof Error ? e.message : "error inesperado";
  }
  if (!datos) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        No se pudo leer la ficha: {error}
      </div>
    );
  }
  if (!datos.ficha) notFound();
  return (
    <FichaSocio
      ficha={datos.ficha}
      planes={datos.planes}
      disciplinas={datos.disciplinas}
      motivos={datos.motivos}
      bajaConDeuda={datos.config?.baja_con_deuda === "anular" ? "anular" : "mantener"}
      puedeGestionar={datos.permisos.puedeGestionar}
      puedeCobrar={datos.permisos.puedeCobrar}
    />
  );
}
