import type { Metadata } from "next";
import { createSociosClient } from "@/lib/socios/server";
import { createServerClient } from "@/lib/supabase/server";
import { permisosCuotas } from "@/lib/socios/cuotas-permisos";
import { leerConfig, leerDisciplinas, morosidad } from "@/lib/socios/cuotas";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { MorosidadVista } from "@/components/socios/cuotas/morosidad";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Morosidad" };

export default async function MorosidadPage() {
  const permisos = await permisosCuotas();
  const hoy = hoyUruguay();
  const [db, padron] = await Promise.all([createSociosClient(), createServerClient()]);
  let filas: Awaited<ReturnType<typeof morosidad>> = [];
  let error: string | null = null;
  const [config, disciplinas] = await Promise.all([leerConfig(db), leerDisciplinas(padron)]);
  try {
    filas = await morosidad(db, padron, hoy);
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudo leer la situación de los socios";
  }
  return (
    <MorosidadVista
      filas={filas}
      error={error}
      hoy={hoy}
      config={config}
      disciplinas={disciplinas}
      puedeCobrar={permisos.puedeCobrar}
      puedeConfigurar={permisos.puedeTesoreria}
    />
  );
}
