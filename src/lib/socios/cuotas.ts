import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database as DbSocios } from "@/types/socios";
import type { Database as DbPublico } from "@/types/database";
import type { Database as DbContable } from "@/types/contabilidad";

/**
 * Lecturas de cuotas y cobranza de socios (schema `socios`).
 *
 * Todas reciben los clientes ya creados (con la sesión del usuario en el
 * dashboard, o el del servidor MCP) y no validan roles: la base aplica RLS y
 * cada RPC vuelve a exigir el suyo. Las personas viven en
 * `public.padron_socios`, por eso casi todas reciben también el cliente público.
 */

export type ClienteSocios = SupabaseClient<DbSocios, "socios">;
export type ClientePadron = SupabaseClient<DbPublico>;
export type ClienteContable = SupabaseClient<DbContable, "contabilidad">;

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------

export type Medio = "debito_visa" | "transferencia_club" | "transferencia_disciplina" | "efectivo";

export const MEDIOS: Medio[] = ["debito_visa", "transferencia_club", "transferencia_disciplina", "efectivo"];

export const NOMBRE_MEDIO: Record<string, string> = {
  debito_visa: "Débito Visa",
  transferencia_club: "Transferencia al club",
  transferencia_disciplina: "Cuenta de la disciplina",
  efectivo: "Efectivo",
  liquidacion_disciplina: "A cargo de la disciplina",
};

export const NOMBRE_TIPO_CREDITO: Record<string, string> = {
  bonificacion: "Bonificación",
  anulacion: "Anulación",
  baja: "Baja",
};

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => Number(v ?? 0);

