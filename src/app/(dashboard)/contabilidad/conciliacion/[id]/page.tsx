import { createContabilidadClient } from "@/lib/contabilidad/server";
import { permisosContabilidad } from "@/lib/contabilidad/permisos";
import { detalleExtracto } from "@/lib/contabilidad/conciliacion";
import { cargarCatalogosAsiento, type CatalogosAsiento } from "@/lib/contabilidad/asientos";
import { AvisoSimple } from "@/components/contabilidad/asientos/aviso-simple";
import { ConciliarExtracto } from "@/components/contabilidad/conciliacion/conciliar-extracto";

export const dynamic = "force-dynamic";

export default async function ExtractoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return <NoEncontrado />;
  }
  const [{ puedeEscribir }, db] = await Promise.all([permisosContabilidad(), createContabilidadClient()]);
  const { detalle, error } = await detalleExtracto(db, id);
  if (!detalle) {
    if (error) {
      return (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      );
    }
    return <NoEncontrado />;
  }

  const editable = puedeEscribir && detalle.extracto.estado === "abierto";
  let catalogos: CatalogosAsiento | null = null;
  if (editable && detalle.pendientesBanco.length > 0) {
    const c = await cargarCatalogosAsiento();
    // Contrapartida: en pesos o en la moneda de la cuenta, y nunca la misma cuenta.
    catalogos = {
      ...c,
      cuentas: c.cuentas.filter(
        (x) => x.id !== detalle.cuenta.id && (!x.moneda || x.moneda === detalle.cuenta.moneda)
      ),
    };
  }

  return (
    <ConciliarExtracto
      detalle={detalle}
      puedeEscribir={puedeEscribir}
      catalogos={catalogos}
      error={error}
    />
  );
}

function NoEncontrado() {
  return (
    <AvisoSimple
      titulo="Extracto no encontrado"
      texto="Puede que se haya eliminado. Volvé al listado para ver los extractos de cada cuenta."
      href="/contabilidad/conciliacion"
      accion="Ir a conciliación"
    />
  );
}
