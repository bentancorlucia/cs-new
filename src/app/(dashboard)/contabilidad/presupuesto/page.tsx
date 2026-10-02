import { createContabilidadClient } from "@/lib/contabilidad/server";
import { permisosContabilidad } from "@/lib/contabilidad/permisos";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { ejercicioActual, sumarDias, type EjercicioResumen } from "@/lib/contabilidad/reportes";
import { listarPresupuestos, type PresupuestoResumen } from "@/lib/contabilidad/presupuesto";
import { SinEjercicio } from "@/components/contabilidad/reportes/sin-ejercicio";
import { TituloReporte } from "@/components/contabilidad/reportes/titulo-reporte";
import { PresupuestoLista } from "@/components/contabilidad/presupuesto/presupuesto-lista";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PresupuestoPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const hoy = hoyUruguay();
  const db = await createContabilidadClient();
  const [{ puedeEscribir }, { data: ejercicios, error: errorEjercicios }] = await Promise.all([
    permisosContabilidad(),
    db.from("ejercicios").select("id, nombre, fecha_inicio, fecha_fin, estado").order("fecha_inicio"),
  ]);

  const titulo = (
    <TituloReporte
      titulo="Presupuesto"
      descripcion="Presupuesto económico del ejercicio por cuenta, mes y centro de costo, con sus versiones."
    />
  );

  const lista: EjercicioResumen[] = ejercicios ?? [];
  const pedido = typeof sp.ejercicio === "string" ? lista.find((e) => e.id === sp.ejercicio) : undefined;
  const ejercicio = pedido ?? ejercicioActual(lista, hoy);
  if (!ejercicio) {
    return (
      <div className="space-y-6">
        {titulo}
        <SinEjercicio
          titulo="Todavía no hay ejercicios"
          descripcion="El presupuesto se arma sobre un ejercicio contable. Creá el primero para empezar."
          anio={hoy.slice(0, 4)}
          conAccion={puedeEscribir}
        />
      </div>
    );
  }

  let versiones: PresupuestoResumen[] = [];
  let error = errorEjercicios?.message ?? null;
  try {
    versiones = await listarPresupuestos(db, ejercicio.id);
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudo leer el presupuesto";
  }
  const hayAnterior = lista.some((e) => e.fecha_fin === sumarDias(ejercicio.fecha_inicio, -1));

  return (
    <div className="space-y-5 pb-12">
      {titulo}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      )}
      <PresupuestoLista
        ejercicios={lista}
        ejercicio={ejercicio}
        versiones={versiones}
        puedeEscribir={puedeEscribir}
        hayAnterior={hayAnterior}
      />
    </div>
  );
}
