/**
 * Presupuesto económico: lectura y armado de estructuras para las
 * pantallas de /contabilidad/presupuesto y para el servidor MCP.
 *
 * Las funciones de lectura reciben el cliente del schema `contabilidad`
 * (con la sesión o el token del usuario: la base aplica los permisos).
 * Las funciones puras (armar árbol, ejecución, series) no tocan la base y
 * se pueden usar en componentes cliente.
 *
 * Convención (ver supabase/migrations/20261004100000_contabilidad_presupuesto.sql):
 *   - importes en pesos, ingresos y egresos en positivo;
 *   - desvío = ejecutado − presupuestado (en ingresos, positivo es bueno;
 *     en egresos, negativo es bueno);
 *   - lo ejecutado son los asientos confirmados sin apertura, cierre ni
 *     refundición, con el signo de presentación de la clase.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/contabilidad";
import { mensajeError } from "./formato";
import { compararCodigo, leerPaginado, redondear, type EjercicioResumen } from "./reportes";

type Tablas = Database["contabilidad"]["Tables"];
type Funciones = Database["contabilidad"]["Functions"];

export type ClientePresupuesto = SupabaseClient<Database, "contabilidad">;

export type EstadoPresupuesto = "borrador" | "aprobado" | "reemplazado";
export type BasePresupuesto = "vacio" | "ejercicio_anterior" | "promedio" | "vigente";
export type ClaseResultado = "ingreso" | "egreso";

export const NOMBRE_ESTADO_PRESUPUESTO: Record<EstadoPresupuesto, string> = {
  borrador: "Borrador",
  aprobado: "Aprobado",
  reemplazado: "Reemplazado",
};

export const NOMBRE_BASE_PRESUPUESTO: Record<BasePresupuesto, string> = {
  vacio: "En blanco",
  ejercicio_anterior: "Lo real del ejercicio anterior",
  promedio: "Promedio de los últimos meses",
  vigente: "Reformular el aprobado vigente",
};

export const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"];

/** Cuenta de resultado del plan (agrupadoras incluidas, para la jerarquía). */
export type CuentaPresupuesto = Pick<
  Tablas["cuentas"]["Row"],
  "id" | "codigo" | "nombre" | "padre_id" | "nivel" | "imputable" | "activa"
> & { clase: ClaseResultado };

export type CentroPresupuesto = Pick<
  Tablas["centros_costo"]["Row"],
  "id" | "codigo" | "nombre" | "activo" | "disciplina_id"
>;

export interface LineaPresupuesto {
  cuenta_id: string;
  centro_costo_id: string | null;
  mes: number;
  importe: number;
}

export interface PresupuestoResumen {
  id: string;
  ejercicioId: string;
  version: number;
  nombre: string;
  estado: EstadoPresupuesto;
  notas: string | null;
  creadoPor: string | null;
  createdAt: string;
  aprobadoPor: string | null;
  aprobadoAt: string | null;
  /** Cuentas distintas con importe. */
  cuentas: number;
  totalIngresos: number;
  totalEgresos: number;
  resultado: number;
}

export type FilaEjecucion = Funciones["ejecucion_presupuesto"]["Returns"][number];
export type FilaReal = Funciones["resultado_real"]["Returns"][number];

