import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSociosClient } from "@/lib/socios/server";
import { createServerClient } from "@/lib/supabase/server";
import { createContabilidadClient } from "@/lib/contabilidad/server";
import { permisosCuotas } from "@/lib/socios/cuotas-permisos";
import { cuentaPersona, cuentasDisponibilidad, cuentasPorDefecto, leerDisciplinas } from "@/lib/socios/cuotas";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { CobroForm } from "@/components/socios/cuotas/cobro-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Registrar cobro" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NuevoCobroPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const permisos = await permisosCuotas();
  if (!permisos.puedeCobrar) redirect("/cuotas/cobros");
  const hoy = hoyUruguay();
  const personaId = Number(typeof sp.persona === "string" ? sp.persona : "") || null;

  const [db, padron] = await Promise.all([createSociosClient(), createServerClient()]);
  const conta = permisos.puedeTesoreria ? await createContabilidadClient() : null;
  const [inicial, disciplinas, cuentas, defecto] = await Promise.all([
    personaId ? cuentaPersona(db, padron, personaId, hoy).catch(() => null) : Promise.resolve(null),
    leerDisciplinas(padron),
    conta ? cuentasDisponibilidad(conta) : Promise.resolve([]),
    conta ? cuentasPorDefecto(conta) : Promise.resolve({ banco: null, caja: null }),
  ]);

  return (
    <CobroForm
      hoy={hoy}
      inicial={inicial}
      disciplinas={disciplinas.filter((d) => d.activa)}
      cuentas={cuentas}
      defecto={defecto}
      eligeCuenta={permisos.puedeTesoreria}
    />
  );
}
