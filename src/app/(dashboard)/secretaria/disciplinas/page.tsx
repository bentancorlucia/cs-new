import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createSociosClient } from "@/lib/socios/server";
import { permisosCuotas } from "@/lib/socios/cuotas-permisos";
import { listarDisciplinasGestion, type DisciplinaLista } from "@/lib/socios/disciplinas";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { ListaDisciplinas } from "@/components/socios/disciplinas/lista";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Disciplinas" };

export default async function DisciplinasPage() {
  const permisos = await permisosCuotas();
  if (!permisos.puedeVer) redirect("/mi-cuenta");
  const [padron, so] = await Promise.all([createServerClient(), createSociosClient()]);
  let disciplinas: DisciplinaLista[] = [];
  let error: string | null = null;
  try {
    disciplinas = await listarDisciplinasGestion(padron, so, hoyUruguay(), permisos.verTesoreria);
  } catch (e) {
    error = e instanceof Error ? e.message : "error inesperado";
  }
  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">No se pudieron leer las disciplinas: {error}</div>
    );
  }
  return <ListaDisciplinas disciplinas={disciplinas} puedeGestionar={permisos.puedeGestionar} verTesoreria={permisos.verTesoreria} />;
}
