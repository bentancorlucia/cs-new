/**
 * Lógica de los reportes contables (sumas y saldos, estado de situación,
 * estado de resultados, libro mayor por auxiliar y período de consulta).
 *
 * Funciones puras, sin acceso a la base: reciben filas ya leídas y
 * devuelven estructuras listas para mostrar o exportar. Se pueden usar
 * tanto en Server Components como en componentes cliente.
 *
 * Convención de signos (ver docs/contabilidad.md, "Reportes"):
 *   - activo y egreso  → debe − haber
 *   - pasivo, patrimonio e ingreso → haber − debe
 * Las regularizadoras (amortizaciones acumuladas y previsiones, que son
 * activo de naturaleza acreedora; devoluciones sobre ventas, ingreso de
 * naturaleza deudora) quedan con saldo negativo y restan solas al sumar
 * dentro de su clase. Por eso una agrupadora suma directamente los saldos
 * de presentación de sus hijas: todas son de la misma clase.
 */
import type { Database } from "@/types/contabilidad";
import { saldoPresentacion, type ClaseCuenta } from "./formato";

type Tablas = Database["contabilidad"]["Tables"];
type Funciones = Database["contabilidad"]["Functions"];

export type CuentaPlan = Pick<
  Tablas["cuentas"]["Row"],
  | "id"
  | "codigo"
  | "nombre"
  | "padre_id"
  | "nivel"
  | "clase"
  | "naturaleza"
  | "imputable"
  | "moneda"
  | "corriente"
  | "es_disponibilidad"
  | "requiere_auxiliar"
  | "requiere_centro_costo"
  | "activa"
>;

/** Columnas a pedir de `contabilidad.cuentas` para armar los reportes. */
export const COLUMNAS_CUENTA_PLAN =
  "id, codigo, nombre, padre_id, nivel, clase, naturaleza, imputable, moneda, corriente, es_disponibilidad, requiere_auxiliar, requiere_centro_costo, activa";

export type FilaSaldo = Funciones["saldos"]["Returns"][number];
export type MovimientoMayor = Funciones["libro_mayor"]["Returns"][number];

export type EjercicioResumen = Pick<
  Tablas["ejercicios"]["Row"],
  "id" | "nombre" | "fecha_inicio" | "fecha_fin" | "estado"
>;

export const CLASES: ClaseCuenta[] = ["activo", "pasivo", "patrimonio", "ingreso", "egreso"];

// ------------------------------------------------------------
// Números
// ------------------------------------------------------------

/** Redondeo a centésimos (los importes funcionales tienen 2 decimales). */
export function redondear(n: number): number {
  const r = Math.round((n + Number.EPSILON) * 100) / 100;
  return r === 0 ? 0 : r; // evita -0
}

/** Igualdad a centésimos. */
export function iguales(a: number, b: number): boolean {
  return Math.abs(redondear(a) - redondear(b)) < 0.005;
}

/** Signo de presentación de la clase: +1 si el saldo se lee debe − haber. */
export function signoClase(clase: ClaseCuenta): 1 | -1 {
  return clase === "activo" || clase === "egreso" ? 1 : -1;
}

function num(v: number | string | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// ------------------------------------------------------------
// Fechas "YYYY-MM-DD" (sin Date local para evitar zonas horarias)
// ------------------------------------------------------------

export function esFechaValida(s: string | null | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function aIso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function inicioDeMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function finDeMes(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return aIso(y, m, ultimo);
}

export function inicioDeTrimestre(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return aIso(y, Math.floor((m - 1) / 3) * 3 + 1, 1);
}

export function finDeTrimestre(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return finDeMes(aIso(y, Math.floor((m - 1) / 3) * 3 + 3, 1));
}

/** Días de `desde` a `hasta` (positivo si hasta es posterior). */
export function diasEntre(desde: string, hasta: string): number {
  const [y1, m1, d1] = desde.split("-").map(Number);
  const [y2, m2, d2] = hasta.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export function sumarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dias));
  return aIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function acotar(iso: string, min: string, max: string): string {
  return iso < min ? min : iso > max ? max : iso;
}

// ------------------------------------------------------------
// Período de consulta (ejercicio + desde/hasta)
// ------------------------------------------------------------

export interface PeriodoConsulta {
  ejercicio: EjercicioResumen;
  desde: string;
  hasta: string;
  /** Hoy acotado al ejercicio: referencia para los atajos. */
  referencia: string;
}

/** Ejercicio que contiene `hoy`; si no hay, el último que ya empezó; si no, el primero. */
export function ejercicioActual(
  ejercicios: EjercicioResumen[],
  hoy: string
): EjercicioResumen | null {
  if (ejercicios.length === 0) return null;
  const orden = [...ejercicios].sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio));
  const contiene = orden.find((e) => e.fecha_inicio <= hoy && hoy <= e.fecha_fin);
  if (contiene) return contiene;
  const empezados = orden.filter((e) => e.fecha_inicio <= hoy);
  return empezados.length > 0 ? empezados[empezados.length - 1] : orden[0];
}

