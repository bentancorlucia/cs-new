import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSociosClient } from "@/lib/socios/server";
import { createServerClient } from "@/lib/supabase/server";
import { createContabilidadClient } from "@/lib/contabilidad/server";
import { permisosCuotas } from "@/lib/socios/cuotas-permisos";
import { cuentasDisponibilidad, cuentasPorDefecto, listarLiquidacionesVisa } from "@/lib/socios/cuotas";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { VisaVista } from "@/components/socios/cuotas/visa";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Débito Visa" };

export default async function VisaPage() {
  const permisos = await permisosCuotas();
  if (!permisos.verTesoreria) redirect("/cuotas");
  const [db, padron, conta] = await Promise.all([createSociosClient(), createServerClient(), createContabilidadClient()]);
  const [liquidaciones, cuentas, defecto] = await Promise.all([
    listarLiquidacionesVisa(db, padron),
    cuentasDisponibilidad(conta),
    cuentasPorDefecto(conta),
  ]);
  return (
    <VisaVista
      liquidaciones={liquidaciones}
      cuentas={cuentas}
      cuentaDefecto={defecto.banco}
      hoy={hoyUruguay()}
      puedeAplicar={permisos.puedeTesoreria}
    />
  );
}
