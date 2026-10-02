/**
 * Flujo de caja real (método directo) y proyección de disponibilidades.
 *
 * Lectura reutilizable: las funciones reciben el cliente de Supabase del
 * schema `contabilidad` (y el de `comercial` para los vencimientos de
 * proveedores), así sirven tanto para las pantallas como para el MCP.
 *
 * Fuente de los números (ver migración contabilidad_flujo_conciliacion):
 *   - `flujo_caja(desde, hasta, disponibilidad?)`: por mes y contrapartida
 *     (cuenta + centro), + entra / − sale. La fila con revaluacion = true y
 *     cuenta nula es la diferencia de cambio de las disponibilidades en USD.
 *   - `saldo_disponibilidades(fecha, disponibilidad?)`: saldo AL EMPEZAR el día.
 *   - Identidad: saldo(desde) + Σ flujo = saldo(hasta + 1).
 *
 * Proyección: presupuesto aprobado del ejercicio (solo cuentas con
 * `afecta_caja`), o el promedio real de los últimos meses si no hay. Los
 * vencimientos de proveedores van aparte, como dato informativo: el
 * presupuesto ya incluye esos gastos y sumarlos los contaría dos veces.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database as DbContabilidad } from "@/types/contabilidad";
import type { Database as DbComercial } from "@/types/comercial";
import { mensajeError, NOMBRE_MES, type ClaseCuenta } from "./formato";
import {
  compararCodigo,
  finDeMes,
  inicioDeMes,
  leerPaginado,
  redondear,
  sumarDias,
  type EjercicioResumen,
} from "./reportes";

export type ClienteContable = SupabaseClient<DbContabilidad, "contabilidad">;
export type ClienteComercial = SupabaseClient<DbComercial, "comercial">;

type Funciones = DbContabilidad["contabilidad"]["Functions"];
type FilaFlujoCajaDb = Funciones["flujo_caja"]["Returns"][number];

// ------------------------------------------------------------
// Tipos
// ------------------------------------------------------------

export interface CuentaFlujo {
  id: string;
  codigo: string;
  nombre: string;
  padre_id: string | null;
  nivel: number;
  clase: ClaseCuenta;
  imputable: boolean;
  es_disponibilidad: boolean;
  afecta_caja: boolean;
  moneda: string | null;
  activa: boolean;
}

export const COLUMNAS_CUENTA_FLUJO =
  "id, codigo, nombre, padre_id, nivel, clase, imputable, es_disponibilidad, afecta_caja, moneda, activa";

export interface CentroFlujo {
  id: string;
  codigo: string;
  nombre: string;
  disciplina_id: number | null;
}

/** Fila de flujo_caja con los importes ya como número. */
export interface MovimientoFlujo {
  anio: number;
  mes: number;
  cuenta_id: string | null;
  centro_costo_id: string | null;
  importe: number;
  revaluacion: boolean;
}

export interface MesFlujo {
  /** "YYYY-MM" */
  clave: string;
  anio: number;
  mes: number;
  /** Primer y último día del mes dentro del rango consultado. */
  desde: string;
  hasta: string;
}

export type AgrupacionFlujo = "plan" | "centro";

/** Grupo (rubro del plan o centro de costo) o cuenta, con importes por mes. */
export interface FilaFlujo {
  id: string;
  codigo: string | null;
  nombre: string;
  /** "Disciplina" / "Área" al agrupar por centro. */
  etiqueta: string | null;
  porMes: number[];
  total: number;
  hijos: FilaFlujo[];
}

/** Ingresos o egresos. En egresos los importes van en positivo (lo que salió). */
export interface SeccionFlujo {
  grupos: FilaFlujo[];
  porMes: number[];
  total: number;
}

export interface ControlFlujo {
  /** Saldo final según los libros (saldo_disponibilidades del día siguiente). */
  saldoLibros: number;
  /** Saldo final calculado: inicial + ingresos − egresos + diferencia de cambio. */
  saldoCalculado: number;
  diferencia: number;
  cuadra: boolean;
  /**
   * "siguiente": saldo_disponibilidades(hasta + 1).
   * "mismo_dia": el día siguiente no tiene ejercicio (todavía no se creó);
   * se usa saldo_disponibilidades(hasta) + el flujo del día `hasta`.
   */
  metodo: "siguiente" | "mismo_dia";
}

export interface EstadoFlujo {
  desde: string;
  hasta: string;
  disponibilidad: Pick<CuentaFlujo, "id" | "codigo" | "nombre" | "moneda"> | null;
  agrupacion: AgrupacionFlujo;
  meses: MesFlujo[];
  saldoInicial: number;
  saldoFinal: number;
  saldoInicialMes: number[];
  saldoFinalMes: number[];
  ingresos: SeccionFlujo;
  egresos: SeccionFlujo;
  revaluacion: { porMes: number[]; total: number };
  variacionMes: number[];
  variacion: number;
  control: ControlFlujo;
}

// ------------------------------------------------------------
// Meses
// ------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, "0");