/**
 * Resuelve el período a partir de los searchParams. Garantiza que
 * desde ≤ hasta y que ambos caen dentro del ejercicio (lo exige `saldos`).
 */
export function resolverPeriodo(
  ejercicios: EjercicioResumen[],
  params: { ejercicio?: string | null; desde?: string | null; hasta?: string | null },
  hoy: string
): PeriodoConsulta | null {
  if (ejercicios.length === 0) return null;

  let ejercicio =
    (params.ejercicio && ejercicios.find((e) => e.id === params.ejercicio)) || null;
  if (!ejercicio && esFechaValida(params.desde)) {
    const d = params.desde;
    ejercicio = ejercicios.find((e) => e.fecha_inicio <= d && d <= e.fecha_fin) ?? null;
  }
  if (!ejercicio) ejercicio = ejercicioActual(ejercicios, hoy);
  if (!ejercicio) return null;

  const { fecha_inicio: ini, fecha_fin: fin } = ejercicio;
  const referencia = acotar(hoy, ini, fin);
  const dentro = (s: string | null | undefined): s is string =>
    esFechaValida(s) && s >= ini && s <= fin;

  let desde = dentro(params.desde) ? params.desde : ini;
  let hasta = dentro(params.hasta) ? params.hasta : referencia;
  if (desde > hasta) {
    if (dentro(params.hasta)) desde = ini;
    else hasta = fin;
  }
  return { ejercicio, desde, hasta, referencia };
}

export type AtajoPeriodo = "mes" | "trimestre" | "anio" | "ejercicio";

export const NOMBRE_ATAJO: Record<AtajoPeriodo, string> = {
  mes: "Mes actual",
  trimestre: "Trimestre",
  anio: "Año a la fecha",
  ejercicio: "Ejercicio completo",
};

/** Rango del atajo, acotado al ejercicio. `referencia` ya está dentro del ejercicio. */
export function rangoAtajo(
  atajo: AtajoPeriodo,
  ejercicio: Pick<EjercicioResumen, "fecha_inicio" | "fecha_fin">,
  referencia: string
): { desde: string; hasta: string } {
  const ini = ejercicio.fecha_inicio;
  const fin = ejercicio.fecha_fin;
  switch (atajo) {
    case "mes":
      return { desde: acotar(inicioDeMes(referencia), ini, fin), hasta: acotar(finDeMes(referencia), ini, fin) };
    case "trimestre":
      return {
        desde: acotar(inicioDeTrimestre(referencia), ini, fin),
        hasta: acotar(finDeTrimestre(referencia), ini, fin),
      };
    case "anio":
      return { desde: ini, hasta: referencia };
    case "ejercicio":
      return { desde: ini, hasta: fin };
  }
}

// ------------------------------------------------------------
// Árbol del plan de cuentas
// ------------------------------------------------------------

/** Compara códigos por segmento numérico: 1.1.9 < 1.1.10. */
export function compararCodigo(a: string, b: string): number {
  const sa = a.split(".").map(Number);
  const sb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    const x = sa[i];
    const y = sb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x !== y) return x - y;
  }
  return 0;
}

export interface NodoPlan {
  cuenta: CuentaPlan;
  hijos: NodoPlan[];
}

/** Arma el árbol del plan (raíces = clases), ordenado por código. */
export function armarArbol(cuentas: CuentaPlan[]): NodoPlan[] {
  const nodos = new Map<string, NodoPlan>();
  for (const c of cuentas) nodos.set(c.id, { cuenta: c, hijos: [] });
  const raices: NodoPlan[] = [];
  for (const n of nodos.values()) {
    const padre = n.cuenta.padre_id ? nodos.get(n.cuenta.padre_id) : undefined;
    if (padre) padre.hijos.push(n);
    else raices.push(n);
  }
  const ordenar = (lista: NodoPlan[]) => {
    lista.sort((a, b) => compararCodigo(a.cuenta.codigo, b.cuenta.codigo));
    for (const n of lista) ordenar(n.hijos);
  };
  ordenar(raices);
  return raices;
}

// ------------------------------------------------------------
// Saldos agregados por nodo
// ------------------------------------------------------------

/** Importes funcionales crudos de una cuenta imputable. */
export interface Importes {
  debeAnterior: number;
  haberAnterior: number;
  debe: number;
  haber: number;
  /** En moneda de la cuenta, signo debe − haber (null si la cuenta es en UYU). */
  origenAnterior: number | null;
  origenPeriodo: number | null;
  /** Importe extra ya en signo de presentación (p. ej. resultado del ejercicio inyectado). */
  ajuste: number;
}

const IMPORTES_CERO: Importes = {
  debeAnterior: 0,
  haberAnterior: 0,
  debe: 0,
  haber: 0,
  origenAnterior: null,
  origenPeriodo: null,
  ajuste: 0,
};

