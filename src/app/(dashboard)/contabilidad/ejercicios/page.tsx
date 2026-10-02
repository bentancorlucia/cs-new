import { createContabilidadClient } from "@/lib/contabilidad/server";
import { permisosContabilidad } from "@/lib/contabilidad/permisos";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import {
  EjerciciosCliente,
  type ChequeoCotizacion,
  type EjercicioVista,
} from "@/components/contabilidad/ejercicios/ejercicios-cliente";

export const dynamic = "force-dynamic";

function restarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - dias)).toISOString().slice(0, 10);
}

/** `x(count)` de PostgREST llega como `[{ count }]`. */
function contar(rel: { count: number }[] | null | undefined): number {
  return rel?.[0]?.count ?? 0;
}

export default async function EjerciciosPage() {
  const [{ puedeEscribir }, db] = await Promise.all([
    permisosContabilidad(),
    createContabilidadClient(),
  ]);
  const hoy = hoyUruguay();

  const [ejerciciosRes, monedasRes] = await Promise.all([
    // Conteos con embebidos `(count)`: un select de asientos quedaría
    // cortado por el max_rows de PostgREST.
    db
      .from("ejercicios")
      .select(
        "id, nombre, fecha_inicio, fecha_fin, estado, cerrado_at, " +
          "movimientos:asientos(count), " +
          "periodos(id, anio, mes, fecha_inicio, fecha_fin, estado, cerrado_at, " +
          "asientos(count), borradores:asientos(count))"
      )
      .neq("movimientos.tipo", "apertura")
      .eq("periodos.borradores.estado", "borrador")
      .order("fecha_inicio", { ascending: false })
      .returns<
        {
          id: string;
          nombre: string;
          fecha_inicio: string;
          fecha_fin: string;
          estado: "abierto" | "cerrado";
          cerrado_at: string | null;
          movimientos: { count: number }[];
          periodos: {
            id: string;
            anio: number;
            mes: number;
            fecha_inicio: string;
            fecha_fin: string;
            estado: "abierto" | "cerrado";
            cerrado_at: string | null;
            asientos: { count: number }[];
            borradores: { count: number }[];
          }[];
        }[]
      >(),
    db.from("cuentas").select("moneda").eq("revalua", true),
  ]);

  const error = ejerciciosRes.error ?? monedasRes.error ?? null;
  const filas = ejerciciosRes.data ?? [];
  const monedasRevaluables = Array.from(
    new Set((monedasRes.data ?? []).map((c) => c.moneda).filter((m): m is string => !!m))
  ).sort();

  // Chequeo de cotización para cerrar: el cierre exige al menos una en los
  // últimos 7 días del ejercicio, por cada moneda que revalúa.
  const abiertos = filas.filter((e) => e.estado === "abierto");
  const chequeos = await Promise.all(
    abiertos.flatMap((e) =>
      monedasRevaluables.map(async (moneda): Promise<[string, ChequeoCotizacion]> => {
        const { data } = await db
          .from("cotizaciones")
          .select("fecha, tasa, fuente")
          .eq("moneda", moneda)
          .gte("fecha", restarDias(e.fecha_fin, 7))
          .lte("fecha", e.fecha_fin)
          .order("fecha", { ascending: false })
          .limit(1)
          .maybeSingle();
        return [
          e.id,
          {
            moneda,
            fecha: data?.fecha ?? null,
            tasa: data ? Number(data.tasa) : null,
            fuente: data?.fuente ?? null,
          },
        ];
      })
    )
  );
  const cotizacionesPorEjercicio = new Map<string, ChequeoCotizacion[]>();
  for (const [id, c] of chequeos) {
    cotizacionesPorEjercicio.set(id, [...(cotizacionesPorEjercicio.get(id) ?? []), c]);
  }

  const ejercicios: EjercicioVista[] = filas.map((e) => {
    const periodos = [...(e.periodos ?? [])]
      .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio))
      .map((p) => ({
        id: p.id,
        anio: p.anio,
        mes: p.mes,
        fechaInicio: p.fecha_inicio,
        fechaFin: p.fecha_fin,
        estado: p.estado,
        asientos: contar(p.asientos),
        borradores: contar(p.borradores),
      }));
    return {
      id: e.id,
      nombre: e.nombre,
      anio: Number(e.fecha_fin.slice(0, 4)),
      fechaInicio: e.fecha_inicio,
      fechaFin: e.fecha_fin,
      estado: e.estado,
      cerradoAt: e.cerrado_at,
      periodos,
      borradores: periodos.reduce((s, p) => s + p.borradores, 0),
      asientos: periodos.reduce((s, p) => s + p.asientos, 0),
      movimientosPropios: contar(e.movimientos),
      cotizacionesCierre: cotizacionesPorEjercicio.get(e.id) ?? [],
    };
  });

  // Acciones de período: se cierra el primer abierto y se reabre el último
  // cerrado (en todo el calendario: la base exige ese orden entre ejercicios).
  const todos = ejercicios
    .flatMap((e) => e.periodos.map((p) => ({ ...p, ejercicioAbierto: e.estado === "abierto" })))
    .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio));
  const primerAbierto = todos.find((p) => p.estado === "abierto" && p.ejercicioAbierto) ?? null;
  const ultimoCerrado = [...todos].reverse().find((p) => p.estado === "cerrado") ?? null;

  // Reabrir ejercicio: solo el último cerrado.
  const ultimoEjercicioCerrado = ejercicios.find((e) => e.estado === "cerrado") ?? null;

  // Revaluación: por defecto el fin del primer mes abierto si ya terminó
  // (revaluar antes de cerrarlo); si no, hoy.
  const fechaRevaluacion =
    primerAbierto && primerAbierto.fechaFin < hoy ? primerAbierto.fechaFin : hoy;

  const ultimo = ejercicios[0];
  const proximoAnio = ultimo ? ultimo.anio + 1 : Number(hoy.slice(0, 4));

  return (
    <EjerciciosCliente
      ejercicios={ejercicios}
      puedeEscribir={puedeEscribir}
      hoy={hoy}
      error={error ? error.message : null}
      primerPeriodoAbiertoId={primerAbierto?.id ?? null}
      ultimoPeriodoCerradoId={
        ultimoCerrado && ultimoCerrado.ejercicioAbierto ? ultimoCerrado.id : null
      }
      ultimoEjercicioCerradoId={ultimoEjercicioCerrado?.id ?? null}
      fechaRevaluacion={fechaRevaluacion}
      proximoAnio={proximoAnio}
      hayEjercicios={ejercicios.length > 0}
    />
  );
}
