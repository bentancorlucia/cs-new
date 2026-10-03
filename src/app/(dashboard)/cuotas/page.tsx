import type { Metadata } from "next";
import { createSociosClient } from "@/lib/socios/server";
import { permisosCuotas } from "@/lib/socios/cuotas-permisos";
import { resumenCuotas } from "@/lib/socios/cuotas";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { ResumenCuotasVista } from "@/components/socios/cuotas/resumen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cuotas y cobranza" };

export default async function CuotasPage() {
  const permisos = await permisosCuotas();
  const db = await createSociosClient();
  let resumen = null;
  let error: string | null = null;
  try {
    resumen = await resumenCuotas(db, hoyUruguay(), permisos.verTesoreria);
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudo leer la cobranza";
  }
  return (
    <ResumenCuotasVista
      resumen={resumen}
      error={error}
      puedeCobrar={permisos.puedeCobrar}
      puedeTesoreria={permisos.puedeTesoreria}
      verTesoreria={permisos.verTesoreria}
    />
  );
}