export interface NodoSaldo {
  id: string;
  codigo: string;
  nombre: string;
  nivel: number;
  clase: ClaseCuenta;
  imputable: boolean;
  activa: boolean;
  moneda: string | null;
  corriente: boolean | null;
  debeAnterior: number;
  haberAnterior: number;
  debe: number;
  haber: number;
  /** Signo de presentación de la clase. */
  saldoAnterior: number;
  /** Movimiento del período, signo de presentación. */
  movimiento: number;
  /** saldoAnterior + movimiento + ajuste. */
  saldoFinal: number;
  /** Solo imputables en moneda extranjera, signo de presentación. */
  saldoFinalOrigen: number | null;
  /** Tiene saldo anterior o movimientos (propios o de alguna hija). */
  conMovimiento: boolean;
  hijos: NodoSaldo[];
}

/** Indexa las filas de `saldos()` por cuenta. */
export function importesPorCuenta(filas: FilaSaldo[]): Map<string, Importes> {
  const m = new Map<string, Importes>();
  for (const f of filas) {
    m.set(f.cuenta_id, {
      debeAnterior: num(f.debe_anterior),
      haberAnterior: num(f.haber_anterior),
      debe: num(f.debe),
      haber: num(f.haber),
      origenAnterior: f.origen_anterior == null ? null : num(f.origen_anterior),
      origenPeriodo: f.origen_periodo == null ? null : num(f.origen_periodo),
      ajuste: 0,
    });
  }
  return m;
}

/**
 * Calcula los saldos de un nodo y sus descendientes. `incluir` decide qué
 * imputables entran (las agrupadoras quedan si alguna hija entra).
 * Devuelve null si no queda nada.
 */
function calcularNodo(
  nodo: NodoPlan,
  importes: Map<string, Importes>,
  incluir: (cuenta: CuentaPlan, imp: Importes) => boolean
): NodoSaldo | null {
  const c = nodo.cuenta;
  const base = {
    id: c.id,
    codigo: c.codigo,
    nombre: c.nombre,
    nivel: c.nivel,
    clase: c.clase,
    imputable: c.imputable,
    activa: c.activa,
    moneda: c.moneda,
    corriente: c.corriente,
  };

  if (c.imputable || nodo.hijos.length === 0) {
    const imp = importes.get(c.id) ?? IMPORTES_CERO;
    if (!incluir(c, imp)) return null;
    const saldoAnterior = redondear(saldoPresentacion(c.clase, imp.debeAnterior, imp.haberAnterior));
    const movimiento = redondear(saldoPresentacion(c.clase, imp.debe, imp.haber));
    const saldoFinalOrigen = c.moneda
      ? redondear(signoClase(c.clase) * ((imp.origenAnterior ?? 0) + (imp.origenPeriodo ?? 0)))
      : null;
    return {
      ...base,
      debeAnterior: redondear(imp.debeAnterior),
      haberAnterior: redondear(imp.haberAnterior),
      debe: redondear(imp.debe),
      haber: redondear(imp.haber),
      saldoAnterior,
      movimiento,
      saldoFinal: redondear(saldoAnterior + movimiento + imp.ajuste),
      saldoFinalOrigen,
      conMovimiento:
        imp.debeAnterior !== 0 ||
        imp.haberAnterior !== 0 ||
        imp.debe !== 0 ||
        imp.haber !== 0 ||
        imp.ajuste !== 0,
      hijos: [],
    };
  }

  const hijos: NodoSaldo[] = [];
  for (const h of nodo.hijos) {
    const r = calcularNodo(h, importes, incluir);
    if (r) hijos.push(r);
  }
  if (hijos.length === 0) return null;

  const suma = (k: "debeAnterior" | "haberAnterior" | "debe" | "haber" | "saldoAnterior" | "movimiento" | "saldoFinal") =>
    redondear(hijos.reduce((s, h) => s + h[k], 0));

  return {
    ...base,
    debeAnterior: suma("debeAnterior"),
    haberAnterior: suma("haberAnterior"),
    debe: suma("debe"),
    haber: suma("haber"),
    saldoAnterior: suma("saldoAnterior"),
    movimiento: suma("movimiento"),
    saldoFinal: suma("saldoFinal"),
    saldoFinalOrigen: null,
    conMovimiento: hijos.some((h) => h.conMovimiento),
    hijos,
  };
}

/**
 * Árbol con saldos: las imputables toman sus importes de `saldos()` y las
 * agrupadoras suman a sus hijas. Por defecto entran todas las cuentas
 * activas y las inactivas que tengan algún importe.
 */
export function arbolConSaldos(
  plan: NodoPlan[],
  importes: Map<string, Importes>,
  incluir: (cuenta: CuentaPlan, imp: Importes) => boolean = (c, imp) =>
    c.activa || tieneImportes(imp)
): NodoSaldo[] {
  const res: NodoSaldo[] = [];
  for (const raiz of plan) {
    const n = calcularNodo(raiz, importes, incluir);
    if (n) res.push(n);
  }
  return res;
}

