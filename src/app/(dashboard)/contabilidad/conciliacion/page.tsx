import { createContabilidadClient } from "@/lib/contabilidad/server";
import { permisosContabilidad } from "@/lib/contabilidad/permisos";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { listarCuentasConciliables, mesesDelAnio } from "@/lib/contabilidad/conciliacion";
import { IndiceConciliacion } from "@/components/contabilidad/conciliacion/indice-conciliacion";

export const dynamic = "force-dynamic";

export default async function ConciliacionPage({
  searchParams,
}: {
  searchParams: Promise<{ cuenta?: string }>;
}) {
  const [{ puedeEscribir }, db, sp] = await Promise.all([
    permisosContabilidad(),
    createContabilidadClient(),
    searchParams,
  ]);
  const { cuentas, error } = await listarCuentasConciliables(db);
  const hoy = hoyUruguay();

  const elegida =
    cuentas.find((c) => c.id === sp.cuenta) ??
    cuentas.find((c) => c.extractos.length > 0) ??
    cuentas.find((c) => /banco/i.test(c.nombre)) ??
    cuentas[0] ??
    null;

  const vista = cuentas.map((c) => {
    const anio = Number((c.ultimo?.fechaHasta ?? hoy).slice(0, 4));
    return { ...c, anio, meses: mesesDelAnio(c.extractos, anio) };
  });

  return (
    <IndiceConciliacion
      cuentas={vista}
      elegidaId={elegida?.id ?? null}
      puedeEscribir={puedeEscribir}
      error={error}
    />
  );
}
