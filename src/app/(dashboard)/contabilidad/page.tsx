import { createContabilidadClient } from "@/lib/contabilidad/server";
import { permisosContabilidad } from "@/lib/contabilidad/permisos";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import {
  COLUMNAS_CUENTA_PLAN,
  diasEntre,
  ejercicioActual,
  finDeMes,
  leerPaginado,
  resultadoAcumulado,
  resultadoDelMes,
  totalDisponibilidades,
  type ResultadoMes,
} from "@/lib/contabilidad/reportes";
import { SinEjercicio } from "@/components/contabilidad/reportes/sin-ejercicio";
import { TituloReporte } from "@/components/contabilidad/reportes/titulo-reporte";
import { ResumenCliente } from "@/components/contabilidad/reportes/resumen-cliente";

export const dynamic = "force-dynamic";

export default async function ContabilidadResumenPage() {
  const hoy = hoyUruguay();
  const db = await createContabilidadClient();
  const [{ puedeEscribir }, { data: ejercicios }] = await Promise.all([
    permisosContabilidad(),
    db.from("ejercicios").select("id, nombre, fecha_inicio, fecha_fin, estado").order("fecha_inicio"),
  ]);

  const ejercicio = ejercicioActual(ejercicios ?? [], hoy);
  if (!ejercicio) {
    return (
      <div className="space-y-6">
        <TituloReporte titulo="Resumen" descripcion="Estado general de la contabilidad del club." />
        <SinEjercicio
          titulo="La contabilidad todavía no arrancó"
          descripcion={
            puedeEscribir
              ? `Para empezar a registrar asientos hay que crear el ejercicio ${hoy.slice(0, 4)} (año calendario, con sus 12 períodos mensuales).`
              : "Todavía no hay ejercicios contables. Cuando tesorería cree el primero, acá vas a ver el resumen."
          }
          anio={hoy.slice(0, 4)}
          conAccion={puedeEscribir}
        />
      </div>
    );
  }

  const ini = ejercicio.fecha_inicio;
  const fin = ejercicio.fecha_fin;
  const hasta = hoy < ini ? ini : hoy > fin ? fin : hoy;

  // Meses del ejercicio hasta la fecha de corte
  const meses: { mes: string; desde: string; hasta: string }[] = [];
  for (let d = ini; d <= hasta; ) {
    const fm = finDeMes(d);
    meses.push({ mes: d.slice(0, 7), desde: d, hasta: fm < hasta ? fm : hasta });
    const [y, m] = d.split("-").map(Number);
    d = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  }

  // Una fila por cuenta: hoy entra en una página, pero se pagina igual.
  const saldos = (pDesde: string, pHasta: string) =>
    leerPaginado((a, b) =>
      db
        .rpc("saldos", { p_desde: pDesde, p_hasta: pHasta, p_excluir_cierre: true })
        .order("cuenta_id")
        .range(a, b)
    );

  const [
    { data: cuentas },
    { data: periodos },
    saldosEjercicio,
    { count: borradores },
    { count: confirmados },
    { data: cotizacion },
    ...porMes
  ] = await Promise.all([
    db.from("cuentas").select(COLUMNAS_CUENTA_PLAN),
    db.from("periodos").select("id, mes, anio, estado, fecha_inicio, fecha_fin").eq("ejercicio_id", ejercicio.id).order("fecha_inicio"),
    saldos(ini, hasta),
    db.from("asientos").select("id", { count: "exact", head: true }).eq("estado", "borrador"),
    db
      .from("asientos")
      .select("id", { count: "exact", head: true })
      .eq("ejercicio_id", ejercicio.id)
      .eq("estado", "confirmado"),
    db.from("cotizaciones").select("fecha, tasa, fuente").eq("moneda", "USD").order("fecha", { ascending: false }).limit(1).maybeSingle(),
    ...meses.map((m) => saldos(m.desde, m.hasta)),
  ]);

  const plan = cuentas ?? [];
  const filas = saldosEjercicio.filas;
  const disponibilidades = totalDisponibilidades(plan, filas);
  const resultado = resultadoAcumulado(plan, filas);
  const evolucion: ResultadoMes[] = meses.map((m, i) => resultadoDelMes(m.mes, plan, porMes[i]?.filas ?? []));

  const error =
    saldosEjercicio.error ||
    porMes.map((r) => r.error).find(Boolean) ||
    null;

  return (
    <div className="space-y-6">
      <TituloReporte titulo="Resumen" descripcion="Estado general de la contabilidad del club." />
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      )}
      <ResumenCliente
        hoy={hoy}
        hasta={hasta}
        ejercicio={ejercicio}
        periodos={periodos ?? []}
        disponibilidades={disponibilidades}
        resultado={resultado}
        borradores={borradores ?? 0}
        confirmados={confirmados ?? 0}
        cotizacion={
          cotizacion
            ? {
                fecha: cotizacion.fecha,
                tasa: Number(cotizacion.tasa),
                fuente: cotizacion.fuente,
                dias: diasEntre(cotizacion.fecha, hoy),
              }
            : null
        }
        evolucion={evolucion}
      />
    </div>
  );
}