function tieneImportes(imp: Importes): boolean {
  return (
    imp.debeAnterior !== 0 || imp.haberAnterior !== 0 || imp.debe !== 0 || imp.haber !== 0 || imp.ajuste !== 0
  );
}

/** Recorre el árbol en profundidad (preorden). */
export function recorrer(nodos: NodoSaldo[], fn: (n: NodoSaldo) => void): void {
  for (const n of nodos) {
    fn(n);
    recorrer(n.hijos, fn);
  }
}

/** Filtra el árbol conservando los nodos que cumplen `pred` o tienen descendientes que lo cumplen. */
export function filtrarArbol(nodos: NodoSaldo[], pred: (n: NodoSaldo) => boolean): NodoSaldo[] {
  const res: NodoSaldo[] = [];
  for (const n of nodos) {
    const hijos = filtrarArbol(n.hijos, pred);
    if (hijos.length > 0 || (n.hijos.length === 0 && pred(n))) res.push({ ...n, hijos });
  }
  return res;
}

// ------------------------------------------------------------
// Balance de sumas y saldos
// ------------------------------------------------------------

export interface SumasYSaldos {
  arbol: NodoSaldo[];
  totales: {
    debeAnterior: number;
    haberAnterior: number;
    debe: number;
    haber: number;
    /** Σ saldos finales deudores (debe − haber > 0) de las imputables. */
    saldosDeudores: number;
    /** Σ saldos finales acreedores de las imputables (positivo). */
    saldosAcreedores: number;
  };
  cuadraAnterior: boolean;
  cuadraPeriodo: boolean;
  cuadraSaldos: boolean;
}

export function sumasYSaldos(cuentas: CuentaPlan[], filas: FilaSaldo[]): SumasYSaldos {
  const importes = importesPorCuenta(filas);
  const arbol = arbolConSaldos(armarArbol(cuentas), importes);

  // Los totales salen de las filas (todas las imputables con movimiento),
  // no del árbol: así una cuenta huérfana tampoco se pierde del control.
  let debeAnterior = 0;
  let haberAnterior = 0;
  let debe = 0;
  let haber = 0;
  let saldosDeudores = 0;
  let saldosAcreedores = 0;
  for (const imp of importes.values()) {
    debeAnterior += imp.debeAnterior;
    haberAnterior += imp.haberAnterior;
    debe += imp.debe;
    haber += imp.haber;
    const s = redondear(imp.debeAnterior + imp.debe - imp.haberAnterior - imp.haber);
    if (s > 0) saldosDeudores += s;
    else saldosAcreedores -= s;
  }
  const totales = {
    debeAnterior: redondear(debeAnterior),
    haberAnterior: redondear(haberAnterior),
    debe: redondear(debe),
    haber: redondear(haber),
    saldosDeudores: redondear(saldosDeudores),
    saldosAcreedores: redondear(saldosAcreedores),
  };
  return {
    arbol,
    totales,
    cuadraAnterior: iguales(totales.debeAnterior, totales.haberAnterior),
    cuadraPeriodo: iguales(totales.debe, totales.haber),
    cuadraSaldos: iguales(totales.saldosDeudores, totales.saldosAcreedores),
  };
}

// ------------------------------------------------------------
// Resultado del ejercicio
// ------------------------------------------------------------

/**
 * Superávit (déficit) = Σ ingresos − Σ egresos, ambos en signo de
 * presentación, acumulando saldo anterior + período. Con filas de
 * `saldos(inicio, hasta, p_excluir_cierre := true)` da el resultado del
 * ejercicio a la fecha `hasta`.
 */
export function resultadoAcumulado(
  cuentas: Pick<CuentaPlan, "id" | "clase">[],
  filas: FilaSaldo[]
): { ingresos: number; egresos: number; resultado: number } {
  const clase = new Map(cuentas.map((c) => [c.id, c.clase]));
  let ingresos = 0;
  let egresos = 0;
  for (const f of filas) {
    const cl = clase.get(f.cuenta_id);
    const d = num(f.debe_anterior) + num(f.debe);
    const h = num(f.haber_anterior) + num(f.haber);
    if (cl === "ingreso") ingresos += saldoPresentacion("ingreso", d, h);
    else if (cl === "egreso") egresos += saldoPresentacion("egreso", d, h);
  }
  ingresos = redondear(ingresos);
  egresos = redondear(egresos);
  return { ingresos, egresos, resultado: redondear(ingresos - egresos) };
}

/** Suma de saldos de las cuentas de disponibilidad (signo activo: debe − haber). */
export function totalDisponibilidades(cuentas: CuentaPlan[], filas: FilaSaldo[]): number {
  const disp = new Set(cuentas.filter((c) => c.es_disponibilidad).map((c) => c.id));
  let total = 0;
  for (const f of filas) {
    if (!disp.has(f.cuenta_id)) continue;
    total += saldoPresentacion(
      "activo",
      num(f.debe_anterior) + num(f.debe),
      num(f.haber_anterior) + num(f.haber)
    );
  }
  return redondear(total);
}