function num(v: number | string | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function error(e: { message?: string; code?: string } | null | undefined): Error {
  return new Error(mensajeError(e));
}

// ------------------------------------------------------------
// Lectura
// ------------------------------------------------------------

/** Cuentas de ingresos y egresos (agrupadoras e imputables), ordenadas por código. */
export async function leerCuentasPresupuesto(db: ClientePresupuesto): Promise<CuentaPresupuesto[]> {
  const { data, error: e } = await db
    .from("cuentas")
    .select("id, codigo, nombre, padre_id, nivel, imputable, activa, clase")
    .in("clase", ["ingreso", "egreso"]);
  if (e) throw error(e);
  return ((data ?? []) as CuentaPresupuesto[]).sort((a, b) => compararCodigo(a.codigo, b.codigo));
}

export async function leerCentrosCosto(db: ClientePresupuesto): Promise<CentroPresupuesto[]> {
  const { data, error: e } = await db
    .from("centros_costo")
    .select("id, codigo, nombre, activo, disciplina_id")
    .order("codigo");
  if (e) throw error(e);
  return data ?? [];
}

/** Celdas de uno o varios presupuestos (paginado: max_rows de PostgREST). */
export async function leerLineas(
  db: ClientePresupuesto,
  presupuestoIds: string | string[]
): Promise<(LineaPresupuesto & { presupuesto_id: string })[]> {
  const ids = Array.isArray(presupuestoIds) ? presupuestoIds : [presupuestoIds];
  if (ids.length === 0) return [];
  const { filas, error: e } = await leerPaginado((a, b) =>
    db
      .from("presupuesto_lineas")
      .select("presupuesto_id, cuenta_id, centro_costo_id, mes, importe")
      .in("presupuesto_id", ids)
      .order("id")
      .range(a, b)
  );
  if (e) throw new Error(e);
  return filas.map((l) => ({ ...l, importe: num(l.importe) }));
}

async function nombresUsuarios(db: ClientePresupuesto, ids: (string | null)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (unicos.length === 0) return new Map();
  // public.perfiles no es legible para tesorero ni comision_fiscal: va por RPC.
  const { data } = await db.rpc("nombres_usuarios", { p_ids: unicos });
  return new Map((data ?? []).map((p) => [p.id, p.nombre]));
}

const COLUMNAS_PRESUPUESTO =
  "id, ejercicio_id, version, nombre, estado, notas, creado_por, created_at, aprobado_por, aprobado_at";

type FilaPresupuesto = Pick<
  Tablas["presupuestos"]["Row"],
  | "id"
  | "ejercicio_id"
  | "version"
  | "nombre"
  | "estado"
  | "notas"
  | "creado_por"
  | "created_at"
  | "aprobado_por"
  | "aprobado_at"
>;

function resumir(
  p: FilaPresupuesto,
  lineas: LineaPresupuesto[],
  clasePorCuenta: Map<string, ClaseResultado>,
  nombres: Map<string, string>
): PresupuestoResumen {
  let ing = 0;
  let egr = 0;
  const cuentas = new Set<string>();
  for (const l of lineas) {
    cuentas.add(l.cuenta_id);
    if (clasePorCuenta.get(l.cuenta_id) === "ingreso") ing += l.importe;
    else egr += l.importe;
  }
  const nombre = (id: string | null) => (id ? nombres.get(id) ?? `Usuario ${id.slice(0, 8)}` : null);
  return {
    id: p.id,
    ejercicioId: p.ejercicio_id,
    version: p.version,
    nombre: p.nombre,
    estado: p.estado as EstadoPresupuesto,
    notas: p.notas,
    creadoPor: nombre(p.creado_por),
    createdAt: p.created_at,
    aprobadoPor: nombre(p.aprobado_por),
    aprobadoAt: p.aprobado_at,
    cuentas: cuentas.size,
    totalIngresos: redondear(ing),
    totalEgresos: redondear(egr),
    resultado: redondear(ing - egr),
  };
}

/** Versiones del presupuesto de un ejercicio (la más nueva primero), con totales. */
export async function listarPresupuestos(
  db: ClientePresupuesto,
  ejercicioId: string,
  cuentas?: CuentaPresupuesto[]
): Promise<PresupuestoResumen[]> {
  const { data, error: e } = await db
    .from("presupuestos")
    .select(COLUMNAS_PRESUPUESTO)
    .eq("ejercicio_id", ejercicioId)
    .order("version", { ascending: false });
  if (e) throw error(e);
  const filas = data ?? [];
  const [lineas, plan, nombres] = await Promise.all([
    leerLineas(db, filas.map((p) => p.id)),
    cuentas ? Promise.resolve(cuentas) : leerCuentasPresupuesto(db),
    nombresUsuarios(db, filas.flatMap((p) => [p.creado_por, p.aprobado_por])),
  ]);
  const clase = new Map(plan.map((c) => [c.id, c.clase]));
  const porPresupuesto = new Map<string, LineaPresupuesto[]>();
  for (const l of lineas) {
    const lista = porPresupuesto.get(l.presupuesto_id) ?? [];
    lista.push(l);
    porPresupuesto.set(l.presupuesto_id, lista);
  }
  return filas.map((p) => resumir(p, porPresupuesto.get(p.id) ?? [], clase, nombres));
}

/** Un presupuesto con su ejercicio y sus celdas. null si no existe (o no se puede leer). */
export async function leerPresupuesto(
  db: ClientePresupuesto,
  id: string,
  cuentas?: CuentaPresupuesto[]
): Promise<{ presupuesto: PresupuestoResumen; ejercicio: EjercicioResumen; lineas: LineaPresupuesto[] } | null> {
  const { data: p, error: e } = await db.from("presupuestos").select(COLUMNAS_PRESUPUESTO).eq("id", id).maybeSingle();
  if (e) throw error(e);
  if (!p) return null;
  const [{ data: ejercicio, error: e2 }, lineas, plan, nombres] = await Promise.all([
    db.from("ejercicios").select("id, nombre, fecha_inicio, fecha_fin, estado").eq("id", p.ejercicio_id).single(),
    leerLineas(db, id),
    cuentas ? Promise.resolve(cuentas) : leerCuentasPresupuesto(db),
    nombresUsuarios(db, [p.creado_por, p.aprobado_por]),
  ]);
  if (e2) throw error(e2);
  const clase = new Map(plan.map((c) => [c.id, c.clase]));
  return {
    presupuesto: resumir(p, lineas, clase, nombres),
    ejercicio,
    lineas: lineas.map(({ cuenta_id, centro_costo_id, mes, importe }) => ({ cuenta_id, centro_costo_id, mes, importe })),
  };
}

/** El aprobado vigente; si no hay, la versión más nueva. */
export function presupuestoPorDefecto(lista: PresupuestoResumen[]): PresupuestoResumen | null {
  return lista.find((p) => p.estado === "aprobado") ?? [...lista].sort((a, b) => b.version - a.version)[0] ?? null;
}

// ------------------------------------------------------------
// Meses
// ------------------------------------------------------------

/** Rango por defecto de la ejecución: enero → mes actual (todo el año si el ejercicio ya terminó o no empezó). */
export function mesesPorDefecto(ejercicio: Pick<EjercicioResumen, "fecha_inicio" | "fecha_fin">, hoy: string) {
  if (hoy >= ejercicio.fecha_inicio && hoy <= ejercicio.fecha_fin) {
    return { mesDesde: 1, mesHasta: Number(hoy.slice(5, 7)) };
  }
  return { mesDesde: 1, mesHasta: 12 };
}

export function nombreRangoMeses(desde: number, hasta: number): string {
  if (desde === 1 && hasta === 12) return "Año completo";
  if (desde === hasta) return MESES_CORTOS[desde - 1];
  return `${MESES_CORTOS[desde - 1]} → ${MESES_CORTOS[hasta - 1]}`;
}

// ------------------------------------------------------------
// Importes (formato de la grilla)
// ------------------------------------------------------------

const fmtEntero = new Intl.NumberFormat("es-UY", { maximumFractionDigits: 0 });
const fmtDecimal = new Intl.NumberFormat("es-UY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1234567 → "1.234.567"; 1234.5 → "1.234,50". Sin decimales cuando son cero; "" para 0. */
export function formatPresupuesto(n: number): string {
  if (!n) return "";
  return Number.isInteger(Math.round(n * 100) / 100) ? fmtEntero.format(n) : fmtDecimal.format(n);
}

/**
 * Interpreta lo que se escribe en una celda, en formato uruguayo:
 * "1.234,50" → 1234.5 · "1234,5" → 1234.5 · "1.234" → 1234 · "1234.5" → 1234.5.
 * Vacío = 0. Devuelve null si no es un número válido o es negativo.
 */
export function parsearImporte(texto: string): number | null {
  let t = texto.replace(/[\s$]/g, "");
  if (t === "" || t === "-") return 0;
  if (t.includes(",")) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else {
    const puntos = (t.match(/\./g) ?? []).length;
    // Un punto seguido de exactamente 3 dígitos, o varios puntos: separador de miles.
    if (puntos > 1 || /^\d{1,3}\.\d{3}$/.test(t)) t = t.replace(/\./g, "");
  }
  if (!/^\d*\.?\d*$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return redondear(n);
}

/** Reparte un total anual en 12 meses iguales; diciembre absorbe el redondeo. */
export function repartirAnual(total: number): number[] {
  const centavos = Math.round(total * 100);
  const base = Math.floor(centavos / 12);
  const meses = Array.from({ length: 12 }, () => base / 100);
  meses[11] = (centavos - base * 11) / 100;
  return meses;
}

// ------------------------------------------------------------
// Jerarquía del plan
// ------------------------------------------------------------

/** Agrupadoras ancestro de cada cuenta (de la raíz hacia abajo). */
export function ancestros(cuentas: CuentaPresupuesto[]): Map<string, CuentaPresupuesto[]> {
  const porId = new Map(cuentas.map((c) => [c.id, c]));
  const memo = new Map<string, CuentaPresupuesto[]>();
  const de = (c: CuentaPresupuesto): CuentaPresupuesto[] => {
    const m = memo.get(c.id);
    if (m) return m;
    const padre = c.padre_id ? porId.get(c.padre_id) : undefined;
    const r = padre ? [...de(padre), padre] : [];
    memo.set(c.id, r);
    return r;
  };
  for (const c of cuentas) de(c);
  return memo;
}

// ------------------------------------------------------------
// Ejecución (presupuestado vs ejecutado)
// ------------------------------------------------------------

export interface Comparacion {
  presupuestado: number;
  ejecutado: number;
  desvio: number;
}

export interface NodoEjecucion extends Comparacion {
  cuenta: CuentaPresupuesto;
  hijos: NodoEjecucion[];
  /** Apertura por centro de costo (solo imputables y si se pidió por centro). */
  centros: (Comparacion & { centro: CentroPresupuesto | null })[];
}

export interface EjecucionArmada {
  ingresos: NodoEjecucion[];
  egresos: NodoEjecucion[];
  totalIngresos: Comparacion;
  totalEgresos: Comparacion;
  /** Ingresos − egresos. */
  resultado: Comparacion;
}

function comparacion(presupuestado: number, ejecutado: number): Comparacion {
  return {
    presupuestado: redondear(presupuestado),
    ejecutado: redondear(ejecutado),
    desvio: redondear(ejecutado - presupuestado),
  };
}

/** % ejecutado sobre lo presupuestado; null si no hay presupuesto. */
export function porcentajeEjecucion(c: Pick<Comparacion, "presupuestado" | "ejecutado">): number | null {
  if (!c.presupuestado) return null;
  return (c.ejecutado / c.presupuestado) * 100;
}

/**
 * ¿El desvío favorece al club? Ingresos (y resultado): por encima es bueno.
 * Egresos: por debajo es bueno. null si no hay desvío.
 */
export function desvioFavorable(clase: ClaseResultado | "resultado", desvio: number): boolean | null {
  if (Math.abs(desvio) < 0.005) return null;
  return clase === "egreso" ? desvio < 0 : desvio > 0;
}

/**
 * Árbol de ingresos y egresos con presupuestado/ejecutado por nodo (las
 * agrupadoras suman a sus hijas). Solo aparecen las ramas con importes.
 */
export function armarEjecucion(
  cuentas: CuentaPresupuesto[],
  filas: FilaEjecucion[],
  centros: CentroPresupuesto[] = []
): EjecucionArmada {
  const centroPorId = new Map(centros.map((c) => [c.id, c]));
  const porCuenta = new Map<string, FilaEjecucion[]>();
  for (const f of filas) {
    const lista = porCuenta.get(f.cuenta_id) ?? [];
    lista.push(f);
    porCuenta.set(f.cuenta_id, lista);
  }

  const hijos = new Map<string | null, CuentaPresupuesto[]>();
  const ids = new Set(cuentas.map((c) => c.id));
  for (const c of cuentas) {
    const padre = c.padre_id && ids.has(c.padre_id) ? c.padre_id : null;
    const lista = hijos.get(padre) ?? [];
    lista.push(c);
    hijos.set(padre, lista);
  }

  const armar = (c: CuentaPresupuesto): NodoEjecucion | null => {
    if (c.imputable) {
      const propias = porCuenta.get(c.id) ?? [];
      if (propias.length === 0) return null;
      let p = 0;
      let e = 0;
      for (const f of propias) {
        p += num(f.presupuestado);
        e += num(f.ejecutado);
      }
      const conCentro = propias.some((f) => f.centro_costo_id);
      return {
        cuenta: c,
        hijos: [],
        ...comparacion(p, e),
        centros: conCentro
          ? propias
              .map((f) => ({
                centro: f.centro_costo_id ? centroPorId.get(f.centro_costo_id) ?? null : null,
                ...comparacion(num(f.presupuestado), num(f.ejecutado)),
              }))
              .sort((a, b) => (a.centro?.codigo ?? "~").localeCompare(b.centro?.codigo ?? "~"))
          : [],
      };
    }
    const subs = (hijos.get(c.id) ?? []).map(armar).filter((n): n is NodoEjecucion => !!n);
    if (subs.length === 0) return null;
    return {
      cuenta: c,
      hijos: subs,
      ...comparacion(
        subs.reduce((s, n) => s + n.presupuestado, 0),
        subs.reduce((s, n) => s + n.ejecutado, 0)
      ),
      centros: [],
    };
  };

  // Raíces de cada clase: "4 Ingresos" y "5 Egresos". Se muestran sus hijas.
  const seccion = (clase: ClaseResultado) => {
    const raices = (hijos.get(null) ?? []).filter((c) => c.clase === clase);
    const nodos = raices.map(armar).filter((n): n is NodoEjecucion => !!n);
    return nodos.flatMap((n) => (n.cuenta.imputable ? [n] : n.hijos));
  };
  const ingresos = seccion("ingreso");
  const egresos = seccion("egreso");
  const total = (lista: NodoEjecucion[]) =>
    comparacion(
      lista.reduce((s, n) => s + n.presupuestado, 0),
      lista.reduce((s, n) => s + n.ejecutado, 0)
    );
  const totalIngresos = total(ingresos);
  const totalEgresos = total(egresos);
  return {
    ingresos,
    egresos,
    totalIngresos,
    totalEgresos,
    resultado: comparacion(
      totalIngresos.presupuestado - totalEgresos.presupuestado,
      totalIngresos.ejecutado - totalEgresos.ejecutado
    ),
  };
}

export interface PuntoMensual {
  mes: number;
  presupuestadoIngresos: number;
  presupuestadoEgresos: number;
  ejecutadoIngresos: number;
  ejecutadoEgresos: number;
  presupuestado: number;
  ejecutado: number;
}

/** Resultado mes a mes (presupuestado vs ejecutado) dentro del rango. */
export function serieMensual(
  cuentas: CuentaPresupuesto[],
  lineas: LineaPresupuesto[],
  real: FilaReal[],
  mesDesde: number,
  mesHasta: number,
  anio: number
): PuntoMensual[] {
  const clase = new Map(cuentas.map((c) => [c.id, c.clase]));
  const puntos: PuntoMensual[] = [];
  for (let m = mesDesde; m <= mesHasta; m++) {
    puntos.push({
      mes: m,
      presupuestadoIngresos: 0,
      presupuestadoEgresos: 0,
      ejecutadoIngresos: 0,
      ejecutadoEgresos: 0,
      presupuestado: 0,
      ejecutado: 0,
    });
  }
  const punto = (m: number) => puntos[m - mesDesde];
  for (const l of lineas) {
    if (l.mes < mesDesde || l.mes > mesHasta) continue;
    const p = punto(l.mes);
    if (clase.get(l.cuenta_id) === "ingreso") p.presupuestadoIngresos += l.importe;
    else p.presupuestadoEgresos += l.importe;
  }
  for (const r of real) {
    if (r.anio !== anio || r.mes < mesDesde || r.mes > mesHasta) continue;
    const p = punto(r.mes);
    const c = clase.get(r.cuenta_id);
    if (c === "ingreso") p.ejecutadoIngresos += num(r.importe);
    else if (c === "egreso") p.ejecutadoEgresos += num(r.importe);
  }
  for (const p of puntos) {
    p.presupuestadoIngresos = redondear(p.presupuestadoIngresos);
    p.presupuestadoEgresos = redondear(p.presupuestadoEgresos);
    p.ejecutadoIngresos = redondear(p.ejecutadoIngresos);
    p.ejecutadoEgresos = redondear(p.ejecutadoEgresos);
    p.presupuestado = redondear(p.presupuestadoIngresos - p.presupuestadoEgresos);
    p.ejecutado = redondear(p.ejecutadoIngresos - p.ejecutadoEgresos);
  }
  return puntos;
}

export async function leerEjecucion(
  db: ClientePresupuesto,
  presupuestoId: string,
  mesDesde: number,
  mesHasta: number,
  porCentro: boolean
): Promise<FilaEjecucion[]> {
  const { filas, error: e } = await leerPaginado((a, b) =>
    db
      .rpc("ejecucion_presupuesto", {
        p_presupuesto: presupuestoId,
        p_mes_desde: mesDesde,
        p_mes_hasta: mesHasta,
        p_por_centro: porCentro,
      })
      .order("cuenta_id")
      .order("centro_costo_id", { nullsFirst: true })
      .range(a, b)
  );
  if (e) throw new Error(e);
  return filas;
}

export async function leerResultadoReal(db: ClientePresupuesto, desde: string, hasta: string): Promise<FilaReal[]> {
  const { filas, error: e } = await leerPaginado((a, b) =>
    db
      .rpc("resultado_real", { p_desde: desde, p_hasta: hasta })
      .order("cuenta_id")
      .order("centro_costo_id", { nullsFirst: true })
      .order("anio")
      .order("mes")
      .range(a, b)
  );
  if (e) throw new Error(e);
  return filas;
}

export interface InformeEjecucion {
  ejercicio: EjercicioResumen;
  presupuesto: PresupuestoResumen;
  versiones: PresupuestoResumen[];
  mesDesde: number;
  mesHasta: number;
  porCentro: boolean;
  ejecucion: EjecucionArmada;
  serie: PuntoMensual[];
}

/**
 * Presupuestado vs ejecutado de un ejercicio, listo para mostrar. Sin
 * `presupuestoId` usa el aprobado vigente (o la última versión). Devuelve
 * null si el ejercicio no tiene presupuesto.
 */
export async function informeEjecucion(
  db: ClientePresupuesto,
  opciones: {
    ejercicio: EjercicioResumen;
    presupuestoId?: string | null;
    mesDesde?: number | null;
    mesHasta?: number | null;
    porCentro?: boolean;
    hoy: string;
  }
): Promise<InformeEjecucion | null> {
  const { ejercicio, hoy } = opciones;
  const [cuentas, centros] = await Promise.all([leerCuentasPresupuesto(db), leerCentrosCosto(db)]);
  const versiones = await listarPresupuestos(db, ejercicio.id, cuentas);
  const presupuesto =
    (opciones.presupuestoId && versiones.find((v) => v.id === opciones.presupuestoId)) ||
    presupuestoPorDefecto(versiones);
  if (!presupuesto) return null;

  const defecto = mesesPorDefecto(ejercicio, hoy);
  const valido = (m: number | null | undefined): m is number => !!m && Number.isInteger(m) && m >= 1 && m <= 12;
  let mesDesde = valido(opciones.mesDesde) ? opciones.mesDesde : defecto.mesDesde;
  let mesHasta = valido(opciones.mesHasta) ? opciones.mesHasta : defecto.mesHasta;
  if (mesDesde > mesHasta) [mesDesde, mesHasta] = [mesHasta, mesDesde];
  const porCentro = !!opciones.porCentro;

  const [filas, lineas, real] = await Promise.all([
    leerEjecucion(db, presupuesto.id, mesDesde, mesHasta, porCentro),
    leerLineas(db, presupuesto.id),
    leerResultadoReal(db, ejercicio.fecha_inicio, ejercicio.fecha_fin),
  ]);
  return {
    ejercicio,
    presupuesto,
    versiones,
    mesDesde,
    mesHasta,
    porCentro,
    ejecucion: armarEjecucion(cuentas, filas, centros),
    serie: serieMensual(cuentas, lineas, real, mesDesde, mesHasta, Number(ejercicio.fecha_inicio.slice(0, 4))),
  };
}
