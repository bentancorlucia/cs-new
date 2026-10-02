import { createContabilidadClient, type ContabilidadClient } from "@/lib/contabilidad/server";
import { createServerClient } from "@/lib/supabase/server";
import { hoyUruguay, type EstadoAsiento, type TipoAsiento } from "@/lib/contabilidad/formato";
import { Constants } from "@/types/contabilidad";

/*
 * Consultas compartidas del libro diario y la carga de asientos.
 * Solo se importa desde Server Components / Server Actions; los
 * componentes cliente importan únicamente los tipos (`import type`).
 */

export const POR_PAGINA = 50;
/** Tamaño de página para recorrer rangos grandes (PostgREST corta en 1000 filas). */
const LOTE = 500;

const TIPOS = Constants.contabilidad.Enums.tipo_asiento;
const ESTADOS = Constants.contabilidad.Enums.estado_asiento;

// ------------------------------------------------------------
// Tipos
// ------------------------------------------------------------

export type FiltrosLibro = {
  desde: string;
  hasta: string;
  estado: EstadoAsiento | null;
  tipo: TipoAsiento | null;
  q: string;
  pagina: number;
};

export type LineaLibro = {
  id: number;
  orden: number;
  debe: number;
  haber: number;
  moneda: string | null;
  importe_origen: number | null;
  tc: number | null;
  descripcion: string | null;
  cuenta_codigo: string;
  cuenta_nombre: string;
};

export type AsientoLibro = {
  id: string;
  numero: number | null;
  fecha: string;
  descripcion: string;
  tipo: TipoAsiento;
  estado: EstadoAsiento;
  revertido_por_id: string | null;
  asiento_revertido_id: string | null;
  total: number;
  lineas: LineaLibro[];
};

export type CuentaOpcion = {
  id: string;
  codigo: string;
  nombre: string;
  moneda: string | null;
  requiere_auxiliar: "proveedor" | "disciplina" | null;
  requiere_centro_costo: boolean;
};

export type OpcionSimple = { id: number; nombre: string };
export type CentroOpcion = { id: string; codigo: string; nombre: string };

export type CatalogosAsiento = {
  cuentas: CuentaOpcion[];
  centros: CentroOpcion[];
  proveedores: OpcionSimple[];
  disciplinas: OpcionSimple[];
};

/** Línea tal como la usa el formulario al editar un borrador. */
export type LineaInicial = {
  cuenta_id: string;
  lado: "debe" | "haber";
  /** En la moneda de la cuenta. */
  importe: number;
  tc: number | null;
  descripcion: string | null;
  centro_costo_id: string | null;
  proveedor_id: number | null;
  disciplina_id: number | null;
};

export type AsientoInicial = {
  id: string;
  fecha: string;
  descripcion: string;
  lineas: LineaInicial[];
};

export type EstadoApertura = {
  ejercicio: { id: string; nombre: string; fecha_inicio: string; estado: string };
  /** Asiento de apertura vigente (borrador o confirmado), si existe. */
  apertura: { id: string; estado: EstadoAsiento } | null;
};