// ------------------------------------------------------------
// Estado de situación patrimonial
// ------------------------------------------------------------

export interface SeccionEstado {
  titulo: string;
  /** Rubros que se muestran en la sección (con sus hijas para el detalle). */
  nodos: NodoSaldo[];
  total: number;
}

export interface BloqueEstado {
  titulo: string;
  secciones: SeccionEstado[];
  total: number;
}

export interface EstadoSituacion {
  activo: BloqueEstado;
  pasivo: BloqueEstado;
  patrimonio: BloqueEstado;
  /** Superávit (déficit) del ejercicio inyectado en el patrimonio. */
  resultadoEjercicio: number;
  pasivoMasPatrimonio: number;
  /** Activo − (Pasivo + Patrimonio). Debe ser 0. */
  diferencia: number;
  cuadra: boolean;
}

/** Id sintético cuando el plan no tiene cuenta de resultado del ejercicio. */
export const ID_RESULTADO_SINTETICO = "resultado-ejercicio";

/**
 * Estado de situación a la fecha `hasta` del rango con que se pidieron las
 * filas (`saldos(inicio_ejercicio, hasta, p_excluir_cierre := true)`).
 *
 * Sin los asientos de cierre/refundición las cuentas de resultado siguen
 * con saldo, así que el patrimonio contable no incluye el resultado del
 * ejercicio: se calcula (ingresos − egresos) y se suma a la cuenta de
 * sistema `resultado_ejercicio` (3.4.02 "Superávit (déficit) del
 * ejercicio"). Como Σ(debe − haber) = 0 en todos los asientos, queda
 * Activo = Pasivo + Patrimonio + (Ingresos − Egresos) exacto.
 */
export function estadoSituacion(
  cuentas: CuentaPlan[],
  filas: FilaSaldo[],
  opciones: { cuentaResultadoId: string | null; ocultarCeros?: boolean }
): EstadoSituacion {
  const { resultado } = resultadoAcumulado(cuentas, filas);
  const importes = importesPorCuenta(filas);

  const cuentaResultado = opciones.cuentaResultadoId
    ? cuentas.find((c) => c.id === opciones.cuentaResultadoId && c.clase === "patrimonio" && c.imputable)
    : undefined;
  let listaCuentas = cuentas;
  if (cuentaResultado) {
    const prev = importes.get(cuentaResultado.id) ?? IMPORTES_CERO;
    importes.set(cuentaResultado.id, { ...prev, ajuste: redondear(prev.ajuste + resultado) });
  } else {
    // Sin cuenta configurada: línea sintética colgando de la raíz de patrimonio.
    const raiz = cuentas.find((c) => c.clase === "patrimonio" && c.padre_id === null);
    if (raiz) {
      listaCuentas = [
        ...cuentas,
        {
          id: ID_RESULTADO_SINTETICO,
          codigo: `${raiz.codigo}.999`,
          nombre: "Superávit (déficit) del ejercicio",
          padre_id: raiz.id,
          nivel: raiz.nivel + 1,
          clase: "patrimonio",
          naturaleza: "acreedora",
          imputable: true,
          moneda: null,
          corriente: null,
          es_disponibilidad: false,
          requiere_auxiliar: null,
          requiere_centro_costo: false,
          activa: true,
        },
      ];
      importes.set(ID_RESULTADO_SINTETICO, { ...IMPORTES_CERO, ajuste: resultado });
    }
  }

  const patrimoniales = listaCuentas.filter(
    (c) => c.clase === "activo" || c.clase === "pasivo" || c.clase === "patrimonio"
  );
  const plan = armarArbol(patrimoniales);
  const ocultar = opciones.ocultarCeros ?? true;
  const incluir = (c: CuentaPlan, imp: Importes) => {
    if (ocultar) {
      const s = saldoPresentacion(c.clase, imp.debeAnterior + imp.debe, imp.haberAnterior + imp.haber) + imp.ajuste;
      return !iguales(s, 0) || c.id === cuentaResultado?.id || c.id === ID_RESULTADO_SINTETICO;
    }
    return c.activa || tieneImportes(imp);
  };

  const raiz = (clase: ClaseCuenta) => plan.find((n) => n.cuenta.clase === clase);

  const bloqueCorriente = (clase: "activo" | "pasivo", titulo: string): BloqueEstado => {
    const r = raiz(clase);
    const secciones: SeccionEstado[] = [];
    if (r) {
      const etiqueta = clase === "activo" ? "Activo" : "Pasivo";
      for (const [esCorriente, nombre] of [
        [true, `${etiqueta} corriente`],
        [false, `${etiqueta} no corriente`],
      ] as const) {
        // Corriente o no corriente según la hoja (sin dato = corriente).
        const nodo = calcularNodo(r, importes, (c, imp) =>
          (c.corriente === false) === !esCorriente && incluir(c, imp)
        );
        if (!nodo) continue;
        // El rubro de nivel 2 que ya es "corriente"/"no corriente" se aplana
        // para no repetir el título de la sección.
        const nodos = nodo.hijos.flatMap((h) =>
          !h.imputable && h.corriente === esCorriente ? h.hijos : [h]
        );
        secciones.push({ titulo: nombre, nodos, total: nodo.saldoFinal });
      }
    }
    const total = redondear(secciones.reduce((s, x) => s + x.total, 0));
    return { titulo, secciones, total };
  };

  const activo = bloqueCorriente("activo", "Activo");
  const pasivo = bloqueCorriente("pasivo", "Pasivo");

  const rp = raiz("patrimonio");
  const nodoPat = rp ? calcularNodo(rp, importes, incluir) : null;
  const patrimonio: BloqueEstado = {
    titulo: "Patrimonio",
    secciones: nodoPat ? [{ titulo: "Patrimonio social", nodos: nodoPat.hijos, total: nodoPat.saldoFinal }] : [],
    total: nodoPat?.saldoFinal ?? 0,
  };

  const pasivoMasPatrimonio = redondear(pasivo.total + patrimonio.total);
  const diferencia = redondear(activo.total - pasivoMasPatrimonio);
  return {
    activo,
    pasivo,
    patrimonio,
    resultadoEjercicio: resultado,
    pasivoMasPatrimonio,
    diferencia,
    cuadra: iguales(diferencia, 0),
  };
}

