import type { Metadata } from "next";
import { cargarPadron } from "@/lib/socios/padron";
import { permisosSocios } from "@/lib/socios/server";
import { ResumenSecretaria } from "@/components/socios/secretaria/resumen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Secretaría" };

/** "AAAA-MM-DD" menos n días. */
function restarDias(f: string, n: number): string {
  const d = new Date(`${f}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export default async function SecretariaPage() {
  const permisos = await permisosSocios();
  let datos: Awaited<ReturnType<typeof cargarPadron>> | null = null;
  let error: string | null = null;
  try {
    datos = await cargarPadron();
  } catch (e) {
    error = e instanceof Error ? e.message : "error inesperado";
  }
  if (!datos) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        No se pudo leer el padrón: {error}
      </div>
    );
  }

  const desde = restarDias(datos.hoy, 60);
  const vigentes = datos.filas.filter((f) => f.estado === "vigente");
  const altas = vigentes
    .filter((f) => f.alta && f.alta >= desde && f.alta <= datos.hoy)
    .sort((a, b) => b.alta!.localeCompare(a.alta!))
    .slice(0, 8);
  const bajas = datos.filas
    .filter((f) => f.estado === "baja" && f.baja && f.baja >= desde)
    .sort((a, b) => b.baja!.localeCompare(a.baja!))
    .slice(0, 8);
  const conteo = new Map<string, number>();
  for (const f of vigentes) if (f.medio) conteo.set(f.medio, (conteo.get(f.medio) ?? 0) + 1);

  return (
    <ResumenSecretaria
      kpis={datos.kpis}
      porDisciplina={datos.porDisciplina}
      altas={altas}
      bajas={bajas}
      medios={[...conteo.entries()].map(([medio, cantidad]) => ({ medio, cantidad })).sort((a, b) => b.cantidad - a.cantidad)}
      sinMedio={vigentes.filter((f) => !f.medio).length}
      puedeGestionar={permisos.puedeGestionar}
    />
  );
}
