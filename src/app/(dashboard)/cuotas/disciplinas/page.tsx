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
  inicioMes,
  listarLiquidacionesDisciplina,
  previsualizarLiquidacionesMes,
  sumarMeses,
  type FilaLiquidacionMes,
} from "@/lib/socios/cuotas";
import { deudasDisciplinas, planesVigentesConSaldo } from "@/lib/socios/disciplinas";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { DisciplinasVista } from "@/components/socios/cuotas/disciplinas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Liquidación a disciplinas" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function DisciplinasCuotasPage({ searchParams }: { searchParams: SearchParams }) {
  const permisos = await permisosCuotas();
  if (!permisos.verTesoreria) redirect("/cuotas");
  const hoy = hoyUruguay();
  const sp = await searchParams;
  // Por defecto, el mes pasado: el débito de un mes se liquida al siguiente.
  const pedido = typeof sp.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? `${sp.mes}-01` : null;
  const periodo = pedido && pedido <= inicioMes(hoy) ? pedido : sumarMeses(inicioMes(hoy), -1);

  const [db, padron, conta] = await Promise.all([createSociosClient(), createServerClient(), createContabilidadClient()]);
  const [disciplinas, liquidaciones, cuentas, defecto, planesPago, deudas, mes] = await Promise.all([
    cobranzaDisciplinas(db, padron, conta),
    listarLiquidacionesDisciplina(db, padron),
    cuentasDisponibilidad(conta),
    cuentasPorDefecto(conta),
    planesVigentesConSaldo(db, hoy).catch(() => []),
    deudasDisciplinas(db).catch(() => ({}) as Record<number, number>),
    previsualizarLiquidacionesMes(db, periodo).then(
      (filas): { previa: FilaLiquidacionMes[] | null; error: string | null } => ({ previa: filas, error: null }),
      (e: unknown) => ({ previa: null, error: e instanceof Error ? e.message : "No se pudo calcular la liquidación del mes" })
    ),
  ]);
  return (
    <DisciplinasVista
      periodo={periodo}
      previa={mes.previa}
      errorPrevia={mes.error}
      disciplinas={disciplinas}
      liquidaciones={liquidaciones}
      cuentas={cuentas}
      cuentaDefecto={defecto.banco}
      planesPago={planesPago}
      deudas={deudas}
      hoy={hoy}
      puedeOperar={permisos.puedeTesoreria}
    />
  );
}