// ------------------------------------------------------------
// Estado de resultados (de recursos y gastos)
// ------------------------------------------------------------

export interface EstadoResultados {
  /** Raíz de ingresos (clase 4) con rubros y cuentas; saldoFinal = recursos del período. */
  ingresos: NodoSaldo | null;
  egresos: NodoSaldo | null;
  totalIngresos: number;
  totalEgresos: number;
  /** Superávit (déficit) del período. */
  resultado: number;
}

/**
 * Estado de resultados del rango con filas de
 * `saldos(desde, hasta, p_excluir_cierre := true)`. Solo cuenta el
 * movimiento del rango (debe/haber), no el saldo anterior.
 */
export function estadoResultados(
  cuentas: CuentaPlan[],
  filas: FilaSaldo[],
  opciones: { ocultarCeros?: boolean } = {}
): EstadoResultados {
  const importes = new Map<string, Importes>();
  for (const [id, imp] of importesPorCuenta(filas)) {
    importes.set(id, { ...IMPORTES_CERO, debe: imp.debe, haber: imp.haber });
  }
  const ocultar = opciones.ocultarCeros ?? true;
  const plan = armarArbol(cuentas.filter((c) => c.clase === "ingreso" || c.clase === "egreso"));
  const incluir = (c: CuentaPlan, imp: Importes) =>
    ocultar ? imp.debe !== 0 || imp.haber !== 0 : c.activa || tieneImportes(imp);

  const raiz = (clase: ClaseCuenta) => {
    const r = plan.find((n) => n.cuenta.clase === clase);
    return r ? calcularNodo(r, importes, incluir) : null;
  };
  const ingresos = raiz("ingreso");
  const egresos = raiz("egreso");
  const totalIngresos = ingresos?.saldoFinal ?? 0;
  const totalEgresos = egresos?.saldoFinal ?? 0;
  return {
    ingresos,
    egresos,
    totalIngresos,
    totalEgresos,
    resultado: redondear(totalIngresos - totalEgresos),
  };
}

// ------------------------------------------------------------
// Resultado por centro de costo
// ------------------------------------------------------------

export interface LineaCentro {
  cuenta_id: string;
  centro_costo_id: string | null;
  debe: number;
  haber: number;
}

export interface CentroCosto {
  id: string;
  codigo: string;
  nombre: string;
  disciplina_id: number | null;
}

export interface RubroCentro {
  id: string;
  codigo: string;
  nombre: string;
  clase: "ingreso" | "egreso";
  importe: number;
}

export interface ResultadoCentro {
  /** null = sin centro asignado. */
  centro: CentroCosto | null;
  ingresos: number;
  egresos: number;
  resultado: number;
  rubros: RubroCentro[];
}

export interface ResultadosPorCentro {
  disciplinas: ResultadoCentro[];
  areas: ResultadoCentro[];
  sinCentro: ResultadoCentro | null;
  total: { ingresos: number; egresos: number; resultado: number };
}

/**
 * Reparte el estado de resultados por centro de costo.
 * `lineas` son solo las que tienen centro (de cuentas de ingreso/egreso,
 * asientos confirmados del rango, sin cierre ni refundición); lo que no
 * tiene centro sale por diferencia contra `saldos`, así el total cierra
 * exacto con el estado de resultados. Rubro = antepasado de nivel 2.
 */