export function claveMes(anio: number, mes: number): string {
  return `${anio}-${pad2(mes)}`;
}

/** Suma meses a una clave "YYYY-MM". */
export function sumarMeses(clave: string, n: number): string {
  const [y, m] = clave.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return claveMes(Math.floor(total / 12), (total % 12) + 1);
}

/** "2026-10" → "Oct 2026" (o "Octubre" con `largo` y sin año). */
export function nombreMes(clave: string, opciones: { largo?: boolean; anio?: boolean } = {}): string {
  const [y, m] = clave.split("-").map(Number);
  const nombre = NOMBRE_MES[m - 1] ?? clave;
  const base = opciones.largo ? nombre : nombre.slice(0, 3);
  return opciones.anio === false ? base : `${base} ${y}`;
}

/** Meses que toca el rango [desde, hasta], cada uno recortado al rango. */
export function mesesDelRango(desde: string, hasta: string): MesFlujo[] {
  const meses: MesFlujo[] = [];
  let d = desde;
  while (d <= hasta && meses.length < 600) {
    const fm = finDeMes(d);
    const [anio, mes] = d.split("-").map(Number);
    meses.push({ clave: claveMes(anio, mes), anio, mes, desde: d, hasta: fm < hasta ? fm : hasta });
    d = sumarDias(fm, 1);
  }
  return meses;
}

// ------------------------------------------------------------
// Lecturas
// ------------------------------------------------------------

