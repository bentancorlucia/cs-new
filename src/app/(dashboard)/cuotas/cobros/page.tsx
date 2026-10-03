import type { Metadata } from "next";
import { createSociosClient } from "@/lib/socios/server";
import { createServerClient } from "@/lib/supabase/server";
import { permisosCuotas } from "@/lib/socios/cuotas-permisos";
import { MEDIOS, inicioMes, leerPersonas, listarCobros, sumarMeses, type Persona } from "@/lib/socios/cuotas";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { CobrosLista } from "@/components/socios/cuotas/cobros";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cobros de cuotas" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const esFecha = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function CobrosPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const param = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const hoy = hoyUruguay();
  const desde = esFecha(param("desde")) ? param("desde")! : sumarMeses(inicioMes(hoy), -1);
  const hasta = esFecha(param("hasta")) ? param("hasta")! : hoy;
  const medio = MEDIOS.find((m) => m === param("medio")) ?? null;
  const personaId = Number(param("persona")) || null;

  const [permisos, db, padron] = await Promise.all([permisosCuotas(), createSociosClient(), createServerClient()]);
  let cobros: Awaited<ReturnType<typeof listarCobros>> = [];
  let error: string | null = null;
  let persona: Persona | null = null;
  try {
    [cobros, persona] = await Promise.all([
      listarCobros(db, padron, { desde, hasta, medio, persona: personaId }),
      personaId ? leerPersonas(padron, [personaId]).then((m) => m.get(personaId) ?? null) : Promise.resolve(null),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudieron leer los cobros";
  }

  return (
    <CobrosLista
      cobros={cobros}
      error={error}
      filtros={{ desde, hasta, medio, persona }}
      puedeCobrar={permisos.puedeCobrar}
      puedeAnular={permisos.puedeTesoreria}
      verAsientos={permisos.verTesoreria}
    />
  );
}