// ------------------------------------------------------------
// Fechas y filtros
// ------------------------------------------------------------

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function esFechaIso(v: unknown): v is string {
  if (typeof v !== "string" || !RE_FECHA.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Primer y último día del mes de una fecha ISO. */
export function rangoMes(iso: string): { desde: string; hasta: string } {
  const [y, m] = iso.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { desde: `${y}-${mm}-01`, hasta: `${y}-${mm}-${String(ultimo).padStart(2, "0")}` };
}

function primero(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function leerFiltros(sp: Record<string, string | string[] | undefined>): FiltrosLibro {
  const mes = rangoMes(hoyUruguay());
  let desde = primero(sp.desde);
  let hasta = primero(sp.hasta);
  if (!esFechaIso(desde)) desde = mes.desde;
  if (!esFechaIso(hasta)) hasta = mes.hasta;
  if (desde > hasta) [desde, hasta] = [hasta, desde];

  const estado = primero(sp.estado);
  const tipo = primero(sp.tipo);
  const pagina = Math.max(1, Math.floor(Number(primero(sp.pagina)) || 1));

  return {
    desde,
    hasta,
    estado: (ESTADOS as readonly string[]).includes(estado ?? "") ? (estado as EstadoAsiento) : null,
    tipo: (TIPOS as readonly string[]).includes(tipo ?? "") ? (tipo as TipoAsiento) : null,
    q: (primero(sp.q) ?? "").trim().slice(0, 100),
    pagina,
  };
}

/** Patrón ILIKE con los comodines del usuario escapados. */
function patron(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// ------------------------------------------------------------
// Libro diario
// ------------------------------------------------------------

const SELECT_LIBRO =
  "id, numero, fecha, descripcion, tipo, estado, revertido_por_id, asiento_revertido_id, created_at, lineas(id, orden, debe, haber, moneda, importe_origen, tc, descripcion, cuentas(codigo, nombre))";

function consultaLibro(supabase: ContabilidadClient, f: FiltrosLibro, contar = false) {
  let q = supabase
    .from("asientos")
    .select(SELECT_LIBRO, contar ? { count: "exact" } : undefined)
    .gte("fecha", f.desde)
    .lte("fecha", f.hasta);
  if (f.estado) q = q.eq("estado", f.estado);
  if (f.tipo) q = q.eq("tipo", f.tipo);
  if (f.q) q = q.ilike("descripcion", patron(f.q));
  return q
    .order("fecha", { ascending: true })
    .order("numero", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .order("orden", { referencedTable: "lineas", ascending: true });
}

type FilaLibro = {
  id: string;
  numero: number | null;
  fecha: string;
  descripcion: string;
  tipo: TipoAsiento;
  estado: EstadoAsiento;
  revertido_por_id: string | null;
  asiento_revertido_id: string | null;
  lineas: {
    id: number;
    orden: number;
    debe: number;
    haber: number;
    moneda: string | null;
    importe_origen: number | null;
    tc: number | null;
    descripcion: string | null;
    cuentas: { codigo: string; nombre: string } | null;
  }[];
};

function mapearAsiento(a: FilaLibro): AsientoLibro {
  const lineas = (a.lineas ?? []).map((l) => ({
    id: l.id,
    orden: l.orden,
    debe: Number(l.debe),
    haber: Number(l.haber),
    moneda: l.moneda?.trim() || null,
    importe_origen: l.importe_origen === null ? null : Number(l.importe_origen),
    tc: l.tc === null ? null : Number(l.tc),
    descripcion: l.descripcion,
    cuenta_codigo: l.cuentas?.codigo ?? "",
    cuenta_nombre: l.cuentas?.nombre ?? "Cuenta desconocida",
  }));
  return {
    id: a.id,
    numero: a.numero,
    fecha: a.fecha,
    descripcion: a.descripcion,
    tipo: a.tipo,
    estado: a.estado,
    revertido_por_id: a.revertido_por_id,
    asiento_revertido_id: a.asiento_revertido_id,
    total: lineas.reduce((s, l) => s + l.debe, 0),
    lineas,
  };
}

export async function listarLibroDiario(f: FiltrosLibro): Promise<{
  asientos: AsientoLibro[];
  total: number;
  error: string | null;
}> {
  const supabase = await createContabilidadClient();
  const desde = (f.pagina - 1) * POR_PAGINA;
  const { data, count, error } = await consultaLibro(supabase, f, true).range(desde, desde + POR_PAGINA - 1);
  if (error) return { asientos: [], total: 0, error: error.message };
  return {
    asientos: ((data ?? []) as unknown as FilaLibro[]).map(mapearAsiento),
    total: count ?? 0,
    error: null,
  };
}

/** Todos los asientos del rango filtrado (para totales y exportación). */
export async function todosLosAsientos(f: FiltrosLibro): Promise<AsientoLibro[]> {
  const supabase = await createContabilidadClient();
  const salida: AsientoLibro[] = [];
  for (let desde = 0; ; desde += LOTE) {
    const { data, error } = await consultaLibro(supabase, f).range(desde, desde + LOTE - 1);
    if (error) throw new Error(error.message);
    const filas = (data ?? []) as unknown as FilaLibro[];
    salida.push(...filas.map(mapearAsiento));
    if (filas.length < LOTE) break;
  }
  return salida;
}

export async function totalesLibro(f: FiltrosLibro): Promise<{ debe: number; haber: number; borradores: number }> {
  const asientos = await todosLosAsientos(f);
  let debe = 0;
  let haber = 0;
  let borradores = 0;
  for (const a of asientos) {
    if (a.estado === "borrador") borradores++;
    for (const l of a.lineas) {
      debe += l.debe;
      haber += l.haber;
    }
  }
  return { debe: Math.round(debe * 100) / 100, haber: Math.round(haber * 100) / 100, borradores };
}

// ------------------------------------------------------------
// Apertura del primer ejercicio
// ------------------------------------------------------------

/**
 * El primer ejercicio (sin ejercicio anterior) y su asiento de apertura
 * vigente. Los siguientes ejercicios reciben la apertura del cierre.
 */
export async function estadoAperturaInicial(): Promise<EstadoApertura | null> {
  const supabase = await createContabilidadClient();
  const { data: ejercicio } = await supabase
    .from("ejercicios")
    .select("id, nombre, fecha_inicio, estado")
    .order("fecha_inicio", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!ejercicio) return null;

  const { data: apertura } = await supabase
    .from("asientos")
    .select("id, estado")
    .eq("ejercicio_id", ejercicio.id)
    .eq("tipo", "apertura")
    .is("revertido_por_id", null)
    .limit(1)
    .maybeSingle();

  return { ejercicio, apertura: apertura ?? null };
}

// ------------------------------------------------------------
// Catálogos del formulario
// ------------------------------------------------------------

/**
 * Cuentas imputables activas, centros de costo activos, proveedores y
 * disciplinas. `incluir` agrega los que ya usa un borrador aunque hoy
 * estén inactivos, para que la edición no los pierda.
 */
export async function cargarCatalogosAsiento(incluir?: {
  cuentas?: string[];
  centros?: string[];
  proveedores?: number[];
  disciplinas?: number[];
}): Promise<CatalogosAsiento> {
  const conta = await createContabilidadClient();
  const pub = await createServerClient();

  const [cuentas, centros, proveedores, disciplinas] = await Promise.all([
    conta
      .from("cuentas")
      .select("id, codigo, nombre, moneda, requiere_auxiliar, requiere_centro_costo")
      .eq("imputable", true)
      .eq("activa", true)
      .order("codigo"),
    conta.from("centros_costo").select("id, codigo, nombre").eq("activo", true).order("codigo"),
    pub.from("proveedores").select("id, nombre").not("activo", "is", false).order("nombre"),
    pub.from("disciplinas").select("id, nombre").not("activa", "is", false).order("nombre"),
  ]);

  const resultado: CatalogosAsiento = {
    cuentas: (cuentas.data ?? []).map((c) => ({ ...c, moneda: c.moneda?.trim() || null })),
    centros: centros.data ?? [],
    proveedores: proveedores.data ?? [],
    disciplinas: disciplinas.data ?? [],
  };

  const faltan = <T,>(ids: T[] | undefined, lista: { id: T }[]) =>
    [...new Set(ids ?? [])].filter((id) => !lista.some((x) => x.id === id));

  const fc = faltan(incluir?.cuentas, resultado.cuentas);
  const fcc = faltan(incluir?.centros, resultado.centros);
  const fp = faltan(incluir?.proveedores, resultado.proveedores);
  const fd = faltan(incluir?.disciplinas, resultado.disciplinas);

  const [xc, xcc, xp, xd] = await Promise.all([
    fc.length
      ? conta
          .from("cuentas")
          .select("id, codigo, nombre, moneda, requiere_auxiliar, requiere_centro_costo")
          .in("id", fc)
      : null,
    fcc.length ? conta.from("centros_costo").select("id, codigo, nombre").in("id", fcc) : null,
    fp.length ? pub.from("proveedores").select("id, nombre").in("id", fp) : null,
    fd.length ? pub.from("disciplinas").select("id, nombre").in("id", fd) : null,
  ]);

  if (xc?.data) {
    resultado.cuentas = [
      ...resultado.cuentas,
      ...xc.data.map((c) => ({ ...c, moneda: c.moneda?.trim() || null })),
    ].sort((a, b) => a.codigo.localeCompare(b.codigo));
  }
  if (xcc?.data) resultado.centros = [...resultado.centros, ...xcc.data];
  if (xp?.data) resultado.proveedores = [...resultado.proveedores, ...xp.data];
  if (xd?.data) resultado.disciplinas = [...resultado.disciplinas, ...xd.data];

  return resultado;
}

/** TC vigente (día hábil anterior) o null si no hay cotización cargada. */
export async function tcVigente(fecha: string, moneda = "USD"): Promise<number | null> {
  const supabase = await createContabilidadClient();
  const { data, error } = await supabase.rpc("tc_vigente", { p_moneda: moneda, p_fecha: fecha });
  if (error || data === null || data === undefined) return null;
  const n = Number(data);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ------------------------------------------------------------
// Detalle
// ------------------------------------------------------------

export type LineaDetalle = {
  id: number;
  orden: number;
  debe: number;
  haber: number;
  moneda: string | null;
  importe_origen: number | null;
  tc: number | null;
  descripcion: string | null;
  cuenta_id: string;
  cuenta_codigo: string;
  cuenta_nombre: string;
  centro_costo_id: string | null;
  centro: string | null;
  proveedor_id: number | null;
  proveedor: string | null;
  disciplina_id: number | null;
  disciplina: string | null;
};

export type EventoAuditoria = {
  id: number;
  accion: string;
  etiqueta: string;
  usuario: string | null;
  proceso: string | null;
  at: string;
};

export type AsientoDetalle = {
  id: string;
  numero: number | null;
  fecha: string;
  descripcion: string;
  tipo: TipoAsiento;
  estado: EstadoAsiento;
  origen_tipo: string | null;
  origen_id: string | null;
  motivo: string | null;
  creado_por: string | null;
  created_at: string;
  confirmado_por: string | null;
  confirmado_at: string | null;
  revertido_por: { id: string; numero: number | null; fecha: string } | null;
  asiento_revertido: { id: string; numero: number | null; fecha: string } | null;
  ejercicio: string | null;
  lineas: LineaDetalle[];
  auditoria: EventoAuditoria[];
};

function etiquetaAuditoria(accion: string, antes: unknown, despues: unknown): string {
  const a = (antes ?? {}) as Record<string, unknown>;
  const d = (despues ?? {}) as Record<string, unknown>;
  if (accion === "INSERT") return "Creado";
  if (accion === "DELETE") return "Eliminado";
  if (a.estado === "borrador" && d.estado === "confirmado") return "Confirmado";
  if (!a.revertido_por_id && d.revertido_por_id) return "Revertido";
  return "Modificado";
}

function nombrePerfil(p: { nombre: string } | undefined, id: string | null): string | null {
  if (!id) return null;
  if (p?.nombre) return p.nombre;
  return `Usuario ${id.slice(0, 8)}`;
}

export async function obtenerAsientoDetalle(id: string): Promise<AsientoDetalle | null> {
  const conta = await createContabilidadClient();
  const { data: a } = await conta
    .from("asientos")
    .select(
      "*, ejercicios(nombre), lineas(*, cuentas(codigo, nombre), centros_costo(codigo, nombre))"
    )
    .eq("id", id)
    .order("orden", { referencedTable: "lineas", ascending: true })
    .maybeSingle();
  if (!a) return null;

  const relacionados = [a.revertido_por_id, a.asiento_revertido_id].filter((x): x is string => !!x);
  const pub = await createServerClient();

  const proveedorIds = [...new Set(a.lineas.map((l) => l.proveedor_id).filter((x): x is number => x !== null))];
  const disciplinaIds = [...new Set(a.lineas.map((l) => l.disciplina_id).filter((x): x is number => x !== null))];

  const [rel, aud, prov, disc] = await Promise.all([
    relacionados.length
      ? conta.from("asientos").select("id, numero, fecha").in("id", relacionados)
      : null,
    conta
      .from("auditoria")
      .select("id, accion, antes, despues, usuario_id, proceso, at")
      .eq("tabla", "asientos")
      .eq("registro_id", id)
      .order("at", { ascending: true })
      .order("id", { ascending: true }),
    proveedorIds.length ? pub.from("proveedores").select("id, nombre").in("id", proveedorIds) : null,
    disciplinaIds.length ? pub.from("disciplinas").select("id, nombre").in("id", disciplinaIds) : null,
  ]);

  const usuarioIds = [
    ...new Set(
      [a.creado_por, a.confirmado_por, ...(aud.data ?? []).map((e) => e.usuario_id)].filter(
        (x): x is string => !!x
      )
    ),
  ];
  // Nombres por RPC: public.perfiles no es legible para tesorero ni comision_fiscal.
  const { data: perfiles } = usuarioIds.length
    ? await conta.rpc("nombres_usuarios", { p_ids: usuarioIds })
    : { data: [] as { id: string; nombre: string }[] };
  const perfilPorId = new Map((perfiles ?? []).map((p) => [p.id, p]));
  const provPorId = new Map((prov?.data ?? []).map((p) => [p.id, p.nombre]));
  const discPorId = new Map((disc?.data ?? []).map((d) => [d.id, d.nombre]));
  const relPorId = new Map((rel?.data ?? []).map((r) => [r.id, r]));

  return {
    id: a.id,
    numero: a.numero,
    fecha: a.fecha,
    descripcion: a.descripcion,
    tipo: a.tipo,
    estado: a.estado,
    origen_tipo: a.origen_tipo,
    origen_id: a.origen_id,
    motivo: a.motivo,
    creado_por: nombrePerfil(a.creado_por ? perfilPorId.get(a.creado_por) : undefined, a.creado_por),
    created_at: a.created_at,
    confirmado_por: nombrePerfil(
      a.confirmado_por ? perfilPorId.get(a.confirmado_por) : undefined,
      a.confirmado_por
    ),
    confirmado_at: a.confirmado_at,
    revertido_por: a.revertido_por_id ? relPorId.get(a.revertido_por_id) ?? null : null,
    asiento_revertido: a.asiento_revertido_id ? relPorId.get(a.asiento_revertido_id) ?? null : null,
    ejercicio: a.ejercicios?.nombre ?? null,
    lineas: a.lineas.map((l) => ({
      id: l.id,
      orden: l.orden,
      debe: Number(l.debe),
      haber: Number(l.haber),
      moneda: l.moneda?.trim() || null,
      importe_origen: l.importe_origen === null ? null : Number(l.importe_origen),
      tc: l.tc === null ? null : Number(l.tc),
      descripcion: l.descripcion,
      cuenta_id: l.cuenta_id,
      cuenta_codigo: l.cuentas?.codigo ?? "",
      cuenta_nombre: l.cuentas?.nombre ?? "Cuenta desconocida",
      centro_costo_id: l.centro_costo_id,
      centro: l.centros_costo ? `${l.centros_costo.codigo} · ${l.centros_costo.nombre}` : null,
      proveedor_id: l.proveedor_id,
      proveedor: l.proveedor_id !== null ? provPorId.get(l.proveedor_id) ?? `Proveedor #${l.proveedor_id}` : null,
      disciplina_id: l.disciplina_id,
      disciplina:
        l.disciplina_id !== null ? discPorId.get(l.disciplina_id) ?? `Disciplina #${l.disciplina_id}` : null,
    })),
    auditoria: (aud.data ?? []).map((e) => ({
      id: e.id,
      accion: e.accion,
      etiqueta: etiquetaAuditoria(e.accion, e.antes, e.despues),
      usuario: e.usuario_id
        ? nombrePerfil(perfilPorId.get(e.usuario_id), e.usuario_id)
        : null,
      proceso: e.proceso,
      at: e.at,
    })),
  };
}

/** Pasa las líneas guardadas al formato del formulario (importe en moneda de la cuenta). */
export function lineasParaFormulario(lineas: LineaDetalle[]): LineaInicial[] {
  return lineas.map((l) => {
    const lado = l.debe > 0 ? "debe" : "haber";
    const funcional = l.debe > 0 ? l.debe : l.haber;
    return {
      cuenta_id: l.cuenta_id,
      lado,
      importe: l.moneda ? l.importe_origen ?? 0 : funcional,
      tc: l.moneda ? l.tc : null,
      descripcion: l.descripcion,
      centro_costo_id: l.centro_costo_id,
      proveedor_id: l.proveedor_id,
      disciplina_id: l.disciplina_id,
    };
  });
}