export function resultadosPorCentro(
  cuentas: CuentaPlan[],
  filas: FilaSaldo[],
  lineas: LineaCentro[],
  centros: CentroCosto[]
): ResultadosPorCentro {
  const porId = new Map(cuentas.map((c) => [c.id, c]));
  const rubroDe = (cuentaId: string): CuentaPlan | undefined => {
    let c = porId.get(cuentaId);
    while (c && c.nivel > 2 && c.padre_id) c = porId.get(c.padre_id);
    return c;
  };

  type Acum = Map<string, number>; // rubroId → importe de presentación
  const acumular = (m: Acum, cuentaId: string, debe: number, haber: number) => {
    const c = porId.get(cuentaId);
    if (!c || (c.clase !== "ingreso" && c.clase !== "egreso")) return;
    const r = rubroDe(cuentaId) ?? c;
    m.set(r.id, (m.get(r.id) ?? 0) + saldoPresentacion(c.clase, debe, haber));
  };

  // Totales por rubro (todo el resultado del rango)
  const totalRubros: Acum = new Map();
  for (const f of filas) acumular(totalRubros, f.cuenta_id, num(f.debe), num(f.haber));

  // Por centro
  const porCentro = new Map<string, Acum>();
  for (const l of lineas) {
    if (!l.centro_costo_id) continue;
    let m = porCentro.get(l.centro_costo_id);
    if (!m) porCentro.set(l.centro_costo_id, (m = new Map()));
    acumular(m, l.cuenta_id, num(l.debe), num(l.haber));
  }

  // Sin centro = total − Σ centros
  const sinCentro: Acum = new Map(totalRubros);
  for (const m of porCentro.values()) {
    for (const [r, v] of m) sinCentro.set(r, (sinCentro.get(r) ?? 0) - v);
  }

  const armar = (centro: CentroCosto | null, m: Acum): ResultadoCentro => {
    const rubros: RubroCentro[] = [];
    let ingresos = 0;
    let egresos = 0;
    for (const [rid, v] of m) {
      const imp = redondear(v);
      if (imp === 0) continue;
      const r = porId.get(rid);
      if (!r || (r.clase !== "ingreso" && r.clase !== "egreso")) continue;
      rubros.push({ id: r.id, codigo: r.codigo, nombre: r.nombre, clase: r.clase, importe: imp });
      if (r.clase === "ingreso") ingresos += imp;
      else egresos += imp;
    }
    rubros.sort((a, b) => compararCodigo(a.codigo, b.codigo));
    ingresos = redondear(ingresos);
    egresos = redondear(egresos);
    return { centro, ingresos, egresos, resultado: redondear(ingresos - egresos), rubros };
  };

  const disciplinas: ResultadoCentro[] = [];
  const areas: ResultadoCentro[] = [];
  for (const c of centros) {
    const m = porCentro.get(c.id);
    if (!m) continue;
    const r = armar(c, m);
    if (r.rubros.length === 0) continue;
    (c.disciplina_id != null ? disciplinas : areas).push(r);
  }
  // Centros que aparecen en líneas pero no en el listado (no debería pasar)
  for (const [id, m] of porCentro) {
    if (centros.some((c) => c.id === id)) continue;
    const r = armar({ id, codigo: "?", nombre: "Centro desconocido", disciplina_id: null }, m);
    if (r.rubros.length > 0) areas.push(r);
  }
  const porNombre = (a: ResultadoCentro, b: ResultadoCentro) =>
    (a.centro?.nombre ?? "").localeCompare(b.centro?.nombre ?? "", "es");
  disciplinas.sort(porNombre);
  areas.sort(porNombre);

  const sc = armar(null, sinCentro);
  const total = armar(null, totalRubros);
  return {
    disciplinas,
    areas,
    sinCentro: sc.rubros.length > 0 ? sc : null,
    total: { ingresos: total.ingresos, egresos: total.egresos, resultado: total.resultado },
  };
}

// ------------------------------------------------------------
// Ingresos vs egresos por mes
// ------------------------------------------------------------

export interface ResultadoMes {
  /** "YYYY-MM" */
  mes: string;
  ingresos: number;
  egresos: number;
  resultado: number;
}

/** Ingresos y egresos de un mes a partir de `saldos(inicio_mes, fin_mes, true)` (solo el movimiento). */
export function resultadoDelMes(
  mes: string,
  cuentas: Pick<CuentaPlan, "id" | "clase">[],
  filas: FilaSaldo[]
): ResultadoMes {
  const r = resultadoAcumulado(
    cuentas,
    filas.map((f) => ({ ...f, debe_anterior: 0, haber_anterior: 0 }))
  );
  return { mes, ingresos: r.ingresos, egresos: r.egresos, resultado: r.resultado };
}

// ------------------------------------------------------------
// Lectura paginada (PostgREST corta en 1000 filas)
// ------------------------------------------------------------

/**
 * Pide páginas de `tamanio` filas hasta que una venga incompleta.
 * `pedir(desde, hasta)` tiene que aplicar `.range(desde, hasta)` sobre
 * una consulta con orden estable.
 */