/** "2026-10-15" → "2026-10-01". */
export function inicioMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** "2026-10-01" → "2026-10-31". */
export function finMes(iso: string): string {
  const [y, m] = iso.slice(0, 7).split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${iso.slice(0, 7)}-${String(ultimo).padStart(2, "0")}`;
}

/** Suma meses a un período "YYYY-MM-01". */
export function sumarMeses(periodo: string, n: number): string {
  const [y, m] = periodo.slice(0, 7).split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** "2026-10-01" → "Octubre 2026". */
export function nombrePeriodo(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m] = iso.slice(0, 7).split("-").map(Number);
  return `${MESES[m - 1]} ${y}`;
}

export function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export const soloDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

type Respuesta<T> = PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>;

/** Lee todas las páginas (PostgREST corta en 1000 filas). */
export async function leerTodo<T>(pedir: (desde: number, hasta: number) => Respuesta<T>, tam = 1000): Promise<T[]> {
  const filas: T[] = [];
  for (let p = 0; p < 500; p++) {
    const { data, error } = await pedir(p * tam, (p + 1) * tam - 1);
    if (error) throw new Error(error.code === "42501" ? "No tenés permiso para ver estos datos" : error.message);
    const lote = data ?? [];
    filas.push(...lote);
    if (lote.length < tam) break;
  }
  return filas;
}

/**
 * Lee por ids en tandas (la URL tiene límite) y pagina cada tanda.
 * `pedir` tiene que ordenar por una clave única para que el paginado sea estable.
 */
async function porIds<T>(
  ids: Iterable<number>,
  pedir: (ids: number[], desde: number, hasta: number) => Respuesta<T>,
  tam = 200
): Promise<T[]> {
  const unicos = [...new Set(ids)].filter((n) => Number.isFinite(n));
  const out: T[] = [];
  for (let i = 0; i < unicos.length; i += tam) {
    const lote = unicos.slice(i, i + tam);
    out.push(...(await leerTodo((a, b) => pedir(lote, a, b))));
  }
  return out;
}

function exigir<T>(r: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (r.error) throw new Error(r.error.code === "42501" ? "No tenés permiso para ver estos datos" : r.error.message);
  return r.data as T;
}

// ------------------------------------------------------------
// Personas y catálogos
// ------------------------------------------------------------

export interface Persona {
  id: number;
  nombre: string;
  apellido: string;
  cedula: string;
  numero_socio: number | null;
  activo: boolean;
}

export const nombrePersona = (p: Pick<Persona, "nombre" | "apellido"> | null | undefined) =>
  p ? `${p.apellido}, ${p.nombre}` : "Persona desconocida";

// numero_socio se agregó con el schema socios y todavía no está en los tipos de public.
type FilaPadron = DbPublico["public"]["Tables"]["padron_socios"]["Row"] & { numero_socio?: number | null };

const aPersona = (f: FilaPadron): Persona => ({
  id: f.id,
  nombre: f.nombre,
  apellido: f.apellido,
  cedula: f.cedula,
  numero_socio: f.numero_socio ?? null,
  activo: f.activo,
});

export async function leerPersonas(db: ClientePadron, ids: Iterable<number>): Promise<Map<number, Persona>> {
  const filas = await porIds<FilaPadron>(ids, (lote, a, b) => db.from("padron_socios").select("*").in("id", lote).order("id").range(a, b));
  return new Map(filas.map((f) => [f.id, aPersona(f)]));
}

/** Busca por nombre, apellido, cédula o número de socio. */
export async function buscarPersonas(db: ClientePadron, texto: string, limite = 12): Promise<Persona[]> {
  const limpio = texto.replace(/[%,()*"\\]/g, " ").trim();
  if (limpio.length < 2) return [];
  let q = db.from("padron_socios").select("*");
  const digitos = soloDigitos(limpio);
  if (digitos.length > 0 && digitos.length === limpio.replace(/[.\-\s]/g, "").length) {
    const filtros = [`cedula.ilike.%${digitos}%`];
    if (digitos.length <= 7) filtros.push(`numero_socio.eq.${Number(digitos)}`);
    q = q.or(filtros.join(","));
  } else {
    for (const palabra of limpio.split(/\s+/).filter(Boolean).slice(0, 4)) {
      q = q.or(`nombre.ilike.%${palabra}%,apellido.ilike.%${palabra}%`);
    }
  }
  const filas = exigir(await q.order("apellido").order("nombre").limit(limite)) as FilaPadron[];
  return filas.map(aPersona);
}

export interface Disciplina {
  id: number;
  nombre: string;
  activa: boolean;
}

export async function leerDisciplinas(db: ClientePadron): Promise<Disciplina[]> {
  const filas = exigir(await db.from("disciplinas").select("id, nombre, activa").order("nombre"));
  return filas.map((d) => ({ id: d.id, nombre: d.nombre, activa: d.activa ?? true }));
}

export interface Plan {
  id: number;
  nombre: string;
  tipo: string;
  disciplina_id: number | null;
}

/**
 * Planes. Si la lectura falla (permisos de la tabla) devuelve [] y quien
 * llama usa lo que dicen las cuotas: el resto de la pantalla sigue andando.
 */
export async function leerPlanes(db: ClienteSocios): Promise<Plan[]> {
  const { data, error } = await db.from("planes").select("id, nombre, tipo, disciplina_id").order("nombre");
  return error ? [] : (data ?? []);
}

export interface CuentaDisponible {
  id: string;
  codigo: string;
  nombre: string;
}

/** Cajas y bancos en pesos (donde puede entrar un cobro o salir una transferencia). */
export async function cuentasDisponibilidad(db: ClienteContable): Promise<CuentaDisponible[]> {
  const { data } = await db
    .from("cuentas")
    .select("id, codigo, nombre")
    .eq("es_disponibilidad", true)
    .eq("imputable", true)
    .eq("activa", true)
    .is("moneda", null)
    .order("codigo");
  return data ?? [];
}

/** Cuentas configuradas para el proceso de socios (banco y caja por defecto). */
export async function cuentasPorDefecto(db: ClienteContable): Promise<{ banco: string | null; caja: string | null }> {
  const { data } = await db
    .from("parametros_cuentas")
    .select("rol, cuenta_id")
    .eq("proceso", "socios")
    .in("rol", ["banco_cobros", "caja"]);
  const m = new Map((data ?? []).map((p) => [p.rol, p.cuenta_id]));
  return { banco: m.get("banco_cobros") ?? null, caja: m.get("caja") ?? null };
}

// ------------------------------------------------------------
// Configuración y situación
// ------------------------------------------------------------

export type ConfigCuotas = DbSocios["socios"]["Tables"]["config"]["Row"];

export async function leerConfig(db: ClienteSocios): Promise<ConfigCuotas | null> {
  const { data } = await db.from("config").select("*").maybeSingle();
  return data;
}

export interface FilaSituacion {
  persona_id: number;
  es_socio: boolean;
  medio: string | null;
  cuotas_vencidas: number;
  deuda_vencida: number;
  deuda_total: number;
  saldo_a_favor: number;
  al_dia: boolean;
}

export async function leerSituacion(db: ClienteSocios, fecha?: string): Promise<FilaSituacion[]> {
  const filas = await leerTodo((a, b) =>
    db.rpc("situacion", { p_fecha: fecha }).order("persona_id").range(a, b)
  );
  return filas.map((f) => ({
    persona_id: f.persona_id,
    es_socio: !!f.es_socio,
    medio: f.medio ?? null,
    cuotas_vencidas: num(f.cuotas_vencidas),
    deuda_vencida: num(f.deuda_vencida),
    deuda_total: num(f.deuda_total),
    saldo_a_favor: num(f.saldo_a_favor),
    al_dia: !!f.al_dia,
  }));
}

export interface FilaControl {
  concepto: string;
  segun_socios: number;
  segun_contabilidad: number;
  diferencia: number;
}

export async function controlContable(db: ClienteSocios): Promise<FilaControl[]> {
  const filas = exigir(await db.rpc("control_contable"));
  return filas.map((f) => ({
    concepto: f.concepto,
    segun_socios: num(f.segun_socios),
    segun_contabilidad: num(f.segun_contabilidad),
    diferencia: r2(num(f.diferencia)),
  }));
}

// ------------------------------------------------------------
// Resumen
// ------------------------------------------------------------

export type Lote = DbSocios["socios"]["Tables"]["lotes"]["Row"];

export interface ResumenCuotas {
  fecha: string;
  socios: number;
  alDia: number;
  noAlDia: number;
  conDeuda: number;
  deudaTotal: number;
  deudaVencida: number;
  saldoAFavor: number;
  personasConSaldoAFavor: number;
  cobradoMes: { medio: string; cantidad: number; importe: number }[];
  totalCobradoMes: number;
  ultimoLote: (Lote & { cobrado: number; pendiente: number }) | null;
  control: FilaControl[] | null;
}

/**
 * Indicadores de cobranza a una fecha. `conControl` pide el control contable
 * (solo tesorería y Comisión Fiscal lo pueden leer).
 */
export async function resumenCuotas(db: ClienteSocios, hoy: string, conControl: boolean): Promise<ResumenCuotas> {
  const desdeMes = inicioMes(hoy);
  const [situacion, cobros, ultimo, control] = await Promise.all([
    leerSituacion(db, hoy),
    leerTodo((a, b) =>
      db
        .from("cobros")
        .select("id, medio, importe")
        .eq("estado", "vigente")
        .gte("fecha", desdeMes)
        .lte("fecha", hoy)
        .order("id")
        .range(a, b)
    ),
    db.from("lotes").select("*").eq("estado", "emitido").order("periodo", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle(),
    conControl ? controlContable(db) : Promise.resolve(null),
  ]);

  const socios = situacion.filter((s) => s.es_socio);
  const porMedio = new Map<string, { cantidad: number; importe: number }>();
  for (const c of cobros) {
    const m = porMedio.get(c.medio) ?? { cantidad: 0, importe: 0 };
    m.cantidad += 1;
    m.importe = r2(m.importe + num(c.importe));
    porMedio.set(c.medio, m);
  }

  let ultimoLote: ResumenCuotas["ultimoLote"] = null;
  if (ultimo.data) {
    const lote = ultimo.data;
    const cuotas = await leerTodo((a, b) =>
      db.from("cuotas_saldo").select("id, importe, saldo").eq("lote_id", lote.id).order("id").range(a, b)
    );
    const pendiente = r2(cuotas.reduce((s, c) => s + num(c.saldo), 0));
    ultimoLote = { ...lote, pendiente, cobrado: r2(num(lote.importe_total) - pendiente) };
  }

  return {
    fecha: hoy,
    socios: socios.length,
    alDia: socios.filter((s) => s.al_dia).length,
    noAlDia: socios.filter((s) => !s.al_dia).length,
    conDeuda: situacion.filter((s) => s.deuda_total > 0).length,
    deudaTotal: r2(situacion.reduce((s, f) => s + f.deuda_total, 0)),
    deudaVencida: r2(situacion.reduce((s, f) => s + f.deuda_vencida, 0)),
    saldoAFavor: r2(situacion.reduce((s, f) => s + f.saldo_a_favor, 0)),
    personasConSaldoAFavor: situacion.filter((s) => s.saldo_a_favor > 0).length,
    cobradoMes: MEDIOS.map((m) => ({ medio: m, ...(porMedio.get(m) ?? { cantidad: 0, importe: 0 }) })),
    totalCobradoMes: r2(cobros.reduce((s, c) => s + num(c.importe), 0)),
    ultimoLote,
    control,
  };
}

// ------------------------------------------------------------
// Lotes
// ------------------------------------------------------------

export async function listarLotes(db: ClienteSocios): Promise<Lote[]> {
  return exigir(
    await db.from("lotes").select("*").order("periodo", { ascending: false }).order("id", { ascending: false }).limit(240)
  );
}

export interface FilaPrevia {
  suscripcion_id: number;
  persona_id: number;
  persona: string;
  cedula: string;
  numero_socio: number | null;
  plan_id: number;
  plan: string;
  tipo: string;
  disciplina_id: number | null;
  disciplina: string | null;
  concepto: string;
  periodicidad: string;
  importe: number;
  excluida: string | null;
}

/** "Cuota social — 08/2026" → "Cuota social" (el concepto es plan + " — " + período). */
function planDelConcepto(concepto: string): string {
  const i = concepto.lastIndexOf(" — ");
  return i > 0 ? concepto.slice(0, i) : concepto;
}

export async function previsualizarLote(db: ClienteSocios, padron: ClientePadron, periodo: string): Promise<FilaPrevia[]> {
  const [filas, planes, disciplinas] = await Promise.all([
    leerTodo((a, b) => db.rpc("previsualizar_lote", { p_periodo: periodo }).order("suscripcion_id").range(a, b)),
    leerPlanes(db),
    leerDisciplinas(padron),
  ]);
  const personas = await leerPersonas(padron, filas.map((f) => f.persona_id));
  const plan = new Map(planes.map((p) => [p.id, p.nombre]));
  const disc = new Map(disciplinas.map((d) => [d.id, d.nombre]));
  return filas
    .map((f) => {
      const p = personas.get(f.persona_id);
      return {
        suscripcion_id: f.suscripcion_id,
        persona_id: f.persona_id,
        persona: nombrePersona(p),
        cedula: p?.cedula ?? "",
        numero_socio: p?.numero_socio ?? null,
        plan_id: f.plan_id,
        plan: plan.get(f.plan_id) ?? planDelConcepto(f.concepto),
        tipo: f.tipo,
        disciplina_id: f.disciplina_id ?? null,
        disciplina: f.disciplina_id ? disc.get(f.disciplina_id) ?? null : null,
        concepto: f.concepto,
        periodicidad: f.periodicidad,
        importe: num(f.importe),
        excluida: f.excluida ?? null,
      };
    })
    .sort((a, b) => a.persona.localeCompare(b.persona, "es") || a.plan.localeCompare(b.plan, "es"));
}

// ------------------------------------------------------------
// Cobros
// ------------------------------------------------------------

export interface AplicacionCobro {
  cuota_id: number;
  concepto: string;
  importe: number;
  fecha: string;
  anulada: boolean;
  saldoAFavor: boolean;
}

export interface CobroLista {
  id: number;
  persona_id: number;
  persona: string;
  cedula: string;
  fecha: string;
  medio: string;
  disciplina: string | null;
  importe: number;
  aplicado: number;
  saldo_a_favor: number;
  referencia: string | null;
  estado: string;
  motivo_anulacion: string | null;
  liquidacion_visa_id: number | null;
  asiento_id: string | null;
  aplicaciones: AplicacionCobro[];
}

export interface FiltrosCobros {
  desde: string;
  hasta: string;
  medio?: string | null;
  persona?: number | null;
}

export async function listarCobros(db: ClienteSocios, padron: ClientePadron, f: FiltrosCobros): Promise<CobroLista[]> {
  const cobros = await leerTodo((a, b) => {
    let q = db.from("cobros_saldo").select("*").gte("fecha", f.desde).lte("fecha", f.hasta);
    if (f.medio) q = q.eq("medio", f.medio);
    if (f.persona) q = q.eq("persona_id", f.persona);
    return q.order("fecha", { ascending: false }).order("id", { ascending: false }).range(a, b);
  });
  const ids = cobros.map((c) => c.id as number);
  const [personas, disciplinas, aplicaciones] = await Promise.all([
    leerPersonas(padron, cobros.map((c) => c.persona_id as number)),
    leerDisciplinas(padron),
    porIds(ids, (lote, a, b) =>
      db
        .from("aplicaciones")
        .select("id, cobro_id, cuota_id, importe, fecha, anulada, asiento_id")
        .in("cobro_id", lote)
        .order("id")
        .range(a, b)
    ),
  ]);
  const conceptos = new Map(
    (
      await porIds(
        aplicaciones.map((a) => a.cuota_id),
        (lote, a, b) => db.from("cuotas").select("id, concepto").in("id", lote).order("id").range(a, b)
      )
    ).map((c) => [c.id, c.concepto])
  );
  const disc = new Map(disciplinas.map((d) => [d.id, d.nombre]));
  const asientoCobro = new Map(cobros.map((c) => [c.id as number, c.asiento_id]));
  const apl = new Map<number, AplicacionCobro[]>();
  for (const a of aplicaciones) {
    const lista = apl.get(a.cobro_id) ?? [];
    lista.push({
      cuota_id: a.cuota_id,
      concepto: conceptos.get(a.cuota_id) ?? `Cuota ${a.cuota_id}`,
      importe: num(a.importe),
      fecha: a.fecha,
      anulada: a.anulada,
      saldoAFavor: a.asiento_id !== asientoCobro.get(a.cobro_id),
    });
    apl.set(a.cobro_id, lista);
  }
  return cobros.map((c) => {
    const p = personas.get(c.persona_id as number);
    return {
      id: c.id as number,
      persona_id: c.persona_id as number,
      persona: nombrePersona(p),
      cedula: p?.cedula ?? "",
      fecha: c.fecha as string,
      medio: c.medio as string,
      disciplina: c.disciplina_id ? disc.get(c.disciplina_id) ?? null : null,
      importe: num(c.importe),
      aplicado: num(c.aplicado),
      saldo_a_favor: num(c.saldo_a_favor),
      referencia: c.referencia,
      estado: c.estado as string,
      motivo_anulacion: c.motivo_anulacion,
      liquidacion_visa_id: c.liquidacion_visa_id,
      asiento_id: c.asiento_id,
      aplicaciones: (apl.get(c.id as number) ?? []).sort((x, y) => x.fecha.localeCompare(y.fecha)),
    };
  });
}

export interface CuotaPendiente {
  id: number;
  concepto: string;
  tipo: string;
  disciplina_id: number | null;
  periodo_desde: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  importe: number;
  pagado: number;
  acreditado: number;
  saldo: number;
  /**
   * En la cuenta de qué disciplina se puede pagar: la cuota de una disciplina,
   * en la suya; la social, en la que la tiene a cargo. Solo lo llena `cuentaPersona`.
   */
  cuenta_disciplina?: number | null;
}

/** Cuotas emitidas con saldo, en el orden en que las cancela un cobro (las más viejas primero). */
export async function cuotasConSaldo(db: ClienteSocios, personas: number[]): Promise<Map<number, CuotaPendiente[]>> {
  const filas = await porIds(personas, (lote, a, b) =>
    db
      .from("cuotas_saldo")
      .select("id, persona_id, concepto, tipo, disciplina_id, periodo_desde, fecha_emision, fecha_vencimiento, importe, pagado, acreditado, saldo")
      .in("persona_id", lote)
      .eq("estado", "emitida")
      .gt("saldo", 0)
      .order("id")
      .range(a, b)
  );
  const out = new Map<number, CuotaPendiente[]>();
  for (const f of filas) {
    const lista = out.get(f.persona_id as number) ?? [];
    lista.push({
      id: f.id as number,
      concepto: f.concepto as string,
      tipo: f.tipo as string,
      disciplina_id: f.disciplina_id,
      periodo_desde: f.periodo_desde as string,
      fecha_emision: f.fecha_emision as string,
      fecha_vencimiento: f.fecha_vencimiento as string,
      importe: num(f.importe),
      pagado: num(f.pagado),
      acreditado: num(f.acreditado),
      saldo: num(f.saldo),
    });
    out.set(f.persona_id as number, lista);
  }
  for (const lista of out.values()) lista.sort(ordenCuotas);
  return out;
}

/** Mismo orden que `socios._repartir`: vencimiento, período, id. */
export function ordenCuotas(a: CuotaPendiente, b: CuotaPendiente): number {
  return (
    a.fecha_vencimiento.localeCompare(b.fecha_vencimiento) ||
    a.periodo_desde.localeCompare(b.periodo_desde) ||
    a.id - b.id
  );
}

/**
 * Reparto de un importe sobre las cuotas con saldo (réplica de
 * `socios._repartir` para mostrarlo antes de confirmar): solo cuotas emitidas
 * hasta la fecha, las elegidas o todas, las más viejas primero.
 */
export function repartir(
  cuotas: CuotaPendiente[],
  importe: number,
  fecha: string,
  elegidas?: number[] | null
): { aplicaciones: { cuota: CuotaPendiente; importe: number }[]; aplicado: number; aFavor: number } {
  let resto = r2(importe);
  const aplicaciones: { cuota: CuotaPendiente; importe: number }[] = [];
  for (const c of [...cuotas].sort(ordenCuotas)) {
    if (resto <= 0) break;
    if (c.fecha_emision > fecha || c.saldo <= 0) continue;
    if (elegidas && !elegidas.includes(c.id)) continue;
    const aplica = r2(Math.min(c.saldo, resto));
    aplicaciones.push({ cuota: c, importe: aplica });
    resto = r2(resto - aplica);
  }
  const aplicado = r2(aplicaciones.reduce((s, a) => s + a.importe, 0));
  return { aplicaciones, aplicado, aFavor: r2(importe - aplicado) };
}

export interface CuentaPersona {
  persona: Persona;
  cuotas: CuotaPendiente[];
  saldoAFavor: number;
  medio: { medio: string; disciplina_id: number | null } | null;
}

/** Lo necesario para registrar un cobro o una nota de crédito a una persona. */
export async function cuentaPersona(db: ClienteSocios, padron: ClientePadron, personaId: number, fecha: string): Promise<CuentaPersona | null> {
  const [personas, cuotas, aFavor, medio] = await Promise.all([
    leerPersonas(padron, [personaId]),
    cuotasConSaldo(db, [personaId]),
    db.from("cobros_saldo").select("saldo_a_favor").eq("persona_id", personaId).eq("estado", "vigente").gt("saldo_a_favor", 0),
    db
      .from("medios_cobro")
      .select("medio, disciplina_id")
      .eq("persona_id", personaId)
      .lte("desde", fecha)
      .or(`hasta.is.null,hasta.gte.${fecha}`)
      .maybeSingle(),
  ]);
  const persona = personas.get(personaId);
  if (!persona) return null;
  const lista = cuotas.get(personaId) ?? [];
  // La social se paga en la cuenta de la disciplina que la tiene a cargo (la anual, en la que la cubre hoy).
  const sociales = lista.filter((c) => c.tipo === "social").map((c) => c.id);
  const [resp, social] = sociales.length
    ? await Promise.all([
        db.from("cuotas").select("id, disciplina_responsable_id").in("id", sociales),
        db.rpc("cuota_social_de", { p_persona: personaId, p_fecha: fecha }),
      ])
    : [null, null];
  const responsable = new Map((resp?.data ?? []).map((c) => [c.id, c.disciplina_responsable_id]));
  const socialHoy = (social?.data as { disciplina_id?: number | null } | null)?.disciplina_id ?? null;
  for (const c of lista) {
    c.cuenta_disciplina = c.tipo === "disciplina" ? c.disciplina_id : c.tipo === "social" ? (responsable.get(c.id) ?? socialHoy) : null;
  }
  return {
    persona,
    cuotas: lista,
    saldoAFavor: r2((aFavor.data ?? []).reduce((s, c) => s + num(c.saldo_a_favor), 0)),
    medio: medio.data ?? null,
  };
}

// ------------------------------------------------------------
// Débito Visa
// ------------------------------------------------------------

export interface LiquidacionVisaLista {
  id: number;
  periodo: string;
  fecha: string;
  bruto: number;
  comision: number;
  /** IVA de la comisión (se carga aparte). */
  iva: number;
  /** Bruto − comisión − IVA: lo que entró al banco. */
  neto: number;
  archivo: string | null;
  estado: string;
  motivo_anulacion: string | null;
  asiento_id: string;
  cobros: number;
  rechazos: { persona: string | null; documento: string | null; importe: number; motivo: string | null }[];
  /** Gastos de cada centro: lo cobrado de sus socios y su parte de comisión e IVA (importe = comisión + IVA). */
  comisiones: { disciplina: string; cobrado: number; comision: number; iva: number; importe: number }[];
}

export async function listarLiquidacionesVisa(db: ClienteSocios, padron: ClientePadron): Promise<LiquidacionVisaLista[]> {
  const liqs = exigir(
    await db.from("liquidaciones_visa").select("*").order("periodo", { ascending: false }).order("id", { ascending: false }).limit(120)
  );
  const ids = liqs.map((l) => l.id);
  const [rechazos, comisiones, cobros, disciplinas] = await Promise.all([
    porIds(ids, (lote, a, b) =>
      db.from("liquidacion_visa_rechazos").select("*").in("liquidacion_visa_id", lote).order("id").range(a, b)
    ),
    porIds(ids, (lote, a, b) =>
      db
        .from("liquidacion_visa_comisiones")
        .select("*")
        .in("liquidacion_visa_id", lote)
        .order("liquidacion_visa_id")
        .order("disciplina_id")
        .range(a, b)
    ),
    porIds(ids, (lote, a, b) =>
      db.from("cobros").select("id, liquidacion_visa_id").in("liquidacion_visa_id", lote).order("id").range(a, b)
    ),
    leerDisciplinas(padron),
  ]);
  const personas = await leerPersonas(
    padron,
    rechazos.map((r) => r.persona_id).filter((x): x is number => x != null)
  );
  const disc = new Map(disciplinas.map((d) => [d.id, d.nombre]));
  return liqs.map((l) => ({
    id: l.id,
    periodo: l.periodo,
    fecha: l.fecha,
    bruto: num(l.bruto),
    comision: num(l.comision),
    iva: num(l.iva),
    neto: r2(num(l.bruto) - num(l.comision) - num(l.iva)),
    archivo: l.archivo,
    estado: l.estado,
    motivo_anulacion: l.motivo_anulacion,
    asiento_id: l.asiento_id,
    cobros: cobros.filter((c) => c.liquidacion_visa_id === l.id).length,
    rechazos: rechazos
      .filter((r) => r.liquidacion_visa_id === l.id)
      .map((r) => ({
        persona: r.persona_id ? nombrePersona(personas.get(r.persona_id)) : null,
        documento: r.documento,
        importe: num(r.importe),
        motivo: r.motivo,
      })),
    comisiones: comisiones
      .filter((k) => k.liquidacion_visa_id === l.id)
      .map((k) => ({
        disciplina: k.disciplina_id ? disc.get(k.disciplina_id) ?? "Disciplina" : "Club",
        cobrado: num(k.cobrado),
        comision: num(k.comision),
        iva: num(k.iva),
        importe: num(k.importe),
      }))
      .sort((a, b) => b.importe - a.importe),
  }));
}

export interface AdhesionDebito {
  persona_id: number;
  persona: string;
  cedula: string;
  numero_socio: number | null;
  ultimos4: string | null;
  vencimiento: string | null;
  emisor: string | null;
  titular_documento: string | null;
  titular_nombre: string | null;
}

/** Personas con débito Visa vigente a una fecha. */
export async function adhesionesDebito(db: ClienteSocios, padron: ClientePadron, fecha: string): Promise<AdhesionDebito[]> {
  const medios = await leerTodo((a, b) =>
    db
      .from("medios_cobro")
      .select("persona_id, tarjeta_ultimos4, tarjeta_vencimiento, tarjeta_emisor, titular_documento, titular_nombre")
      .eq("medio", "debito_visa")
      .lte("desde", fecha)
      .or(`hasta.is.null,hasta.gte.${fecha}`)
      .order("id")
      .range(a, b)
  );
  const personas = await leerPersonas(padron, medios.map((m) => m.persona_id));
  return medios
    .map((m) => {
      const p = personas.get(m.persona_id);
      return {
        persona_id: m.persona_id,
        persona: nombrePersona(p),
        cedula: p?.cedula ?? "",
        numero_socio: p?.numero_socio ?? null,
        ultimos4: m.tarjeta_ultimos4,
        vencimiento: m.tarjeta_vencimiento,
        emisor: m.tarjeta_emisor,
        titular_documento: m.titular_documento,
        titular_nombre: m.titular_nombre,
      };
    })
    .sort((a, b) => a.persona.localeCompare(b.persona, "es"));
}

export interface FilaPlanilla extends AdhesionDebito {
  importe: number;
  cuotas: number;
  /** Saldo de cuotas de meses anteriores (no entra salvo que se pida). */
  deudaAnterior: number;
  disciplinas: string[];
  tarjetaVencida: boolean;
}

/**
 * Disciplinas vigentes de cada persona a una fecha (por sus inscripciones a
 * planes de disciplina).
 */
async function disciplinasVigentes(
  db: ClienteSocios,
  padron: ClientePadron,
  personas: number[],
  fecha: string
): Promise<Map<number, string[]>> {
  const [planes, disciplinas, suscripciones] = await Promise.all([
    leerPlanes(db),
    leerDisciplinas(padron),
    porIds(personas, (lote, a, b) =>
      db
        .from("suscripciones")
        .select("id, persona_id, plan_id")
        .in("persona_id", lote)
        .lte("desde", fecha)
        .or(`hasta.is.null,hasta.gte.${fecha}`)
        .order("id")
        .range(a, b)
    ),
  ]);
  const discPlan = new Map(planes.filter((p) => p.disciplina_id).map((p) => [p.id, p.disciplina_id as number]));
  const nombre = new Map(disciplinas.map((d) => [d.id, d.nombre]));
  const out = new Map<number, string[]>();
  for (const s of suscripciones) {
    const d = discPlan.get(s.plan_id);
    if (!d) continue;
    const lista = out.get(s.persona_id) ?? [];
    const n = nombre.get(d) ?? `Disciplina ${d}`;
    if (!lista.includes(n)) lista.push(n);
    out.set(s.persona_id, lista);
  }
  return out;
}

/**
 * Planilla para cargar en el portal del débito: quienes tienen débito vigente
 * al fin del mes y lo que se le carga a cada tarjeta. Como lo hace tesorería,
 * cada mes se carga la cuota de ese mes (el saldo de las cuotas del período);
 * con `incluirDeuda` se suma también lo que quedó de meses anteriores.
 */
export async function planillaDebito(
  db: ClienteSocios,
  padron: ClientePadron,
  periodo: string,
  incluirDeuda = false
): Promise<FilaPlanilla[]> {
  const ini = inicioMes(periodo);
  const fin = finMes(periodo);
  const adhesiones = await adhesionesDebito(db, padron, fin);
  const ids = adhesiones.map((a) => a.persona_id);
  const [cuotas, disciplinas] = await Promise.all([cuotasConSaldo(db, ids), disciplinasVigentes(db, padron, ids, fin)]);
  return adhesiones.map((a) => {
    const hastaMes = (cuotas.get(a.persona_id) ?? []).filter((c) => c.periodo_desde <= fin);
    const delMes = hastaMes.filter((c) => c.periodo_desde >= ini);
    const anteriores = hastaMes.filter((c) => c.periodo_desde < ini);
    const deudaAnterior = r2(anteriores.reduce((s, c) => s + c.saldo, 0));
    const propias = incluirDeuda ? hastaMes : delMes;
    return {
      ...a,
      importe: r2(propias.reduce((s, c) => s + c.saldo, 0)),
      cuotas: propias.length,
      deudaAnterior,
      disciplinas: disciplinas.get(a.persona_id) ?? [],
      tarjetaVencida: !!a.vencimiento && finMes(a.vencimiento) < ini,
    };
  });
}

export type TipoClave = "cedula" | "ultimos4";

export interface Identificacion {
  clave: string;
  persona: Persona | null;
  via: "cedula" | "titular" | "tarjeta" | null;
  /** Varias personas con esos últimos 4 dígitos. */
  candidatos: Persona[];
}

/**
 * Identifica a las personas de una liquidación de Visa: por la cédula del
 * socio, por la del titular de la tarjeta, o por los últimos 4 dígitos entre
 * quienes tienen el débito vigente.
 */
export async function identificarDebitos(
  db: ClienteSocios,
  padron: ClientePadron,
  claves: { clave: string; tipo: TipoClave }[],
  fecha: string
): Promise<Identificacion[]> {
  const adhesiones = await adhesionesDebito(db, padron, fecha);
  const cedulas = [...new Set(claves.filter((c) => c.tipo === "cedula").map((c) => soloDigitos(c.clave)).filter(Boolean))];
  const porCedula = new Map<string, Persona>();
  for (let i = 0; i < cedulas.length; i += 200) {
    const { data, error } = await padron.from("padron_socios").select("*").in("cedula", cedulas.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const f of (data ?? []) as FilaPadron[]) porCedula.set(f.cedula, aPersona(f));
  }
  const idsAdhesion = adhesiones.map((a) => a.persona_id);
  const personasAdhesion = await leerPersonas(padron, idsAdhesion);
  const porTitular = new Map<string, number>();
  const porTarjeta = new Map<string, number[]>();
  for (const a of adhesiones) {
    const doc = soloDigitos(a.titular_documento);
    if (doc) porTitular.set(doc, a.persona_id);
    if (a.ultimos4) porTarjeta.set(a.ultimos4, [...(porTarjeta.get(a.ultimos4) ?? []), a.persona_id]);
  }
  return claves.map(({ clave, tipo }) => {
    const d = soloDigitos(clave);
    if (tipo === "cedula") {
      const p = porCedula.get(d);
      if (p) return { clave, persona: p, via: "cedula" as const, candidatos: [] };
      const t = porTitular.get(d);
      if (t && personasAdhesion.get(t)) return { clave, persona: personasAdhesion.get(t)!, via: "titular" as const, candidatos: [] };
      return { clave, persona: null, via: null, candidatos: [] };
    }
    const ids = porTarjeta.get(d.slice(-4)) ?? [];
    const candidatos = ids.map((i) => personasAdhesion.get(i)).filter((p): p is Persona => !!p);
    if (candidatos.length === 1) return { clave, persona: candidatos[0], via: "tarjeta" as const, candidatos: [] };
    return { clave, persona: null, via: null, candidatos };
  });
}

export interface SimulacionVisa {
  bruto: number;
  comision: number;
  iva: number;
  neto: number;
  personas: { persona_id: number; importe: number; aplicado: number; aFavor: number; yaDebitado: boolean }[];
  /** Gastos de cada centro (importe = comisión + IVA). */
  comisiones: {
    disciplina_id: number | null;
    nombre: string;
    porcentaje: number;
    cobrado: number;
    comision: number;
    iva: number;
    importe: number;
  }[];
}

/**
 * Lo que haría `aplicar_liquidacion_visa`: el reparto de cada débito sobre las
 * cuotas de su persona y el de los gastos (comisión e IVA) entre el club y las
 * disciplinas: a cada una, en proporción a lo cobrado de sus socios (sus
 * cuotas y las sociales a su cargo), por su porcentaje. El resto es del club.
 */
export async function simularLiquidacionVisa(
  db: ClienteSocios,
  padron: ClientePadron,
  args: { periodo: string; fecha: string; comision: number; iva: number; cobrados: { persona_id: number; importe: number }[] }
): Promise<SimulacionVisa> {
  const ids = args.cobrados.map((c) => c.persona_id);
  const [cuotas, config, disciplinas, previas] = await Promise.all([
    cuotasConSaldo(db, ids),
    db.from("disciplinas_cobranza").select("disciplina_id, porcentaje_comision"),
    leerDisciplinas(padron),
    db.from("liquidaciones_visa").select("id").eq("periodo", inicioMes(args.periodo)).eq("estado", "vigente"),
  ]);
  const liqIds = (previas.data ?? []).map((l) => l.id);
  const yaDebitados = new Set(
    (
      await porIds(liqIds, (lote, a, b) =>
        db
          .from("cobros")
          .select("id, persona_id")
          .in("liquidacion_visa_id", lote)
          .eq("estado", "vigente")
          .order("id")
          .range(a, b)
      )
    ).map((c) => c.persona_id)
  );
  const pct = new Map((config.data ?? []).map((c) => [c.disciplina_id, num(c.porcentaje_comision)]));
  const disc = new Map(disciplinas.map((d) => [d.id, d.nombre]));
  const bruto = r2(args.cobrados.reduce((s, c) => s + r2(c.importe), 0));
  const comision = r2(args.comision);
  const iva = r2(args.iva);

  const aplicaciones: { cuota: CuotaPendiente; importe: number }[] = [];
  const personas = args.cobrados.map((c) => {
    const rep = repartir(cuotas.get(c.persona_id) ?? [], c.importe, args.fecha);
    aplicaciones.push(...rep.aplicaciones);
    return { persona_id: c.persona_id, importe: r2(c.importe), aplicado: rep.aplicado, aFavor: rep.aFavor, yaDebitado: yaDebitados.has(c.persona_id) };
  });

  // La cuota social de un socio de disciplinas queda a cargo de una de ellas.
  const sociales = aplicaciones.filter((a) => a.cuota.tipo === "social").map((a) => a.cuota.id);
  const responsable = new Map<number, number>();
  for (const f of await porIds(sociales, (lote, a, b) =>
    db.from("cuotas").select("id, disciplina_responsable_id").in("id", lote).order("id").range(a, b)
  )) {
    if (f.disciplina_responsable_id) responsable.set(f.id, f.disciplina_responsable_id);
  }
  const porDisciplina = new Map<number, number>();
  for (const a of aplicaciones) {
    const d = a.cuota.disciplina_id ?? responsable.get(a.cuota.id) ?? null;
    if (d) porDisciplina.set(d, r2((porDisciplina.get(d) ?? 0) + a.importe));
  }

  const comisiones: SimulacionVisa["comisiones"] = [];
  if ((comision > 0 || iva > 0) && bruto > 0) {
    for (const [id, cobrado] of porDisciplina) {
      const porcentaje = pct.get(id) ?? 100;
      const k = r2(((comision * cobrado) / bruto) * (porcentaje / 100));
      const v = r2(((iva * cobrado) / bruto) * (porcentaje / 100));
      if (k > 0 || v > 0) {
        comisiones.push({ disciplina_id: id, nombre: disc.get(id) ?? `Disciplina ${id}`, porcentaje, cobrado, comision: k, iva: v, importe: r2(k + v) });
      }
    }
    const restoK = r2(comision - comisiones.reduce((s, x) => s + x.comision, 0));
    const restoV = r2(iva - comisiones.reduce((s, x) => s + x.iva, 0));
    if (restoK > 0 || restoV > 0) {
      const cobradoClub = r2(bruto - [...porDisciplina.values()].reduce((s, v) => s + v, 0));
      comisiones.push({ disciplina_id: null, nombre: "Club (socios sin disciplina y el resto)", porcentaje: 100, cobrado: cobradoClub, comision: restoK, iva: restoV, importe: r2(restoK + restoV) });
    }
  }
  comisiones.sort((a, b) => b.importe - a.importe);
  return { bruto, comision, iva, neto: r2(bruto - comision - iva), personas, comisiones };
}

// ------------------------------------------------------------
// Notas de crédito
// ------------------------------------------------------------

export interface CreditoLista {
  id: number;
  persona_id: number;
  persona: string;
  cedula: string;
  fecha: string;
  tipo: string;
  motivo: string;
  importe: number;
  estado: string;
  motivo_anulacion: string | null;
  asiento_id: string;
  cuotas: { concepto: string; importe: number }[];
}

export async function listarCreditos(db: ClienteSocios, padron: ClientePadron): Promise<CreditoLista[]> {
  const creditos = await leerTodo((a, b) =>
    db.from("creditos").select("*").order("fecha", { ascending: false }).order("id", { ascending: false }).range(a, b)
  );
  const ids = creditos.map((c) => c.id);
  const aplic = await porIds(ids, (lote, a, b) =>
    db
      .from("credito_aplicaciones")
      .select("credito_id, cuota_id, importe")
      .in("credito_id", lote)
      .order("credito_id")
      .order("cuota_id")
      .range(a, b)
  );
  const [personas, cuotas] = await Promise.all([
    leerPersonas(padron, creditos.map((c) => c.persona_id)),
    porIds(
      aplic.map((a) => a.cuota_id),
      (lote, a, b) => db.from("cuotas").select("id, concepto").in("id", lote).order("id").range(a, b)
    ),
  ]);
  const concepto = new Map(cuotas.map((c) => [c.id, c.concepto]));
  return creditos.map((c) => {
    const p = personas.get(c.persona_id);
    return {
      id: c.id,
      persona_id: c.persona_id,
      persona: nombrePersona(p),
      cedula: p?.cedula ?? "",
      fecha: c.fecha,
      tipo: c.tipo,
      motivo: c.motivo,
      importe: num(c.importe),
      estado: c.estado,
      motivo_anulacion: c.motivo_anulacion,
      asiento_id: c.asiento_id,
      cuotas: aplic
        .filter((a) => a.credito_id === c.id)
        .map((a) => ({ concepto: concepto.get(a.cuota_id) ?? `Cuota ${a.cuota_id}`, importe: num(a.importe) })),
    };
  });
}

// ------------------------------------------------------------
// Disciplinas
// ------------------------------------------------------------

export interface DisciplinaCobranza {
  id: number;
  nombre: string;
  porcentaje: number;
  datos_transferencia: string | null;
  configurada: boolean;
  /** Deuda de la disciplina con el club (saldo de 1.1.04.03 con su auxiliar). null si no se pudo leer. */
  deuda: number | null;
  /** Último mes liquidado (liquidación vigente), "YYYY-MM-01". */
  ultimoPeriodo: string | null;
}

export async function cobranzaDisciplinas(
  db: ClienteSocios,
  padron: ClientePadron,
  conta: ClienteContable | null
): Promise<DisciplinaCobranza[]> {
  const [disciplinas, config, liqs] = await Promise.all([
    leerDisciplinas(padron),
    db.from("disciplinas_cobranza").select("*"),
    db.from("liquidaciones_disciplina").select("disciplina_id, periodo").eq("estado", "vigente"),
  ]);
  // Lo que cada disciplina le debe al club: la misma regla que la base
  // (saldos_disciplinas, solo tesorería y Comisión Fiscal).
  let deudas: Map<number, number> | null = null;
  if (conta) {
    const { data: saldos, error: errorSaldos } = await db.rpc("saldos_disciplinas");
    if (!errorSaldos) {
      deudas = new Map((saldos ?? []).map((f) => [f.disciplina_id, r2(num(f.debe_al_club))]));
    }
  }
  const cfg = new Map((config.data ?? []).map((c) => [c.disciplina_id, c]));
  const ultima = new Map<number, string>();
  for (const l of liqs.data ?? []) {
    if (!ultima.has(l.disciplina_id) || ultima.get(l.disciplina_id)! < l.periodo) ultima.set(l.disciplina_id, l.periodo);
  }
  return disciplinas
    .filter((d) => d.activa || cfg.has(d.id))
    .map((d) => {
      const c = cfg.get(d.id);
      return {
        id: d.id,
        nombre: d.nombre,
        porcentaje: c ? num(c.porcentaje_comision) : 100,
        datos_transferencia: c?.datos_transferencia ?? null,
        configurada: !!c,
        deuda: deudas ? deudas.get(d.id) ?? 0 : null,
        ultimoPeriodo: ultima.get(d.id) ?? null,
      };
    });
}

export interface PagoLiquidacion {
  id: number;
  fecha: string;
  transferido: number;
  cuenta_id: string | null;
  compensado: number;
  referencia: string | null;
  notas: string | null;
  estado: string;
  motivo_anulacion: string | null;
  asiento_id: string;
}

export interface LiquidacionDisciplinaLista {
  id: number;
  disciplina_id: number;
  disciplina: string;
  /** Mes del débito liquidado ("YYYY-MM-01"). */
  periodo: string;
  desde: string;
  hasta: string;
  fecha: string;
  /** Cuotas de la disciplina cobradas (débito y otros medios). */
  cobrado: number;
  /** Gastos del débito (comisión + IVA). */
  comision: number;
  /** Cobrado por débito Visa a sus socios (la cuota entera, con la social). */
  visa_cobrado: number;
  /** Cuota social cobrada en el débito (queda para el club). */
  visa_social: number;
  /** Cuota social que no se cobró y pone la disciplina. */
  social_a_cargo: number;
  /** Cuotas de la disciplina cobradas por otros medios. */
  otros_cobrado: number;
  gastos_comision: number;
  gastos_iva: number;
  socios: number;
  cuota_social: number;
  /** A pagar a la disciplina: deuda del club con ella (2.1.07.02). 0 si da a depositar. */
  importe: number;
  /** Lo que la disciplina tiene que depositar (queda en su cuenta corriente). */
  a_depositar: number;
  /** Pagado hasta hoy (pagos vigentes). */
  transferido: number;
  compensado: number;
  /** Pendiente de pago (0 si está anulada). */
  saldo: number;
  notas: string | null;
  estado: string;
  motivo_anulacion: string | null;
  asiento_id: string;
  pagos: PagoLiquidacion[];
}

/**
 * Liquidaciones a disciplinas con lo pagado y el saldo pendiente
 * (`liquidaciones_disciplina_saldo`) y sus pagos (`pagos_liquidacion`).
 */
export async function listarLiquidacionesDisciplina(
  db: ClienteSocios,
  padron: ClientePadron,
  disciplina?: number
): Promise<LiquidacionDisciplinaLista[]> {
  const [liqs, disciplinas] = await Promise.all([
    leerTodo((a, b) => {
      let q = db.from("liquidaciones_disciplina_saldo").select("*");
      if (disciplina) q = q.eq("disciplina_id", disciplina);
      return q.order("periodo", { ascending: false }).order("id", { ascending: false }).range(a, b);
    }),
    leerDisciplinas(padron),
  ]);
  const pagos = await porIds(
    liqs.map((l) => l.id as number),
    (lote, a, b) => db.from("pagos_liquidacion").select("*").in("liquidacion_id", lote).order("id").range(a, b)
  );
  const pagosPor = new Map<number, PagoLiquidacion[]>();
  for (const p of pagos.sort((x, y) => y.fecha.localeCompare(x.fecha) || y.id - x.id)) {
    const l = pagosPor.get(p.liquidacion_id) ?? [];
    l.push({
      id: p.id,
      fecha: p.fecha,
      transferido: num(p.transferido),
      cuenta_id: p.cuenta_id,
      compensado: num(p.compensado),
      referencia: p.referencia,
      notas: p.notas,
      estado: p.estado,
      motivo_anulacion: p.motivo_anulacion,
      asiento_id: p.asiento_id,
    });
    pagosPor.set(p.liquidacion_id, l);
  }
  const disc = new Map(disciplinas.map((d) => [d.id, d.nombre]));
  return liqs.map((l) => ({
    id: l.id as number,
    disciplina_id: l.disciplina_id as number,
    disciplina: disc.get(l.disciplina_id as number) ?? `Disciplina ${l.disciplina_id}`,
    periodo: l.periodo ?? inicioMes(l.hasta ?? l.fecha ?? ""),
    desde: l.desde ?? "",
    hasta: l.hasta ?? "",
    fecha: l.fecha ?? "",
    cobrado: num(l.cobrado),
    comision: num(l.comision),
    visa_cobrado: num(l.visa_cobrado),
    visa_social: num(l.visa_social),
    social_a_cargo: num(l.social_a_cargo),
    otros_cobrado: num(l.otros_cobrado),
    gastos_comision: num(l.gastos_comision),
    gastos_iva: num(l.gastos_iva),
    socios: num(l.socios),
    cuota_social: num(l.cuota_social),
    importe: num(l.importe),
    a_depositar: num(l.a_depositar),
    transferido: num(l.transferido),
    compensado: num(l.compensado),
    saldo: r2(num(l.saldo)),
    notas: l.notas,
    estado: l.estado ?? "vigente",
    motivo_anulacion: l.motivo_anulacion,
    asiento_id: l.asiento_id ?? "",
    pagos: pagosPor.get(l.id as number) ?? [],
  }));
}

/** Lo que daría la liquidación de un mes a una disciplina (previsualizar_liquidaciones_mes). */
export interface FilaLiquidacionMes {
  disciplina_id: number;
  disciplina: string;
  periodo: string;
  /** Ya se cargó la liquidación del débito Visa de ese mes. */
  visa_cargada: boolean;
  socios: number;
  cuota_social: number;
  visa_cobrado: number;
  visa_social: number;
  otros_cobrado: number;
  gastos_comision: number;
  gastos_iva: number;
  social_a_cargo: number;
  cobrado: number;
  comision: number;
  resultado: number;
  a_pagar: number;
  a_depositar: number;
  /** Lo que la disciplina le debe al club (referencia para compensar). */
  deuda: number;
  yaLiquidado: boolean;
  liquidacion_id: number | null;
}

/** Previsualización de la liquidación mensual de todas las disciplinas. */
export async function previsualizarLiquidacionesMes(db: ClienteSocios, periodo: string): Promise<FilaLiquidacionMes[]> {
  const filas = exigir(await db.rpc("previsualizar_liquidaciones_mes", { p_periodo: inicioMes(periodo) })) ?? [];
  return filas
    .map((f) => ({
      disciplina_id: f.disciplina_id,
      disciplina: f.disciplina,
      periodo: f.periodo,
      visa_cargada: !!f.visa_cargada,
      socios: num(f.socios_mes),
      cuota_social: num(f.cuota_social),
      visa_cobrado: num(f.visa_cobrado),
      visa_social: num(f.visa_social),
      otros_cobrado: num(f.otros_cobrado),
      gastos_comision: num(f.gastos_comision),
      gastos_iva: num(f.gastos_iva),
      social_a_cargo: num(f.social_a_cargo),
      cobrado: num(f.cobrado),
      comision: num(f.comision),
      resultado: num(f.resultado),
      a_pagar: num(f.a_pagar),
      a_depositar: num(f.a_depositar),
      deuda: num(f.deuda_disciplina),
      yaLiquidado: !!f.ya_liquidado,
      liquidacion_id: f.liquidacion_id ?? null,
    }))
    .sort((a, b) => a.disciplina.localeCompare(b.disciplina, "es"));
}

// ------------------------------------------------------------
// Morosidad
// ------------------------------------------------------------

export interface FilaMorosidad extends FilaSituacion {
  persona: string;
  cedula: string;
  numero_socio: number | null;
  disciplinas: number[];
  medioDisciplina: number | null;
}

/** Situación de cada persona con su nombre, disciplinas vigentes y medio de cobro. */
export async function morosidad(db: ClienteSocios, padron: ClientePadron, fecha: string): Promise<FilaMorosidad[]> {
  const [situacion, planes, suscripciones, medios] = await Promise.all([
    leerSituacion(db, fecha),
    leerPlanes(db),
    leerTodo((a, b) =>
      db
        .from("suscripciones")
        .select("persona_id, plan_id")
        .lte("desde", fecha)
        .or(`hasta.is.null,hasta.gte.${fecha}`)
        .order("id")
        .range(a, b)
    ),
    leerTodo((a, b) =>
      db
        .from("medios_cobro")
        .select("persona_id, disciplina_id")
        .eq("medio", "transferencia_disciplina")
        .lte("desde", fecha)
        .or(`hasta.is.null,hasta.gte.${fecha}`)
        .order("id")
        .range(a, b)
    ),
  ]);
  const personas = await leerPersonas(padron, situacion.map((s) => s.persona_id));
  const discPlan = new Map(planes.filter((p) => p.disciplina_id).map((p) => [p.id, p.disciplina_id as number]));
  const disc = new Map<number, Set<number>>();
  for (const s of suscripciones) {
    const d = discPlan.get(s.plan_id);
    if (!d) continue;
    disc.set(s.persona_id, (disc.get(s.persona_id) ?? new Set()).add(d));
  }
  const medioDisc = new Map(medios.map((m) => [m.persona_id, m.disciplina_id]));
  return situacion.map((s) => {
    const p = personas.get(s.persona_id);
    return {
      ...s,
      persona: nombrePersona(p),
      cedula: p?.cedula ?? "",
      numero_socio: p?.numero_socio ?? null,
      disciplinas: [...(disc.get(s.persona_id) ?? [])],
      medioDisciplina: medioDisc.get(s.persona_id) ?? null,
    };
  });
}