function num(v: number | string | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function falla(contexto: string, error: { message?: string; code?: string } | string | null | undefined): never {
  const texto = typeof error === "string" ? error : mensajeError(error);
  throw new Error(`${contexto}: ${texto}`);
}

export async function leerCuentasFlujo(db: ClienteContable): Promise<CuentaFlujo[]> {
  const { data, error } = await db.from("cuentas").select(COLUMNAS_CUENTA_FLUJO);
  if (error) falla("No se pudo leer el plan de cuentas", error);
  return (data ?? []) as CuentaFlujo[];
}

export async function leerCentrosFlujo(db: ClienteContable): Promise<CentroFlujo[]> {
  const { data, error } = await db.from("centros_costo").select("id, codigo, nombre, disciplina_id");
  if (error) falla("No se pudieron leer los centros de costo", error);
  return data ?? [];
}

export async function leerEjercicios(db: ClienteContable): Promise<EjercicioResumen[]> {
  const { data, error } = await db
    .from("ejercicios")
    .select("id, nombre, fecha_inicio, fecha_fin, estado")
    .order("fecha_inicio");
  if (error) falla("No se pudieron leer los ejercicios", error);
  return data ?? [];
}

/** Saldo de las disponibilidades (o de una) al empezar el día `fecha`, en pesos. */
export async function saldoDisponibilidades(
  db: ClienteContable,
  fecha: string,
  disponibilidad?: string | null
): Promise<number> {
  const { data, error } = await db.rpc("saldo_disponibilidades", {
    p_fecha: fecha,
    ...(disponibilidad ? { p_disponibilidad: disponibilidad } : {}),
  });
  if (error) falla("No se pudo calcular el saldo de disponibilidades", error);
  return num(data);
}

/** `flujo_caja` completo (paginado: PostgREST corta también lo que devuelven las funciones). */
export async function leerFlujoCaja(
  db: ClienteContable,
  desde: string,
  hasta: string,
  disponibilidad?: string | null
): Promise<MovimientoFlujo[]> {
  const { filas, error } = await leerPaginado<FilaFlujoCajaDb>((a, b) =>
    db
      .rpc("flujo_caja", {
        p_desde: desde,
        p_hasta: hasta,
        ...(disponibilidad ? { p_disponibilidad: disponibilidad } : {}),
      })
      .order("anio")
      .order("mes")
      .order("revaluacion")
      .order("cuenta_id")
      .order("centro_costo_id")
      .range(a, b)
  );
  if (error) falla("No se pudo calcular el flujo de caja", error);
  return filas.map((f) => ({
    anio: num(f.anio),
    mes: num(f.mes),
    cuenta_id: f.cuenta_id ?? null,
    centro_costo_id: f.centro_costo_id ?? null,
    importe: num(f.importe),
    revaluacion: !!f.revaluacion,
  }));
}

// ------------------------------------------------------------
// Armado del estado (puro)
// ------------------------------------------------------------

const ID_TRASPASOS = "traspasos";
const ID_SIN_CENTRO = "sin-centro";

function esResultado(clase: ClaseCuenta): boolean {
  return clase === "ingreso" || clase === "egreso";
}

/**
 * Rubro de una cuenta para el estado de flujo: en resultados el antepasado
 * de nivel 2 (4.1 Recursos para fines generales); en patrimoniales el de
 * nivel 3 (2.1.01 Deudas comerciales), porque el nivel 2 solo dice
 * corriente / no corriente.
 */
function rubroDe(porId: Map<string, CuentaFlujo>, cuenta: CuentaFlujo): CuentaFlujo {
  const nivel = esResultado(cuenta.clase) ? 2 : 3;
  let c: CuentaFlujo | undefined = cuenta;
  while (c && c.nivel > nivel && c.padre_id) {
    const padre = porId.get(c.padre_id);
    if (!padre) break;
    c = padre;
  }
  return c ?? cuenta;
}

type Seccion = "ingresos" | "egresos";

interface Acumulador {
  fila: FilaFlujo;
  orden: string;
  hijos: Map<string, FilaFlujo>;
}

function filaVacia(id: string, codigo: string | null, nombre: string, n: number, etiqueta: string | null = null): FilaFlujo {
  return { id, codigo, nombre, etiqueta, porMes: new Array(n).fill(0), total: 0, hijos: [] };
}

function redondearFila(f: FilaFlujo): FilaFlujo {
  return {
    ...f,
    porMes: f.porMes.map(redondear),
    total: redondear(f.total),
    hijos: f.hijos.map(redondearFila),
  };
}

/**
 * Reparte movimientos (sin revaluación) en ingresos y egresos agrupados.
 * La sección la decide la cuenta: ingresos y egresos por su clase; una
 * patrimonial (proveedores, anticipos, traspasos…) por el signo de su neto
 * en todo el rango, así cada cuenta aparece en un solo lugar y una
 * devolución en el mismo período resta en vez de duplicar la fila.
 */
export function armarSecciones(
  movimientos: MovimientoFlujo[],
  meses: string[],
  cuentas: CuentaFlujo[],
  centros: CentroFlujo[],
  agrupacion: AgrupacionFlujo
): { ingresos: SeccionFlujo; egresos: SeccionFlujo } {
  const n = meses.length;
  const indiceMes = new Map(meses.map((m, i) => [m, i]));
  const porId = new Map(cuentas.map((c) => [c.id, c]));
  const centroPorId = new Map(centros.map((c) => [c.id, c]));

  const netoPorCuenta = new Map<string, number>();
  for (const m of movimientos) {
    if (m.revaluacion || !m.cuenta_id) continue;
    netoPorCuenta.set(m.cuenta_id, (netoPorCuenta.get(m.cuenta_id) ?? 0) + m.importe);
  }
  const seccionDe = (c: CuentaFlujo): Seccion => {
    if (c.clase === "ingreso") return "ingresos";
    if (c.clase === "egreso") return "egresos";
    return (netoPorCuenta.get(c.id) ?? 0) >= 0 ? "ingresos" : "egresos";
  };

  const grupos: Record<Seccion, Map<string, Acumulador>> = { ingresos: new Map(), egresos: new Map() };
  const totales: Record<Seccion, number[]> = { ingresos: new Array(n).fill(0), egresos: new Array(n).fill(0) };

  const grupoPara = (c: CuentaFlujo, centroId: string | null): { id: string; codigo: string | null; nombre: string; etiqueta: string | null; orden: string } => {
    if (agrupacion === "centro") {
      const centro = centroId ? centroPorId.get(centroId) : undefined;
      if (!centro) return { id: ID_SIN_CENTRO, codigo: null, nombre: "Sin centro de costo", etiqueta: null, orden: "3" };
      const disciplina = centro.disciplina_id !== null;
      return {
        id: centro.id,
        codigo: centro.codigo,
        nombre: centro.nombre,
        etiqueta: disciplina ? "Disciplina" : "Área",
        orden: `${disciplina ? "1" : "2"}${centro.nombre.toLocaleLowerCase("es")}`,
      };
    }
    if (c.es_disponibilidad) {
      return { id: ID_TRASPASOS, codigo: null, nombre: "Traspasos con otras cajas y bancos", etiqueta: null, orden: "9" };
    }
    const r = rubroDe(porId, c);
    return { id: r.id, codigo: r.codigo, nombre: r.nombre, etiqueta: null, orden: "" };
  };

  for (const m of movimientos) {
    if (m.revaluacion || !m.cuenta_id) continue;
    const i = indiceMes.get(claveMes(m.anio, m.mes));
    if (i === undefined) continue;
    const c = porId.get(m.cuenta_id);
    if (!c) continue;
    const s = seccionDe(c);
    const valor = s === "ingresos" ? m.importe : -m.importe;
    const g = grupoPara(c, m.centro_costo_id);

    let acc = grupos[s].get(g.id);
    if (!acc) {
      acc = { fila: filaVacia(g.id, g.codigo, g.nombre, n, g.etiqueta), orden: g.orden, hijos: new Map() };
      grupos[s].set(g.id, acc);
    }
    acc.fila.porMes[i] += valor;
    acc.fila.total += valor;
    totales[s][i] += valor;

    // Una cuenta que es su propio rubro (sin agrupadora arriba) va sin hijos.
    if (g.id !== c.id) {
      let h = acc.hijos.get(c.id);
      if (!h) {
        h = filaVacia(c.id, c.codigo, c.nombre, n);
        acc.hijos.set(c.id, h);
      }
      h.porMes[i] += valor;
      h.total += valor;
    }
  }

  const cerrar = (s: Seccion): SeccionFlujo => {
    const lista = [...grupos[s].values()]
      .map((a) => ({
        orden: a.orden,
        fila: {
          ...a.fila,
          hijos: [...a.hijos.values()].sort((x, y) => compararCodigo(x.codigo ?? "", y.codigo ?? "")),
        },
      }))
      .sort((a, b) =>
        agrupacion === "centro"
          ? a.orden.localeCompare(b.orden, "es")
          : a.orden.localeCompare(b.orden) || compararCodigo(a.fila.codigo ?? "", b.fila.codigo ?? "")
      )
      .map((x) => redondearFila(x.fila));
    const porMes = totales[s].map(redondear);
    return { grupos: lista, porMes, total: redondear(porMes.reduce((a, b) => a + b, 0)) };
  };

  return { ingresos: cerrar("ingresos"), egresos: cerrar("egresos") };
}

/** Estado de flujo a partir de movimientos ya leídos (puro). */
export function armarEstadoFlujo(args: {
  desde: string;
  hasta: string;
  movimientos: MovimientoFlujo[];
  cuentas: CuentaFlujo[];
  centros: CentroFlujo[];
  agrupacion: AgrupacionFlujo;
  saldoInicial: number;
  saldoLibros: number;
  metodoControl: ControlFlujo["metodo"];
  disponibilidad: EstadoFlujo["disponibilidad"];
}): EstadoFlujo {
  const meses = mesesDelRango(args.desde, args.hasta);
  const claves = meses.map((m) => m.clave);
  const n = meses.length;
  const { ingresos, egresos } = armarSecciones(args.movimientos, claves, args.cuentas, args.centros, args.agrupacion);

  const indiceMes = new Map(claves.map((m, i) => [m, i]));
  const reval = new Array(n).fill(0);
  for (const m of args.movimientos) {
    if (!m.revaluacion) continue;
    const i = indiceMes.get(claveMes(m.anio, m.mes));
    if (i !== undefined) reval[i] += m.importe;
  }
  const revaluacion = { porMes: reval.map(redondear), total: redondear(reval.reduce((a, b) => a + b, 0)) };

  const variacionMes = claves.map((_, i) => redondear(ingresos.porMes[i] - egresos.porMes[i] + revaluacion.porMes[i]));
  const saldoInicialMes: number[] = [];
  const saldoFinalMes: number[] = [];
  let saldo = redondear(args.saldoInicial);
  for (let i = 0; i < n; i++) {
    saldoInicialMes.push(saldo);
    saldo = redondear(saldo + variacionMes[i]);
    saldoFinalMes.push(saldo);
  }
  const variacion = redondear(variacionMes.reduce((a, b) => a + b, 0));
  const saldoCalculado = redondear(args.saldoInicial + variacion);
  const diferencia = redondear(saldoCalculado - args.saldoLibros);

  return {
    desde: args.desde,
    hasta: args.hasta,
    disponibilidad: args.disponibilidad,
    agrupacion: args.agrupacion,
    meses,
    saldoInicial: redondear(args.saldoInicial),
    saldoFinal: saldoCalculado,
    saldoInicialMes,
    saldoFinalMes,
    ingresos,
    egresos,
    revaluacion,
    variacionMes,
    variacion,
    control: {
      saldoLibros: redondear(args.saldoLibros),
      saldoCalculado,
      diferencia,
      cuadra: Math.abs(diferencia) < 0.005,
      metodo: args.metodoControl,
    },
  };
}

function enAlgunEjercicio(ejercicios: EjercicioResumen[], fecha: string): boolean {
  return ejercicios.some((e) => e.fecha_inicio <= fecha && fecha <= e.fecha_fin);
}

/**
 * Flujo de caja real del rango, por mes. `desde` tiene que caer en un
 * ejercicio (antes del primero no hay saldos).
 */
export async function flujoReal(
  db: ClienteContable,
  params: {
    desde: string;
    hasta: string;
    disponibilidad?: string | null;
    agrupacion?: AgrupacionFlujo;
    /** Si ya se leyeron (evita repetir la consulta). */
    cuentas?: CuentaFlujo[];
    ejercicios?: EjercicioResumen[];
  }
): Promise<EstadoFlujo> {
  const { desde, hasta } = params;
  if (hasta < desde) throw new Error("El rango de fechas está invertido");
  const disp = params.disponibilidad || null;
  const agrupacion = params.agrupacion ?? "plan";
  const siguiente = sumarDias(hasta, 1);

  const [cuentas, ejercicios, centros] = await Promise.all([
    params.cuentas ?? leerCuentasFlujo(db),
    params.ejercicios ?? leerEjercicios(db),
    agrupacion === "centro" ? leerCentrosFlujo(db) : Promise.resolve([] as CentroFlujo[]),
  ]);
  const metodo: ControlFlujo["metodo"] = enAlgunEjercicio(ejercicios, siguiente) ? "siguiente" : "mismo_dia";

  const [movimientos, saldoInicial, saldoLibros] = await Promise.all([
    leerFlujoCaja(db, desde, hasta, disp),
    saldoDisponibilidades(db, desde, disp),
    metodo === "siguiente"
      ? saldoDisponibilidades(db, siguiente, disp)
      : Promise.all([saldoDisponibilidades(db, hasta, disp), leerFlujoCaja(db, hasta, hasta, disp)]).then(
          ([s, dia]) => s + dia.reduce((a, m) => a + m.importe, 0)
        ),
  ]);

  const cuentaDisp = disp ? cuentas.find((c) => c.id === disp) : undefined;
  return armarEstadoFlujo({
    desde,
    hasta,
    movimientos,
    cuentas,
    centros,
    agrupacion,
    saldoInicial,
    saldoLibros,
    metodoControl: metodo,
    disponibilidad: cuentaDisp
      ? { id: cuentaDisp.id, codigo: cuentaDisp.codigo, nombre: cuentaDisp.nombre, moneda: cuentaDisp.moneda }
      : null,
  });
}

// ------------------------------------------------------------
// Vencimientos de proveedores
// ------------------------------------------------------------

export interface VencimientosPorMes {
  /** Saldo pendiente ya vencido a hoy (en pesos). */
  vencido: number;
  /** Clave "YYYY-MM" → pendiente que vence ese mes (desde hoy), en pesos. */
  porMes: Map<string, number>;
  cantidad: number;
  /** Pendiente en moneda extranjera (en su moneda), convertido con `tc`. */
  extranjera: { moneda: string; importe: number; tc: number | null }[];
}

/**
 * Facturas y notas de débito de proveedores con saldo, por mes de
 * vencimiento (o de fecha, si no tienen). Mismo cálculo que
 * comercial.saldo_documento: total − aplicaciones vigentes; los anulados
 * y los de contado no deben nada. Las monedas extranjeras se pasan a
 * pesos con `tcs` (la última cotización); si falta, con el TC del documento.
 */
export async function vencimientosProveedores(
  com: ClienteComercial,
  hoy: string,
  tcs: Map<string, number>
): Promise<VencimientosPorMes> {
  const [docs, apl] = await Promise.all([
    leerPaginado((a, b) =>
      com
        .from("documentos_proveedor")
        .select("id, tipo, moneda, tc, total, fecha, vencimiento")
        .neq("tipo", "nota_credito")
        .eq("estado", "vigente")
        .eq("contado", false)
        .order("id")
        .range(a, b)
    ),
    leerPaginado((a, b) =>
      com.from("aplicaciones_proveedor").select("id, documento_id, importe").eq("vigente", true).order("id").range(a, b)
    ),
  ]);
  if (docs.error) falla("No se pudieron leer las facturas de proveedores", docs.error);
  if (apl.error) falla("No se pudieron leer los pagos a proveedores", apl.error);

  const aplicado = new Map<number, number>();
  for (const a of apl.filas) aplicado.set(a.documento_id, (aplicado.get(a.documento_id) ?? 0) + num(a.importe));

  const res: VencimientosPorMes = { vencido: 0, porMes: new Map(), cantidad: 0, extranjera: [] };
  const extranjera = new Map<string, { moneda: string; importe: number; tc: number | null }>();
  for (const d of docs.filas) {
    const saldo = redondear(num(d.total) - (aplicado.get(d.id) ?? 0));
    if (saldo <= 0) continue;
    const moneda = d.moneda.trim();
    let pesos = saldo;
    if (moneda !== "UYU") {
      const tc = tcs.get(moneda) ?? null;
      pesos = redondear(saldo * (tc ?? num(d.tc)));
      const e = extranjera.get(moneda) ?? { moneda, importe: 0, tc };
      e.importe = redondear(e.importe + saldo);
      extranjera.set(moneda, e);
    }
    const vence = d.vencimiento ?? d.fecha;
    res.cantidad++;
    if (vence < hoy) res.vencido = redondear(res.vencido + pesos);
    else {
      const k = vence.slice(0, 7);
      res.porMes.set(k, redondear((res.porMes.get(k) ?? 0) + pesos));
    }
  }
  res.extranjera = [...extranjera.values()];
  return res;
}

/** Última cotización (≤ hoy) de cada moneda, en pesos por unidad. */
export async function ultimasCotizaciones(db: ClienteContable, hoy: string): Promise<Map<string, { tasa: number; fecha: string }>> {
  const { data, error } = await db
    .from("cotizaciones")
    .select("moneda, fecha, tasa")
    .lte("fecha", hoy)
    .order("fecha", { ascending: false })
    .limit(60);
  if (error) falla("No se pudieron leer las cotizaciones", error);
  const res = new Map<string, { tasa: number; fecha: string }>();
  for (const c of data ?? []) {
    const moneda = c.moneda.trim();
    if (!res.has(moneda)) res.set(moneda, { tasa: num(c.tasa), fecha: c.fecha });
  }
  return res;
}

// ------------------------------------------------------------
// Proyección
// ------------------------------------------------------------

export type HorizonteProyeccion = "ejercicio" | "12";

export interface MesProyeccion {
  clave: string;
  /** Mes en curso: solo lo que falta (presupuesto − real a la fecha). */
  parcial: boolean;
  fuente: "presupuesto" | "promedio";
  ingresos: number;
  egresos: number;
  neto: number;
  saldoInicial: number;
  saldoFinal: number;
  /** Vencimientos de proveedores del mes (informativo, no suma al saldo). */
  vencimientos: number;
}

export interface PresupuestoUsado {
  id: string;
  nombre: string;
  version: number;
  ejercicio: string;
}

export interface ProyeccionFlujo {
  hoy: string;
  horizonte: HorizonteProyeccion;
  /** Saldo de disponibilidades al terminar hoy. */
  saldoInicial: number;
  meses: MesProyeccion[];
  ingresos: SeccionFlujo;
  egresos: SeccionFlujo;
  presupuestos: PresupuestoUsado[];
  /** Base de los meses sin presupuesto aprobado (null si no hizo falta). */
  promedio: { desde: string; hasta: string; meses: number; sinDatos: boolean } | null;
  vencimientos: {
    vencido: number;
    posterior: number;
    cantidad: number;
    extranjera: VencimientosPorMes["extranjera"];
    /** No se pudieron leer (sin permiso en compras, por ejemplo). */
    error: string | null;
  };
  /** Mes con el saldo proyectado más bajo. */
  minimo: { clave: string; saldo: number } | null;
  /** Primer mes con saldo proyectado negativo. */
  primerNegativo: string | null;
  /** Saldo real a fin de cada mes (para el gráfico), hasta hoy. */
  real: { clave: string; saldo: number }[];
}

/**
 * Proyección del saldo de disponibilidades desde hoy:
 *   - mes en curso: lo que falta (base del mes − real a la fecha, por cuenta, ≥ 0);
 *   - meses siguientes hasta fin del ejercicio (o 12 meses).
 * Base por mes: el presupuesto aprobado del ejercicio de ese mes, o el
 * promedio real de los últimos 3 meses cerrados. Solo cuentas con
 * afecta_caja (amortizaciones, revaluaciones, mermas e incobrables no mueven fondos).
 */
export async function proyeccionFlujo(
  db: ClienteContable,
  com: ClienteComercial | null,
  params: { hoy: string; horizonte?: HorizonteProyeccion; mesesPromedio?: number; mesesReales?: number }
): Promise<ProyeccionFlujo> {
  const { hoy } = params;
  const mesesPromedio = params.mesesPromedio ?? 3;
  const mesActual = hoy.slice(0, 7);

  const [cuentas, ejercicios] = await Promise.all([leerCuentasFlujo(db), leerEjercicios(db)]);
  const porId = new Map(cuentas.map((c) => [c.id, c]));
  const cuentaProyectable = (id: string) => {
    const c = porId.get(id);
    return !!c && c.afecta_caja && esResultado(c.clase);
  };

  // Horizonte
  const ejercicioHoy = ejercicios.find((e) => e.fecha_inicio <= hoy && hoy <= e.fecha_fin) ?? null;
  let horizonte: HorizonteProyeccion = params.horizonte ?? "ejercicio";
  if (horizonte === "ejercicio" && !ejercicioHoy) horizonte = "12";
  const ultimoMes = horizonte === "ejercicio" && ejercicioHoy ? ejercicioHoy.fecha_fin.slice(0, 7) : sumarMeses(mesActual, 12);
  const claves: string[] = [];
  for (let k = mesActual; k <= ultimoMes && claves.length < 25; k = sumarMeses(k, 1)) claves.push(k);

  // Presupuestos aprobados de los ejercicios del horizonte
  const ejerciciosHorizonte = ejercicios.filter(
    (e) => e.fecha_fin.slice(0, 7) >= mesActual && e.fecha_inicio.slice(0, 7) <= ultimoMes
  );
  const { data: presupuestos, error: errorPres } = ejerciciosHorizonte.length
    ? await db
        .from("presupuestos")
        .select("id, nombre, version, ejercicio_id")
        .eq("estado", "aprobado")
        .in(
          "ejercicio_id",
          ejerciciosHorizonte.map((e) => e.id)
        )
    : { data: [], error: null };
  if (errorPres) falla("No se pudo leer el presupuesto", errorPres);
  const presPorEjercicio = new Map((presupuestos ?? []).map((p) => [p.ejercicio_id, p]));
  const ejercicioDeMes = (clave: string) =>
    ejercicios.find((e) => e.fecha_inicio.slice(0, 7) <= clave && clave <= e.fecha_fin.slice(0, 7)) ?? null;
  const presupuestoDeMes = (clave: string) => {
    const e = ejercicioDeMes(clave);
    return e ? presPorEjercicio.get(e.id) ?? null : null;
  };
  const necesitaPromedio = claves.some((k) => !presupuestoDeMes(k));

  // Promedio real de los últimos meses cerrados (solo si hace falta)
  const promDesde = `${sumarMeses(mesActual, -mesesPromedio)}-01`;
  const promHasta = finDeMes(`${sumarMeses(mesActual, -1)}-01`);

  const [lineasPres, realPromedio, realMesActual, saldoInicial, primerMovimiento, cotizaciones] = await Promise.all([
    leerPaginado((a, b) =>
      db
        .from("presupuesto_lineas")
        .select("id, presupuesto_id, cuenta_id, mes, importe")
        .in(
          "presupuesto_id",
          (presupuestos ?? []).map((p) => p.id).concat(["00000000-0000-0000-0000-000000000000"])
        )
        .order("id")
        .range(a, b)
    ),
    necesitaPromedio ? leerResultadoReal(db, promDesde, promHasta) : Promise.resolve([] as FilaResultado[]),
    leerResultadoReal(db, inicioDeMes(hoy), hoy),
    saldoDisponibilidades(db, sumarDias(hoy, 1)),
    necesitaPromedio ? primerMesConMovimientos(db, promHasta) : Promise.resolve(null),
    com ? ultimasCotizaciones(db, hoy) : Promise.resolve(new Map<string, { tasa: number; fecha: string }>()),
  ]);
  if (lineasPres.error) falla("No se pudo leer el presupuesto", lineasPres.error);

  // Base mensual por cuenta: presupuesto (por ejercicio y mes) o promedio
  const presCuentaMes = new Map<string, Map<string, number>>(); // presupuesto_id → "cuenta|mes" → importe
  for (const l of lineasPres.filas) {
    if (!cuentaProyectable(l.cuenta_id)) continue;
    let m = presCuentaMes.get(l.presupuesto_id);
    if (!m) presCuentaMes.set(l.presupuesto_id, (m = new Map()));
    const k = `${l.cuenta_id}|${l.mes}`;
    m.set(k, (m.get(k) ?? 0) + num(l.importe));
  }

  // Meses del promedio: desde el primer mes con asientos (si la contabilidad
  // arrancó hace menos de N meses, dividir por N subestimaría).
  let divisor = mesesPromedio;
  if (primerMovimiento && primerMovimiento > promDesde.slice(0, 7)) {
    divisor = Math.max(1, mesesPromedio - mesesEntreClaves(promDesde.slice(0, 7), primerMovimiento));
  }
  const promedioCuenta = new Map<string, number>();
  for (const r of realPromedio) {
    if (!cuentaProyectable(r.cuenta_id)) continue;
    promedioCuenta.set(r.cuenta_id, (promedioCuenta.get(r.cuenta_id) ?? 0) + r.importe / divisor);
  }
  const realActualCuenta = new Map<string, number>();
  for (const r of realMesActual) {
    if (!cuentaProyectable(r.cuenta_id)) continue;
    realActualCuenta.set(r.cuenta_id, (realActualCuenta.get(r.cuenta_id) ?? 0) + r.importe);
  }

  const baseDeMes = (clave: string): { fuente: MesProyeccion["fuente"]; porCuenta: Map<string, number> } => {
    const p = presupuestoDeMes(clave);
    if (p) {
      const mes = Number(clave.slice(5, 7));
      const porCuenta = new Map<string, number>();
      for (const [k, v] of presCuentaMes.get(p.id) ?? []) {
        const [cuenta, m] = k.split("|");
        if (Number(m) === mes) porCuenta.set(cuenta, v);
      }
      return { fuente: "presupuesto", porCuenta };
    }
    return { fuente: "promedio", porCuenta: promedioCuenta };
  };

  // Movimientos sintéticos (signo de caja: ingreso +, egreso −) para armar las secciones
  const movimientos: MovimientoFlujo[] = [];
  const fuentes: MesProyeccion["fuente"][] = [];
  for (const clave of claves) {
    const { fuente, porCuenta } = baseDeMes(clave);
    fuentes.push(fuente);
    const [anio, mes] = clave.split("-").map(Number);
    for (const [cuentaId, base] of porCuenta) {
      let importe = base;
      if (clave === mesActual) importe = Math.max(0, base - (realActualCuenta.get(cuentaId) ?? 0));
      importe = redondear(importe);
      if (importe === 0) continue;
      const c = porId.get(cuentaId)!;
      movimientos.push({
        anio,
        mes,
        cuenta_id: cuentaId,
        centro_costo_id: null,
        importe: c.clase === "ingreso" ? importe : -importe,
        revaluacion: false,
      });
    }
  }
  const { ingresos, egresos } = armarSecciones(movimientos, claves, cuentas, [], "plan");

  // Vencimientos (informativos)
  let venc: VencimientosPorMes | null = null;
  let errorVenc: string | null = null;
  if (com) {
    try {
      const tcs = new Map([...cotizaciones.entries()].map(([m, c]) => [m, c.tasa]));
      venc = await vencimientosProveedores(com, hoy, tcs);
    } catch (e) {
      errorVenc = e instanceof Error ? e.message : "No se pudieron leer los vencimientos";
    }
  } else {
    errorVenc = "Sin acceso a compras";
  }
  let posterior = 0;
  if (venc) {
    for (const [k, v] of venc.porMes) if (k > ultimoMes) posterior = redondear(posterior + v);
  }

  const meses: MesProyeccion[] = [];
  let saldo = redondear(saldoInicial);
  let minimo: ProyeccionFlujo["minimo"] = null;
  let primerNegativo: string | null = null;
  claves.forEach((clave, i) => {
    const ing = ingresos.porMes[i];
    const egr = egresos.porMes[i];
    const neto = redondear(ing - egr);
    const inicial = saldo;
    saldo = redondear(saldo + neto);
    if (!minimo || saldo < minimo.saldo) minimo = { clave, saldo };
    if (saldo < 0 && !primerNegativo) primerNegativo = clave;
    meses.push({
      clave,
      parcial: clave === mesActual,
      fuente: fuentes[i],
      ingresos: ing,
      egresos: egr,
      neto,
      saldoInicial: inicial,
      saldoFinal: saldo,
      vencimientos: redondear((venc?.porMes.get(clave) ?? 0) + (i === 0 ? venc?.vencido ?? 0 : 0)),
    });
  });

  // Serie real para el gráfico: saldo a fin de mes de los últimos meses
  const mesesReales = params.mesesReales ?? 6;
  const primerEjercicio = ejercicios[0]?.fecha_inicio ?? hoy;
  let desdeReal = `${sumarMeses(mesActual, -(mesesReales - 1))}-01`;
  if (desdeReal < primerEjercicio) desdeReal = primerEjercicio;
  let real: ProyeccionFlujo["real"] = [];
  if (enAlgunEjercicio(ejercicios, desdeReal) && desdeReal <= hoy) {
    const [s0, movs] = await Promise.all([saldoDisponibilidades(db, desdeReal), leerFlujoCaja(db, desdeReal, hoy)]);
    const mesesR = mesesDelRango(desdeReal, hoy).map((m) => m.clave);
    const variacion = new Map<string, number>();
    for (const m of movs) {
      const k = claveMes(m.anio, m.mes);
      variacion.set(k, (variacion.get(k) ?? 0) + m.importe);
    }
    let s = s0;
    real = mesesR.map((k) => {
      s = redondear(s + (variacion.get(k) ?? 0));
      return { clave: k, saldo: s };
    });
  }

  const nombreEjercicio = new Map(ejercicios.map((e) => [e.id, e.nombre]));
  return {
    hoy,
    horizonte,
    saldoInicial: redondear(saldoInicial),
    meses,
    ingresos,
    egresos,
    presupuestos: (presupuestos ?? []).map((p) => ({
      id: p.id,
      nombre: p.nombre,
      version: p.version,
      ejercicio: nombreEjercicio.get(p.ejercicio_id) ?? "",
    })),
    promedio: necesitaPromedio
      ? { desde: promDesde, hasta: promHasta, meses: divisor, sinDatos: realPromedio.length === 0 }
      : null,
    vencimientos: {
      vencido: venc?.vencido ?? 0,
      posterior,
      cantidad: venc?.cantidad ?? 0,
      extranjera: venc?.extranjera ?? [],
      error: errorVenc,
    },
    minimo,
    primerNegativo,
    real,
  };
}

interface FilaResultado {
  cuenta_id: string;
  mes: number;
  anio: number;
  importe: number;
}

/** resultado_real: recursos y gastos por cuenta y mes, con el signo de la clase (sin apertura ni cierre). */
async function leerResultadoReal(db: ClienteContable, desde: string, hasta: string): Promise<FilaResultado[]> {
  const { filas, error } = await leerPaginado<Funciones["resultado_real"]["Returns"][number]>((a, b) =>
    db
      .rpc("resultado_real", { p_desde: desde, p_hasta: hasta })
      .order("anio")
      .order("mes")
      .order("cuenta_id")
      .order("centro_costo_id")
      .range(a, b)
  );
  if (error) falla("No se pudo leer lo ejecutado", error);
  return filas.map((f) => ({ cuenta_id: f.cuenta_id, mes: num(f.mes), anio: num(f.anio), importe: num(f.importe) }));
}

/** Primer mes ("YYYY-MM") con algún asiento confirmado que no sea apertura, hasta `hasta`. */
async function primerMesConMovimientos(db: ClienteContable, hasta: string): Promise<string | null> {
  const { data, error } = await db
    .from("asientos")
    .select("fecha")
    .eq("estado", "confirmado")
    .not("tipo", "in", "(apertura,cierre,refundicion)")
    .lte("fecha", hasta)
    .order("fecha")
    .limit(1)
    .maybeSingle();
  if (error) falla("No se pudieron leer los asientos", error);
  return data ? data.fecha.slice(0, 7) : null;
}

/** Meses de `a` a `b` (claves "YYYY-MM"), b − a. */
function mesesEntreClaves(a: string, b: string): number {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
}
