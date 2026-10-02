import { createContabilidadClient } from "@/lib/contabilidad/server";
import { hoyUruguay, mensajeError } from "@/lib/contabilidad/formato";
import {
  COLUMNAS_CUENTA_PLAN,
  ID_RESULTADO_SINTETICO,
  estadoResultados,
  estadoSituacion,
  leerPaginado,
  resolverPeriodo,
  resultadosPorCentro,
  sumasYSaldos,
  type ResultadosPorCentro,
} from "@/lib/contabilidad/reportes";
import { SinEjercicio } from "@/components/contabilidad/reportes/sin-ejercicio";
import { SelectorPeriodo } from "@/components/contabilidad/reportes/selector-periodo";
import { TituloReporte } from "@/components/contabilidad/reportes/titulo-reporte";
import { BalanceCliente, type TabBalance } from "@/components/contabilidad/reportes/balance-cliente";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const TABS: TabBalance[] = ["sumas", "situacion", "resultados"];

export default async function BalancesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const param = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const tabParam = param("tab");
  const tab: TabBalance = TABS.includes(tabParam as TabBalance) ? (tabParam as TabBalance) : "sumas";
  const verCentros = param("centros") === "1";

  const db = await createContabilidadClient();
  const [{ data: ejercicios }, { data: cuentas, error: errorCuentas }, { data: sistema }] = await Promise.all([
    db.from("ejercicios").select("id, nombre, fecha_inicio, fecha_fin, estado").order("fecha_inicio"),
    db.from("cuentas").select(COLUMNAS_CUENTA_PLAN),
    db.from("cuentas_sistema").select("cuenta_id").eq("rol", "resultado_ejercicio").maybeSingle(),
  ]);

  const titulo = (
    <TituloReporte
      titulo="Balances"
      descripcion="Sumas y saldos, estado de situación patrimonial y estado de recursos y gastos."
    />
  );

  const periodo = resolverPeriodo(
    ejercicios ?? [],
    { ejercicio: param("ejercicio"), desde: param("desde"), hasta: param("hasta") },
    hoyUruguay()
  );
  if (!periodo) {
    return (
      <div className="space-y-6">
        {titulo}
        <SinEjercicio
          titulo="Todavía no hay ejercicios"
          descripcion="Los balances se arman sobre un ejercicio contable. Creá el primero para empezar."
          anio={hoyUruguay().slice(0, 4)}
        />
      </div>
    );
  }

  const { ejercicio, desde, hasta } = periodo;
  const plan = cuentas ?? [];
  const puedeIncluirCierre = ejercicio.estado === "cerrado" && hasta === ejercicio.fecha_fin;
  const incluyeCierre = puedeIncluirCierre && param("cierre") === "1";
  const idsResultado = plan.filter((c) => c.clase === "ingreso" || c.clase === "egreso").map((c) => c.id);

  // saldos(desde, hasta, excluir cierre) alcanza para los tres estados:
  // "anterior" acumula desde el inicio del ejercicio, así que el estado de
  // situación a `hasta` usa anterior + período.
  const [rango, conCierre, centros, lineasCentro] = await Promise.all([
    db.rpc("saldos", { p_desde: desde, p_hasta: hasta, p_excluir_cierre: true }),
    incluyeCierre
      ? db.rpc("saldos", { p_desde: desde, p_hasta: hasta, p_excluir_cierre: false })
      : Promise.resolve(null),
    verCentros ? db.from("centros_costo").select("id, codigo, nombre, disciplina_id") : Promise.resolve(null),
    verCentros && idsResultado.length > 0
      ? leerPaginado((a, b) =>
          db
            .from("lineas")
            .select("id, cuenta_id, centro_costo_id, debe, haber, asientos!inner(fecha, estado, tipo)")
            .not("centro_costo_id", "is", null)
            .in("cuenta_id", idsResultado)
            .eq("asientos.estado", "confirmado")
            .gte("asientos.fecha", desde)
            .lte("asientos.fecha", hasta)
            .not("asientos.tipo", "in", "(cierre,refundicion)")
            .order("id")
            .range(a, b)
        )
      : Promise.resolve(null),
  ]);

  const error =
    (errorCuentas && mensajeError(errorCuentas)) ||
    (rango.error && mensajeError(rango.error)) ||
    (conCierre?.error && mensajeError(conCierre.error)) ||
    (centros?.error && mensajeError(centros.error)) ||
    lineasCentro?.error ||
    null;

  const filas = rango.data ?? [];
  const cuentaResultadoId = sistema?.cuenta_id ?? plan.find((c) => c.codigo === "3.4.02")?.id ?? null;

  const sumas = sumasYSaldos(plan, conCierre?.data ?? filas);
  const situacion = estadoSituacion(plan, filas, { cuentaResultadoId });
  const resultados = estadoResultados(plan, filas);
  let porCentro: ResultadosPorCentro | null = null;
  if (verCentros && centros?.data && lineasCentro && !lineasCentro.error) {
    porCentro = resultadosPorCentro(
      plan,
      filas,
      lineasCentro.filas.map((l) => ({
        cuenta_id: l.cuenta_id,
        centro_costo_id: l.centro_costo_id,
        debe: Number(l.debe),
        haber: Number(l.haber),
      })),
      centros.data
    );
  }

  return (
    <div className="space-y-5">
      {titulo}
      <SelectorPeriodo
        ejercicios={ejercicios ?? []}
        ejercicioId={ejercicio.id}
        desde={desde}
        hasta={hasta}
        referencia={periodo.referencia}
      />
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      )}
      <BalanceCliente
        key={`${ejercicio.id}-${desde}-${hasta}-${incluyeCierre ? "c" : ""}`}
        tabInicial={tab}
        ejercicioNombre={ejercicio.nombre}
        desde={desde}
        hasta={hasta}
        sumas={sumas}
        situacion={situacion}
        resultados={resultados}
        porCentro={porCentro}
        verCentros={verCentros}
        incluyeCierre={incluyeCierre}
        puedeIncluirCierre={puedeIncluirCierre}
        destacados={[cuentaResultadoId ?? ID_RESULTADO_SINTETICO, ID_RESULTADO_SINTETICO]}
      />
    </div>
  );
}