export async function leerPaginado<T>(
  pedir: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  tamanio = 1000,
  maxPaginas = 200
): Promise<{ filas: T[]; error: string | null }> {
  const filas: T[] = [];
  for (let p = 0; p < maxPaginas; p++) {
    const { data, error } = await pedir(p * tamanio, (p + 1) * tamanio - 1);
    if (error) return { filas, error: error.message };
    const lote = data ?? [];
    filas.push(...lote);
    if (lote.length < tamanio) return { filas, error: null };
  }
  return { filas, error: "Demasiadas filas para el reporte: acotá el rango de fechas" };
}

// ------------------------------------------------------------
// Libro mayor
// ------------------------------------------------------------

export interface FilaMayor extends MovimientoMayor {
  /** Saldo acumulado recalculado (igual al de la base si no hay filtro). */
  saldoCalculado: number;
  saldoOrigenCalculado: number | null;
}

/**
 * Recalcula el saldo acumulado de un conjunto de movimientos (en el orden
 * en que vienen) a partir de un saldo anterior en signo de presentación.
 * Se usa al filtrar el mayor por auxiliar.
 */
export function acumularMayor(
  movimientos: MovimientoMayor[],
  clase: ClaseCuenta,
  saldoAnterior: number,
  saldoAnteriorOrigen: number | null
): FilaMayor[] {
  const signo = signoClase(clase);
  let s = saldoAnterior;
  let so = saldoAnteriorOrigen;
  return movimientos.map((m) => {
    s = redondear(s + signo * (num(m.debe) - num(m.haber)));
    if (so !== null) so = redondear(so + signo * num(m.importe_origen));
    return { ...m, saldoCalculado: s, saldoOrigenCalculado: so };
  });
}

export interface ImporteAuxiliar {
  auxiliarId: number | null;
  debe: number;
  haber: number;
  /** En moneda de la cuenta, signo debe − haber. */
  origen: number;
}

export interface ResumenAuxiliar {
  auxiliarId: number | null;
  saldoAnterior: number;
  debe: number;
  haber: number;
  saldoFinal: number;
  saldoAnteriorOrigen: number;
  saldoFinalOrigen: number;
  movimientos: number;
}

/**
 * Agrupa el mayor por auxiliar (proveedor o disciplina): saldo anterior
 * (de las líneas previas al rango), debe, haber y saldo final, en signo de
 * presentación de la clase.
 */
export function resumenPorAuxiliar(
  clase: ClaseCuenta,
  tipo: "proveedor" | "disciplina",
  anteriores: ImporteAuxiliar[],
  movimientos: MovimientoMayor[]
): ResumenAuxiliar[] {
  const signo = signoClase(clase);
  const m = new Map<number | null, ResumenAuxiliar>();
  const get = (id: number | null) => {
    let r = m.get(id);
    if (!r) {
      r = {
        auxiliarId: id,
        saldoAnterior: 0,
        debe: 0,
        haber: 0,
        saldoFinal: 0,
        saldoAnteriorOrigen: 0,
        saldoFinalOrigen: 0,
        movimientos: 0,
      };
      m.set(id, r);
    }
    return r;
  };
  for (const a of anteriores) {
    const r = get(a.auxiliarId);
    r.saldoAnterior += signo * (a.debe - a.haber);
    r.saldoAnteriorOrigen += signo * a.origen;
  }
  for (const mv of movimientos) {
    const id = tipo === "proveedor" ? mv.proveedor_id : mv.disciplina_id;
    const r = get(id ?? null);
    r.debe += num(mv.debe);
    r.haber += num(mv.haber);
    r.saldoFinalOrigen += signo * num(mv.importe_origen);
    r.movimientos += 1;
  }
  const res = [...m.values()].map((r) => {
    const saldoAnterior = redondear(r.saldoAnterior);
    const debe = redondear(r.debe);
    const haber = redondear(r.haber);
    const saldoAnteriorOrigen = redondear(r.saldoAnteriorOrigen);
    return {
      ...r,
      saldoAnterior,
      debe,
      haber,
      saldoFinal: redondear(saldoAnterior + signo * (debe - haber)),
      saldoAnteriorOrigen,
      saldoFinalOrigen: redondear(saldoAnteriorOrigen + r.saldoFinalOrigen),
    };
  });
  return res.filter((r) => r.movimientos > 0 || !iguales(r.saldoAnterior, 0));
}

/** Saldo anterior de un auxiliar en signo de presentación (UYU y moneda de origen). */
export function saldoAnteriorAuxiliar(
  clase: ClaseCuenta,
  anteriores: ImporteAuxiliar[],
  auxiliarId: number | null
): { saldo: number; origen: number } {
  const signo = signoClase(clase);
  let saldo = 0;
  let origen = 0;
  for (const a of anteriores) {
    if (a.auxiliarId !== auxiliarId) continue;
    saldo += signo * (a.debe - a.haber);
    origen += signo * a.origen;
  }
  return { saldo: redondear(saldo), origen: redondear(origen) };
}
