import Link from "next/link";
import { createContabilidadClient } from "@/lib/contabilidad/server";
import { permisosContabilidad } from "@/lib/contabilidad/permisos";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { ejercicioActual, type EjercicioResumen } from "@/lib/contabilidad/reportes";
import { informeEjecucion, type InformeEjecucion } from "@/lib/contabilidad/presupuesto";
import { EmptyState } from "@/components/shared/empty-state";
import { SinEjercicio } from "@/components/contabilidad/reportes/sin-ejercicio";
import { TituloReporte } from "@/components/contabilidad/reportes/titulo-reporte";
import { EjecucionCliente } from "@/components/contabilidad/presupuesto/ejecucion-cliente";
import { SelectorEjercicio } from "@/components/contabilidad/presupuesto/selector-ejercicio";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function mes(v: string | string[] | undefined): number | null {
  const n = typeof v === "string" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

export default async function EjecucionPresupuestoPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const hoy = hoyUruguay();
  const db = await createContabilidadClient();
  const [{ puedeEscribir }, { data: ejercicios }] = await Promise.all([
    permisosContabilidad(),
    db.from("ejercicios").select("id, nombre, fecha_inicio, fecha_fin, estado").order("fecha_inicio"),
  ]);

  const titulo = (
    <TituloReporte
      titulo="Ejecución del presupuesto"
      etiqueta="Contabilidad · Presupuesto"
      descripcion="Presupuestado contra lo realmente registrado en la contabilidad, por cuenta y centro de costo."
    >
      <Link
        href={`/contabilidad/presupuesto${typeof sp.ejercicio === "string" ? `?ejercicio=${sp.ejercicio}` : ""}`}
        className="text-xs font-heading text-bordo-800 underline-offset-2 hover:underline"
      >
        Versiones del presupuesto →
      </Link>
    </TituloReporte>
  );

  const lista: EjercicioResumen[] = ejercicios ?? [];
  const ejercicio =
    (typeof sp.ejercicio === "string" ? lista.find((e) => e.id === sp.ejercicio) : undefined) ??
    ejercicioActual(lista, hoy);
  if (!ejercicio) {
    return (
      <div className="space-y-6">
        {titulo}
        <SinEjercicio
          titulo="Todavía no hay ejercicios"
          descripcion="El presupuesto se arma sobre un ejercicio contable."
          anio={hoy.slice(0, 4)}
          conAccion={puedeEscribir}
        />
      </div>
    );
  }

  let informe: InformeEjecucion | null = null;
  let error: string | null = null;
  try {
    informe = await informeEjecucion(db, {
      ejercicio,
      presupuestoId: typeof sp.presupuesto === "string" ? sp.presupuesto : null,
      mesDesde: mes(sp.desde),
      mesHasta: mes(sp.hasta),
      porCentro: sp.centros === "1",
      hoy,
    });
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudo calcular la ejecución";
  }

  return (
    <div className="space-y-5 pb-12">
      {titulo}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      )}
      {informe ? (
        <EjecucionCliente
          ejercicios={lista}
          informe={informe}
          mesActual={hoy >= ejercicio.fecha_inicio && hoy <= ejercicio.fecha_fin ? Number(hoy.slice(5, 7)) : null}
        />
      ) : (
        !error && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-linea bg-white p-3 sm:p-4">
              <SelectorEjercicio ejercicios={lista} ejercicioId={ejercicio.id} limpiar={["presupuesto", "desde", "hasta"]} />
            </div>
            <div className="rounded-2xl border border-dashed border-linea bg-white">
              <EmptyState
                title={`${ejercicio.nombre} no tiene presupuesto`}
                description="Cuando haya un presupuesto aprobado, acá vas a ver cuánto se ejecutó de cada cuenta mes a mes."
                action={{ label: "Ir al presupuesto", href: `/contabilidad/presupuesto?ejercicio=${ejercicio.id}` }}
              />
            </div>
          </div>
        )
      )}
    </div>
  );
}
