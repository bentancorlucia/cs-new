import { notFound } from "next/navigation";
import { z } from "zod";
import { createContabilidadClient } from "@/lib/contabilidad/server";
import { permisosContabilidad } from "@/lib/contabilidad/permisos";
import { leerCentrosCosto, leerCuentasPresupuesto, leerPresupuesto } from "@/lib/contabilidad/presupuesto";
import { GrillaPresupuesto } from "@/components/contabilidad/presupuesto/grilla-presupuesto";

export const dynamic = "force-dynamic";

export default async function PresupuestoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const db = await createContabilidadClient();
  const [{ puedeEscribir }, cuentas, centros] = await Promise.all([
    permisosContabilidad(),
    leerCuentasPresupuesto(db),
    leerCentrosCosto(db),
  ]);
  const leido = await leerPresupuesto(db, id, cuentas);
  if (!leido) notFound();
  const { presupuesto, ejercicio, lineas } = leido;

  const { data: vigente } = await db
    .from("presupuestos")
    .select("version")
    .eq("ejercicio_id", ejercicio.id)
    .eq("estado", "aprobado")
    .maybeSingle();

  return (
    <GrillaPresupuesto
      key={presupuesto.id}
      presupuesto={presupuesto}
      ejercicio={ejercicio}
      cuentas={cuentas}
      centros={centros}
      lineas={lineas}
      puedeEscribir={puedeEscribir}
      versionVigente={vigente && vigente.version !== presupuesto.version ? vigente.version : null}
    />
  );
}
