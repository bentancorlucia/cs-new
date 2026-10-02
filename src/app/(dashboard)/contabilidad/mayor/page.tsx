import { createContabilidadClient } from "@/lib/contabilidad/server";
import { createServerClient } from "@/lib/supabase/server";
import { hoyUruguay, mensajeError, saldoPresentacion } from "@/lib/contabilidad/formato";
import {
  COLUMNAS_CUENTA_PLAN,
  compararCodigo,
  leerPaginado,
  resolverPeriodo,
  signoClase,
  type ImporteAuxiliar,
  type MovimientoMayor,
} from "@/lib/contabilidad/reportes";
import { SinEjercicio } from "@/components/contabilidad/reportes/sin-ejercicio";
import { SelectorPeriodo } from "@/components/contabilidad/reportes/selector-periodo";
import { MayorCliente, type CuentaMayor } from "@/components/contabilidad/reportes/mayor-cliente";
import { TituloReporte } from "@/components/contabilidad/reportes/titulo-reporte";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LibroMayorPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const param = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const db = await createContabilidadClient();
  const [{ data: ejercicios }, { data: cuentasData }, { data: centrosData }] = await Promise.all([
    db.from("ejercicios").select("id, nombre, fecha_inicio, fecha_fin, estado").order("fecha_inicio"),
    db.from("cuentas").select(COLUMNAS_CUENTA_PLAN).eq("imputable", true),
    db.from("centros_costo").select("id, nombre"),
  ]);

  const titulo = (
    <TituloReporte
      titulo="Libro mayor"
      descripcion="Movimientos de una cuenta con su saldo acumulado. Solo asientos confirmados."
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
          descripcion="Para consultar el libro mayor primero hay que crear el ejercicio contable."
          anio={hoyUruguay().slice(0, 4)}
        />
      </div>
    );
  }

  const cuentas = [...(cuentasData ?? [])].sort((a, b) => compararCodigo(a.codigo, b.codigo));
  const opciones = cuentas.map((c) => ({
    id: c.id,
    codigo: c.codigo,
    nombre: c.nombre,
    clase: c.clase,
    moneda: c.moneda,
    activa: c.activa,
  }));
  const nombresCentro: Record<string, string> = {};
  for (const c of centrosData ?? []) nombresCentro[c.id] = c.nombre;

  const elegida = cuentas.find((c) => c.id === param("cuenta")) ?? null;
  const { ejercicio, desde, hasta } = periodo;

  let movimientos: MovimientoMayor[] = [];
  let saldoAnterior = 0;
  let saldoAnteriorOrigen = 0;
  let anterioresAuxiliar: ImporteAuxiliar[] = [];
  const nombresAuxiliar: Record<number, string> = {};
  let error: string | null = null;

  if (elegida) {
    const tipoAux = elegida.requiere_auxiliar;
    const [mayor, saldo, anteriores] = await Promise.all([
      // PostgREST también corta las funciones en max_rows: se pide por lotes.
      // Sin .order(): libro_mayor ya devuelve las filas ordenadas (fecha,
      // número, orden de línea) y reordenar acá perdería el orden de línea.
      leerPaginado<MovimientoMayor>((a, b) =>
        db.rpc("libro_mayor", { p_cuenta: elegida.id, p_desde: desde, p_hasta: hasta }).range(a, b)
      ),
      db.rpc("saldos", { p_desde: desde, p_hasta: hasta }).eq("cuenta_id", elegida.id).maybeSingle(),
      // Saldo anterior por auxiliar: líneas del ejercicio previas a `desde`
      tipoAux && desde > ejercicio.fecha_inicio
        ? leerPaginado((a, b) =>
            db
              .from("lineas")
              .select("id, debe, haber, importe_origen, proveedor_id, disciplina_id, asientos!inner(fecha, estado)")
              .eq("cuenta_id", elegida.id)
              .eq("asientos.estado", "confirmado")
              .gte("asientos.fecha", ejercicio.fecha_inicio)
              .lt("asientos.fecha", desde)
              .order("id")
              .range(a, b)
          )
        : Promise.resolve({ filas: [], error: null }),
    ]);

    if (mayor.error) error = mayor.error;
    else if (saldo.error) error = mensajeError(saldo.error);
    else if (anteriores.error) error = anteriores.error;

    movimientos = mayor.filas;
    if (saldo.data) {
      saldoAnterior = saldoPresentacion(
        elegida.clase,
        Number(saldo.data.debe_anterior ?? 0),
        Number(saldo.data.haber_anterior ?? 0)
      );
      saldoAnteriorOrigen = signoClase(elegida.clase) * Number(saldo.data.origen_anterior ?? 0);
    }

    if (tipoAux) {
      anterioresAuxiliar = anteriores.filas.map((l) => {
        const debe = Number(l.debe);
        const io = Number(l.importe_origen ?? 0);
        return {
          auxiliarId: (tipoAux === "proveedor" ? l.proveedor_id : l.disciplina_id) ?? null,
          debe,
          haber: Number(l.haber),
          origen: debe > 0 ? io : -io,
        };
      });
      const ids = new Set<number>();
      for (const a of anterioresAuxiliar) if (a.auxiliarId !== null) ids.add(a.auxiliarId);
      for (const m of movimientos) {
        const id = tipoAux === "proveedor" ? m.proveedor_id : m.disciplina_id;
        if (id != null) ids.add(id);
      }
      if (ids.size > 0) {
        const pub = await createServerClient();
        const { data } =
          tipoAux === "proveedor"
            ? await pub.from("proveedores").select("id, nombre").in("id", [...ids])
            : await pub.from("disciplinas").select("id, nombre").in("id", [...ids]);
        for (const r of data ?? []) nombresAuxiliar[r.id] = r.nombre;
      }
    }
  }

  const cuentaMayor: CuentaMayor | null = elegida
    ? {
        id: elegida.id,
        codigo: elegida.codigo,
        nombre: elegida.nombre,
        clase: elegida.clase,
        moneda: elegida.moneda,
        activa: elegida.activa,
        requiere_auxiliar: elegida.requiere_auxiliar,
      }
    : null;

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
      <MayorCliente
        key={`${elegida?.id ?? "ninguna"}-${desde}-${hasta}`}
        cuentas={opciones}
        cuenta={cuentaMayor}
        desde={desde}
        hasta={hasta}
        ejercicioNombre={ejercicio.nombre}
        movimientos={movimientos}
        saldoAnterior={saldoAnterior}
        saldoAnteriorOrigen={saldoAnteriorOrigen}
        anterioresAuxiliar={anterioresAuxiliar}
        nombresAuxiliar={nombresAuxiliar}
        nombresCentro={nombresCentro}
        error={error}
      />
    </div>
  );
}
