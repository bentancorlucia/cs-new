import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSociosClient } from "@/lib/socios/server";
import { createServerClient } from "@/lib/supabase/server";
import { permisosCuotas } from "@/lib/socios/cuotas-permisos";
import { inicioMes, leerDisciplinas } from "@/lib/socios/cuotas";
import { leerCambiosDebito, type CambioDebito, type FiltroEstadoCambios } from "@/lib/socios/cambios-debito";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { CambiosVista } from "@/components/socios/cuotas/cambios";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cambios para el débito" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ESTADOS: FiltroEstadoCambios[] = ["pendiente", "aplicado", "descartado", "debito", "todos"];
const esFecha = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function CambiosPage({ searchParams }: { searchParams: SearchParams }) {
  const permisos = await permisosCuotas();
  if (!permisos.puedeVer) redirect("/mi-cuenta");
  const sp = await searchParams;
  const estado = ESTADOS.includes(sp.estado as FiltroEstadoCambios) ? (sp.estado as FiltroEstadoCambios) : "pendiente";
  const desde = esFecha(sp.desde) ? sp.desde : null;
  const hasta = esFecha(sp.hasta) ? sp.hasta : null;
  const hoy = hoyUruguay();

  const [db, padron] = await Promise.all([createSociosClient(), createServerClient()]);
  const leer = (f: Parameters<typeof leerCambiosDebito>[1]) =>
    leerCambiosDebito(db, f).then(
      (datos): { datos: CambioDebito[]; error: string | null } => ({ datos, error: null }),
      (e: unknown) => ({ datos: [], error: e instanceof Error ? e.message : "No se pudieron leer los cambios" })
    );
  const soloPendientes = estado === "pendiente" && !desde && !hasta;
  const [lista, otrosPendientes, mes, disciplinas] = await Promise.all([
    leer({ estado, desde, hasta }),
    soloPendientes ? Promise.resolve(null) : leer({ estado: "pendiente" }),
    leer({ desde: inicioMes(hoy), hasta: hoy }),
    leerDisciplinas(padron).catch(() => []),
  ]);
  const cambios = lista.datos;
  const pendientes = otrosPendientes?.datos ?? null;
  const delMes = mes.datos;
  const error = lista.error ?? otrosPendientes?.error ?? mes.error;

  return (
    <CambiosVista
      cambios={cambios}
      pendientes={pendientes ?? cambios}
      delMes={delMes}
      disciplinas={disciplinas.map((d) => ({ id: d.id, nombre: d.nombre }))}
      filtros={{ estado, desde, hasta }}
      hoy={hoy}
      error={error}
      puedeTesoreria={permisos.puedeTesoreria}
    />
  );
}
