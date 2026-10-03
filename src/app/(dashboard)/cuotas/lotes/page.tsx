import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSociosClient } from "@/lib/socios/server";
import { permisosCuotas } from "@/lib/socios/cuotas-permisos";
import { leerConfig, listarLotes } from "@/lib/socios/cuotas";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { LotesVista } from "@/components/socios/cuotas/lotes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Emisión de cuotas" };

export default async function LotesPage() {
  const permisos = await permisosCuotas();
  if (!permisos.verTesoreria) redirect("/cuotas");
  const db = await createSociosClient();
  const [lotes, config] = await Promise.all([listarLotes(db), leerConfig(db)]);
  return (
    <LotesVista
      lotes={lotes}
      diaVencimiento={config?.dia_vencimiento ?? 10}
      hoy={hoyUruguay()}
      puedeEmitir={permisos.puedeTesoreria}
    />
  );
}
