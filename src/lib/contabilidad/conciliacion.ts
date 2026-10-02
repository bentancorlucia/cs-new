/**
 * Conciliación bancaria: lecturas compartidas entre las pantallas de
 * /contabilidad/conciliacion y el servidor MCP.
 *
 * No crea clientes: recibe el cliente del schema `contabilidad` con la
 * sesión (o el token) del usuario, así la base aplica sus permisos. Las
 * escrituras van por las funciones RPC (`importar_extracto`, `conciliar`,
 * `contabilizar_movimiento_extracto`, `cerrar_extracto`…), que validan todo.
 *
 * Importes "en moneda de la cuenta": cuenta en pesos → debe − haber;
 * cuenta en dólares → ± importe_origen (igual que `_importe_en_moneda`).
 * Movimientos del banco: + entra a la cuenta, − sale.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/contabilidad";
import { mensajeError } from "./formato";
import { leerPaginado } from "./reportes";
import { aCentavos } from "./parsear-itau";

export type Conta = SupabaseClient<Database, "contabilidad">;

/** Asientos que no se concilian: no son movimientos de fondos. */
export const TIPOS_NO_CONCILIABLES = ["apertura", "cierre", "refundicion", "revaluacion"] as const;

export type EstadoExtracto = "abierto" | "cerrado";

export type ExtractoResumen = {
  id: string;
  cuentaId: string;
  fechaDesde: string;
  fechaHasta: string;
  saldoInicial: number;
  saldoFinal: number;
  estado: EstadoExtracto;
  archivo: string | null;
  createdAt: string;
  cerradoAt: string | null;
  movimientos: number;
  conciliados: number;
};

export type EstadoMes = "conciliado" | "en_curso" | "sin_extracto";

export type CuentaConciliable = {
  id: string;
  codigo: string;
  nombre: string;
  moneda: string | null;
  activa: boolean;
  extractos: ExtractoResumen[];
  ultimo: ExtractoResumen | null;
  /** Fin del último extracto cerrado (en orden). */
  conciliadoHasta: string | null;
  /** Desde dónde va el próximo extracto (día siguiente al último). */
  proximoDesde: string | null;
};

export type MovimientoBanco = {
  id: number;
  orden: number;
  fecha: string;
  concepto: string;
  referencia: string | null;
  importe: number;
  saldo: number | null;
  conciliacionId: number | null;
};

export type LineaLibros = {
  id: number;
  asientoId: string;
  numero: number | null;
  fecha: string;
  /** Descripción del asiento. */
  descripcion: string;
  /** Detalle propio de la línea, si tiene y es distinto. */
  detalle: string | null;
  tipoAsiento: string;
  origenTipo: string | null;
  origenId: string | null;
  revertido: boolean;
  /** En la moneda de la cuenta. */
  importe: number;
};

export type GrupoConciliado = {
  id: number;
  createdAt: string;
  movimientos: MovimientoBanco[];
  lineas: LineaLibros[];
  /** El asiento lo generó "Registrar en libros" desde el extracto. */
  registradoDesdeExtracto: boolean;
};

export type ResumenConciliacion = {
  saldoBanco: number;
  saldoLibros: number;
  pendientes: number;
  cantidadPendientes: number;
  diferenciaInicial: number;
  movimientosSinConciliar: number;
  diferencia: number;
};

export type Sugerencia = { movimientoId: number; lineaId: number; dias: number };

export type DetalleExtracto = {
  extracto: ExtractoResumen;
  cuenta: { id: string; codigo: string; nombre: string; moneda: string | null };
  movimientos: MovimientoBanco[];
  pendientesBanco: MovimientoBanco[];
  pendientesLibros: LineaLibros[];
  conciliados: GrupoConciliado[];
  resumen: ResumenConciliacion | null;
  sugerencias: Sugerencia[];
  /** Es el último de la cuenta (el único que se puede borrar). */
  esUltimo: boolean;
  anterior: { id: string; estado: EstadoExtracto } | null;
  siguiente: { id: string; estado: EstadoExtracto } | null;
};

// ------------------------------------------------------------
// Utilidades puras
// ------------------------------------------------------------

/** Importe de una línea en la moneda de su cuenta (+ debe, − haber). */
export function importeEnMoneda(l: {
  debe: number;
  haber: number;
  moneda: string | null;
  importe_origen: number | null;
}): number {
  const moneda = l.moneda?.trim() || null;
  if (!moneda) return (aCentavos(Number(l.debe)) - aCentavos(Number(l.haber))) / 100;
  const origen = Number(l.importe_origen ?? 0);
  return Number(l.debe) > 0 ? origen : -origen;
}

