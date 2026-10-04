import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSociosClient } from "@/lib/socios/server";
import { createServerClient } from "@/lib/supabase/server";
import { createContabilidadClient } from "@/lib/contabilidad/server";
import { permisosCuotas } from "@/lib/socios/cuotas-permisos";
import {
  cobranzaDisciplinas,
  cuentasDisponibilidad,
  cuentasPorDefecto,
  listarLiquidacionesDisciplina,
} from "@/lib/socios/cuotas";
import { planesVigentesConSaldo } from "@/lib/socios/disciplinas";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { DisciplinasVista } from "@/components/socios/cuotas/disciplinas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Liquidación a disciplinas" };

export default async function DisciplinasCuotasPage() {
  const permisos = await permisosCuotas();
  if (!permisos.verTesoreria) redirect("/cuotas");
  const [db, padron, conta] = await Promise.all([createSociosClient(), createServerClient(), createContabilidadClient()]);
  const [disciplinas, liquidaciones, cuentas, defecto, planesPago] = await Promise.all([
    cobranzaDisciplinas(db, padron, conta),
    listarLiquidacionesDisciplina(db, padron),
    cuentasDisponibilidad(conta),
    cuentasPorDefecto(conta),
    planesVigentesConSaldo(db, hoyUruguay()).catch(() => []),
  ]);
  return (
    <DisciplinasVista
      disciplinas={disciplinas}
      liquidaciones={liquidaciones}
      cuentas={cuentas}
      cuentaDefecto={defecto.banco}
      planesPago={planesPago}
      hoy={hoyUruguay()}
      puedeOperar={permisos.puedeTesoreria}
    />
  );
}
