import type { Metadata } from "next";
import { cargarPadron } from "@/lib/socios/padron";
import { permisosSocios } from "@/lib/socios/server";
import { ListaSocios, type FiltrosIniciales } from "@/components/socios/secretaria/lista-socios";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Socios" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const uno = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function SociosPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const estado = uno(sp.estado);
  const iniciales: FiltrosIniciales = {
    q: uno(sp.q),
    estado: estado === "bajas" || estado === "todos" ? estado : "vigentes",
    // Compatibilidad con el link viejo /secretaria/socios?estado=moroso
    situacion:
      estado === "moroso"
        ? "morosos"
        : (["al_dia", "con_deuda", "morosos"] as const).find((s) => s === uno(sp.situacion)),
    disciplina: uno(sp.disciplina),
    medio: uno(sp.medio),
  };

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
  return <ListaSocios {...datos} puedeGestionar={permisos.puedeGestionar} iniciales={iniciales} />;
}