/** Suma exacta en centavos. */
export function sumar(importes: number[]): number {
  return importes.reduce((s, n) => s + aCentavos(n), 0) / 100;
}

export function sumarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Último día del mes de una fecha ISO. */
export function finDeMes(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * Estado de cada mes del año según los extractos: conciliado si los
 * extractos cerrados cubren el mes entero; en curso si algún extracto lo
 * toca; si no, sin extracto.
 */
export function mesesDelAnio(extractos: ExtractoResumen[], anio: number): EstadoMes[] {
  return Array.from({ length: 12 }, (_, i) => {
    const desde = `${anio}-${String(i + 1).padStart(2, "0")}-01`;
    const hasta = finDeMes(desde);
    const tocan = extractos.filter((e) => e.fechaDesde <= hasta && e.fechaHasta >= desde);
    if (tocan.length === 0) return "sin_extracto";
    const cerrados = tocan
      .filter((e) => e.estado === "cerrado")
      .sort((a, b) => a.fechaDesde.localeCompare(b.fechaDesde));
    let cubierto = desde;
    for (const e of cerrados) {
      if (e.fechaDesde > cubierto) break;
      if (e.fechaHasta >= cubierto) cubierto = sumarDias(e.fechaHasta, 1);
    }
    return cubierto > hasta ? "conciliado" : "en_curso";
  });
}

// ------------------------------------------------------------
// Lecturas
// ------------------------------------------------------------

type FilaExtracto = {
  id: string;
  cuenta_id: string;
  fecha_desde: string;
  fecha_hasta: string;
  saldo_inicial: number;
  saldo_final: number;
  estado: string;
  archivo: string | null;
  created_at: string;
  cerrado_at: string | null;
  extracto_movimientos: { count: number }[];
  conciliaciones: { conciliacion_movimientos: { count: number }[] }[];
};

const SELECT_EXTRACTO =
  "id, cuenta_id, fecha_desde, fecha_hasta, saldo_inicial, saldo_final, estado, archivo, created_at, cerrado_at, " +
  "extracto_movimientos(count), conciliaciones(conciliacion_movimientos(count))";

function mapearExtracto(e: FilaExtracto): ExtractoResumen {
  return {
    id: e.id,
    cuentaId: e.cuenta_id,
    fechaDesde: e.fecha_desde,
    fechaHasta: e.fecha_hasta,
    saldoInicial: Number(e.saldo_inicial),
    saldoFinal: Number(e.saldo_final),
    estado: e.estado === "cerrado" ? "cerrado" : "abierto",
    archivo: e.archivo,
    createdAt: e.created_at,
    cerradoAt: e.cerrado_at,
    movimientos: e.extracto_movimientos?.[0]?.count ?? 0,
    conciliados: (e.conciliaciones ?? []).reduce(
      (s, c) => s + (c.conciliacion_movimientos?.[0]?.count ?? 0),
      0
    ),
  };
}

/** Extractos de una cuenta (o de todas), del más nuevo al más viejo. */
export async function listarExtractos(
  conta: Conta,
  cuentaId?: string
): Promise<{ extractos: ExtractoResumen[]; error: string | null }> {
  const { filas, error } = await leerPaginado<FilaExtracto>((a, b) => {
    let q = conta.from("extractos").select(SELECT_EXTRACTO);
    if (cuentaId) q = q.eq("cuenta_id", cuentaId);
    return q
      .order("fecha_desde", { ascending: false })
      .range(a, b)
      .returns<FilaExtracto[]>();
  });
  return { extractos: filas.map(mapearExtracto), error };
}

/**
 * Cuentas de caja y banco imputables con sus extractos. Las inactivas
 * aparecen solo si tienen extractos.
 */
export async function listarCuentasConciliables(
  conta: Conta
): Promise<{ cuentas: CuentaConciliable[]; error: string | null }> {
  const [cuentasRes, extractosRes] = await Promise.all([
    conta
      .from("cuentas")
      .select("id, codigo, nombre, moneda, activa")
      .eq("es_disponibilidad", true)
      .eq("imputable", true)
      .order("codigo"),
    listarExtractos(conta),
  ]);
  if (cuentasRes.error) return { cuentas: [], error: mensajeError(cuentasRes.error) };

  const porCuenta = new Map<string, ExtractoResumen[]>();
  for (const e of extractosRes.extractos) {
    porCuenta.set(e.cuentaId, [...(porCuenta.get(e.cuentaId) ?? []), e]);
  }

  const cuentas = (cuentasRes.data ?? [])
    .filter((c) => c.activa || porCuenta.has(c.id))
    .map((c): CuentaConciliable => {
      const extractos = porCuenta.get(c.id) ?? [];
      const ultimo = extractos[0] ?? null;
      // Se cierran en orden: el último cerrado marca hasta dónde está conciliado.
      const cerrado = extractos.find((e) => e.estado === "cerrado") ?? null;
      return {
        id: c.id,
        codigo: c.codigo,
        nombre: c.nombre,
        moneda: c.moneda?.trim() || null,
        activa: c.activa,
        extractos,
        ultimo,
        conciliadoHasta: cerrado?.fechaHasta ?? null,
        proximoDesde: ultimo ? sumarDias(ultimo.fechaHasta, 1) : null,
      };
    });
  return { cuentas, error: extractosRes.error };
}

type FilaMovimiento = {
  id: number;
  orden: number;
  fecha: string;
  concepto: string;
  referencia: string | null;
  importe: number;
  saldo: number | null;
  conciliacion_movimientos: { conciliacion_id: number } | null;
};

function mapearMovimiento(m: FilaMovimiento): MovimientoBanco {
  return {
    id: m.id,
    orden: m.orden,
    fecha: m.fecha,
    concepto: m.concepto,
    referencia: m.referencia,
    importe: Number(m.importe),
    saldo: m.saldo === null ? null : Number(m.saldo),
    conciliacionId: m.conciliacion_movimientos?.conciliacion_id ?? null,
  };
}

type FilaLinea = {
  id: number;
  debe: number;
  haber: number;
  moneda: string | null;
  importe_origen: number | null;
  descripcion: string | null;
  asientos: {
    id: string;
    numero: number | null;
    fecha: string;
    descripcion: string;
    tipo: string;
    origen_tipo: string | null;
    origen_id: string | null;
    revertido_por_id: string | null;
  } | null;
};

const SELECT_LINEA =
  "id, debe, haber, moneda, importe_origen, descripcion, " +
  "asientos!inner(id, numero, fecha, descripcion, tipo, origen_tipo, origen_id, revertido_por_id)";

function mapearLinea(l: FilaLinea): LineaLibros {
  const a = l.asientos;
  const detalle = l.descripcion?.trim() || null;
  return {
    id: l.id,
    asientoId: a?.id ?? "",
    numero: a?.numero ?? null,
    fecha: a?.fecha ?? "",
    descripcion: a?.descripcion || detalle || "",
    detalle: detalle && detalle !== a?.descripcion ? detalle : null,
    tipoAsiento: a?.tipo ?? "",
    origenTipo: a?.origen_tipo ?? null,
    origenId: a?.origen_id ?? null,
    revertido: !!a?.revertido_por_id,
    importe: importeEnMoneda(l),
  };
}

function ordenarLineas(a: LineaLibros, b: LineaLibros) {
  return a.fecha.localeCompare(b.fecha) || (a.numero ?? 0) - (b.numero ?? 0) || a.id - b.id;
}

/**
 * Líneas confirmadas de la cuenta, hasta la fecha, que no están conciliadas
 * con ningún extracto (excluye apertura, cierre, refundición y revaluación).
 */
export async function lineasSinConciliar(
  conta: Conta,
  cuentaId: string,
  hasta: string
): Promise<{ lineas: LineaLibros[]; error: string | null }> {
  const { filas, error } = await leerPaginado<FilaLinea>((a, b) =>
    conta
      .from("lineas")
      .select(`${SELECT_LINEA}, conciliacion_lineas(conciliacion_id)`)
      .eq("cuenta_id", cuentaId)
      .is("conciliacion_lineas", null)
      .eq("asientos.estado", "confirmado")
      .not("asientos.tipo", "in", `(${TIPOS_NO_CONCILIABLES.join(",")})`)
      .lte("asientos.fecha", hasta)
      .order("id")
      .range(a, b)
      .returns<FilaLinea[]>()
  );
  return { lineas: filas.map(mapearLinea).sort(ordenarLineas), error };
}

/** Todo lo necesario para la pantalla de conciliación de un extracto. */
export async function detalleExtracto(
  conta: Conta,
  extractoId: string
): Promise<{ detalle: DetalleExtracto | null; error: string | null }> {
  const { data: e, error: errE } = await conta
    .from("extractos")
    .select(`${SELECT_EXTRACTO}, cuentas(id, codigo, nombre, moneda)`)
    .eq("id", extractoId)
    .returns<(FilaExtracto & { cuentas: { id: string; codigo: string; nombre: string; moneda: string | null } | null })[]>()
    .maybeSingle();
  if (errE) return { detalle: null, error: mensajeError(errE) };
  if (!e || !e.cuentas) return { detalle: null, error: null };
  const extracto = mapearExtracto(e);

  const [vecinosRes, movsRes, gruposRes, libros, resumenRes, sugerenciasRes] = await Promise.all([
    conta
      .from("extractos")
      .select("id, fecha_desde, estado")
      .eq("cuenta_id", extracto.cuentaId)
      .order("fecha_desde"),
    leerPaginado<FilaMovimiento>((a, b) =>
      conta
        .from("extracto_movimientos")
        .select("id, orden, fecha, concepto, referencia, importe, saldo, conciliacion_movimientos(conciliacion_id)")
        .eq("extracto_id", extractoId)
        .order("orden")
        .range(a, b)
        .returns<FilaMovimiento[]>()
    ),
    leerPaginado<{
      id: number;
      created_at: string;
      conciliacion_movimientos: { movimiento_id: number }[];
      conciliacion_lineas: { lineas: FilaLinea | null }[];
    }>((a, b) =>
      conta
        .from("conciliaciones")
        .select(`id, created_at, conciliacion_movimientos(movimiento_id), conciliacion_lineas(lineas(${SELECT_LINEA}))`)
        .eq("extracto_id", extractoId)
        .order("id", { ascending: false })
        .range(a, b)
        .returns<
          {
            id: number;
            created_at: string;
            conciliacion_movimientos: { movimiento_id: number }[];
            conciliacion_lineas: { lineas: FilaLinea | null }[];
          }[]
        >()
    ),
    lineasSinConciliar(conta, extracto.cuentaId, extracto.fechaHasta),
    conta.rpc("resumen_conciliacion", { p_extracto: extractoId }),
    extracto.estado === "abierto"
      ? conta.rpc("sugerir_conciliacion", { p_extracto: extractoId })
      : Promise.resolve({ data: [] as { movimiento_id: number; linea_id: number; dias: number }[], error: null }),
  ]);

  const movimientos = movsRes.filas.map(mapearMovimiento);
  const porId = new Map(movimientos.map((m) => [m.id, m]));
  const conciliados: GrupoConciliado[] = gruposRes.filas.map((g) => {
    const lineas = g.conciliacion_lineas
      .map((cl) => cl.lineas)
      .filter((l): l is FilaLinea => !!l)
      .map(mapearLinea)
      .sort(ordenarLineas);
    return {
      id: g.id,
      createdAt: g.created_at,
      movimientos: g.conciliacion_movimientos
        .map((cm) => porId.get(cm.movimiento_id))
        .filter((m): m is MovimientoBanco => !!m)
        .sort((a, b) => a.orden - b.orden),
      lineas,
      registradoDesdeExtracto: lineas.some((l) => l.origenTipo === "extracto"),
    };
  });

  const vecinos = vecinosRes.data ?? [];
  const i = vecinos.findIndex((v) => v.id === extractoId);
  const vecino = (j: number) =>
    j >= 0 && j < vecinos.length
      ? { id: vecinos[j].id, estado: (vecinos[j].estado === "cerrado" ? "cerrado" : "abierto") as EstadoExtracto }
      : null;

  const r = resumenRes.data?.[0];
  const resumen: ResumenConciliacion | null = r
    ? {
        saldoBanco: Number(r.saldo_banco),
        saldoLibros: Number(r.saldo_libros),
        pendientes: Number(r.pendientes),
        cantidadPendientes: Number(r.cantidad_pendientes),
        diferenciaInicial: Number(r.diferencia_inicial),
        movimientosSinConciliar: Number(r.movimientos_sin_conciliar),
        diferencia: Number(r.diferencia),
      }
    : null;

  const error =
    movsRes.error ??
    gruposRes.error ??
    libros.error ??
    (resumenRes.error ? mensajeError(resumenRes.error) : null) ??
    (sugerenciasRes.error ? mensajeError(sugerenciasRes.error) : null) ??
    (vecinosRes.error ? mensajeError(vecinosRes.error) : null);

  return {
    detalle: {
      extracto,
      cuenta: { ...e.cuentas, moneda: e.cuentas.moneda?.trim() || null },
      movimientos,
      pendientesBanco: movimientos.filter((m) => m.conciliacionId === null),
      pendientesLibros: libros.lineas,
      conciliados,
      resumen,
      sugerencias: (sugerenciasRes.data ?? []).map((s) => ({
        movimientoId: s.movimiento_id,
        lineaId: s.linea_id,
        dias: s.dias,
      })),
      esUltimo: i === vecinos.length - 1,
      anterior: vecino(i - 1),
      siguiente: vecino(i + 1),
    },
    error,
  };
}
