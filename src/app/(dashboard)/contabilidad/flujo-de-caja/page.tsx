import type { Metadata } from "next";
import { createContabilidadClient } from "@/lib/contabilidad/server";
import { createComercialClient } from "@/lib/comercial/server";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { ejercicioActual, finDeMes } from "@/lib/contabilidad/reportes";
import {
  flujoReal,
  leerCuentasFlujo,
  leerEjercicios,
  nombreMes,
  proyeccionFlujo,
  sumarMeses,
  type AgrupacionFlujo,
  type EstadoFlujo,
  type HorizonteProyeccion,
  type ProyeccionFlujo,
} from "@/lib/contabilidad/flujo";
import { SinEjercicio } from "@/components/contabilidad/reportes/sin-ejercicio";
import { TituloReporte } from "@/components/contabilidad/reportes/titulo-reporte";
import { FlujoCliente, type VistaFlujo } from "@/components/contabilidad/flujo/flujo-cliente";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Flujo de caja" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Rango máximo del flujo real (columnas por mes). */
const MAX_MESES = 24;
const CLAVE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FlujoDeCajaPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const param = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const vista: VistaFlujo = param("vista") === "proyeccion" ? "proyeccion" : "real";
  const agrupar: AgrupacionFlujo = param("agrupar") === "centro" ? "centro" : "plan";
  const horizonte: HorizonteProyeccion = param("horizonte") === "12" ? "12" : "ejercicio";

  const hoy = hoyUruguay();
  const mesActual = hoy.slice(0, 7);
  const db = await createContabilidadClient();

  const titulo = (
    <TituloReporte
      titulo="Flujo de caja"
      descripcion="Entradas y salidas de cajas y bancos mes a mes, y proyección del saldo con el presupuesto."
    />
  );

  let ejercicios: Awaited<ReturnType<typeof leerEjercicios>> = [];
  let cuentas: Awaited<ReturnType<typeof leerCuentasFlujo>> = [];
  let error: string | null = null;
  try {
    [ejercicios, cuentas] = await Promise.all([leerEjercicios(db), leerCuentasFlujo(db)]);
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudieron leer los datos contables";
  }

  const actual = ejercicioActual(ejercicios, hoy);
  if (!actual) {
    return (
      <div className="space-y-6">
        {titulo}
        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
        ) : (
          <SinEjercicio
            titulo="Todavía no hay ejercicios"
            descripcion="El flujo de caja se arma con los asientos de un ejercicio contable. Creá el primero para empezar."
            anio={hoy.slice(0, 4)}
          />
        )}
      </div>
    );
  }

  // Meses elegibles: desde el inicio del primer ejercicio hasta hoy (o el fin del último).
  const primerMes = ejercicios[0].fecha_inicio.slice(0, 7);
  const finUltimo = ejercicios[ejercicios.length - 1].fecha_fin.slice(0, 7);
  const ultimoMes = mesActual < finUltimo ? (mesActual < primerMes ? primerMes : mesActual) : finUltimo;
  const opcionesMeses: { clave: string; etiqueta: string }[] = [];
  for (let k = primerMes; k <= ultimoMes; k = sumarMeses(k, 1)) {
    // Solo meses dentro de algún ejercicio (puede haber huecos si se saltea un año).
    if (ejercicios.some((e) => e.fecha_inicio.slice(0, 7) <= k && k <= e.fecha_fin.slice(0, 7))) {
      opcionesMeses.push({ clave: k, etiqueta: nombreMes(k, { largo: true }) });
    }
  }
  const valido = (k: string | undefined): k is string => !!k && CLAVE_MES.test(k) && opcionesMeses.some((m) => m.clave === k);

  // Por defecto: ejercicio actual hasta hoy.
  const ejercicioDesde = actual.fecha_inicio.slice(0, 7) > ultimoMes ? ultimoMes : actual.fecha_inicio.slice(0, 7);
  let hastaMes = valido(param("hasta")) ? param("hasta")! : ultimoMes;
  let desdeMes = valido(param("desde")) ? param("desde")! : ejercicioDesde;
  if (desdeMes > hastaMes) [desdeMes, hastaMes] = [hastaMes, desdeMes];
  if (sumarMeses(desdeMes, MAX_MESES - 1) < hastaMes) desdeMes = sumarMeses(hastaMes, -(MAX_MESES - 1));
  if (!valido(desdeMes)) desdeMes = opcionesMeses.find((m) => m.clave >= desdeMes)?.clave ?? hastaMes;

  const disponibilidades = cuentas
    .filter((c) => c.es_disponibilidad && c.imputable)
    .sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }))
    .map((c) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre, moneda: c.moneda }));
  const cuentaParam = param("cuenta");
  const cuenta = cuentaParam && UUID.test(cuentaParam) && disponibilidades.some((d) => d.id === cuentaParam) ? cuentaParam : null;

  let real: EstadoFlujo | null = null;
  let proyeccion: ProyeccionFlujo | null = null;
  if (!error) {
    try {
      if (vista === "real") {
        const desde = `${desdeMes}-01`;
        const fin = finDeMes(`${hastaMes}-01`);
        const hasta = fin > hoy && hoy >= desde ? hoy : fin;
        real = await flujoReal(db, { desde, hasta, disponibilidad: cuenta, agrupacion: agrupar, cuentas, ejercicios });
      } else {
        const com = await createComercialClient();
        proyeccion = await proyeccionFlujo(db, com, { hoy, horizonte });
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "No se pudo calcular el flujo de caja";
    }
  }

  return (
    <div className="space-y-5 pb-10">
      {titulo}
      <FlujoCliente
        vista={vista}
        hoy={hoy}
        real={real}
        proyeccion={proyeccion}
        error={error}
        opcionesMeses={opcionesMeses}
        disponibilidades={disponibilidades}
        filtros={{ desde: desdeMes, hasta: hastaMes, cuenta, agrupar, horizonte, ejercicioDesde }}
      />
    </div>
  );
}
