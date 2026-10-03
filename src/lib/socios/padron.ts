import { createServerClient } from "@/lib/supabase/server";
import { createSociosClient } from "@/lib/socios/server";
import { hoyUruguay } from "@/lib/contabilidad/formato";

/**
 * Lecturas del padrón de socios para las pantallas de secretaría.
 * La persona es `public.padron_socios`; ser socio, las inscripciones, el
 * medio de cobro y la deuda salen del schema `socios` (ver docs/socios.md).
 * Nada de acá escribe: las escrituras van por las Server Actions.
 */

const PAGINA = 1000;

type Respuesta<T> = { data: T[] | null; error: { message: string } | null };

/** Trae todas las filas de a 1000 (límite de PostgREST). */
async function todas<T>(pedir: (desde: number, hasta: number) => PromiseLike<Respuesta<T>>): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await pedir(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    filas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return filas;
  }
}

/** Primer y último día del mes de una fecha "AAAA-MM-DD". */
export function mesDe(fecha: string): { ini: string; fin: string } {
  const [y, m] = fecha.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { ini: `${y}-${mm}-01`, fin: `${y}-${mm}-${String(ultimo).padStart(2, "0")}` };
}

const vigenteEn = (desde: string, hasta: string | null, dia: string) => desde <= dia && (hasta === null || hasta >= dia);

// ------------------------------------------------------------
// Tipos
// ------------------------------------------------------------

/** Columnas de padron_socios (database.ts todavía no tiene numero_socio, email y direccion). */
export interface PersonaPadron {
  id: number;
  numero_socio: number | null;
  nombre: string;
  apellido: string;
  cedula: string;
  fecha_nacimiento: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  notas: string | null;
  perfil_id: string | null;
  vinculado_at: string | null;
  activo: boolean;
  created_at: string | null;
}

export interface Plan {
  id: number;
  nombre: string;
  tipo: "social" | "disciplina";
  disciplina_id: number | null;
  permite_anual: boolean;
  activo: boolean;
}

export interface Precio {
  id: number;
  plan_id: number;
  vigente_desde: string;
  importe_mensual: number;
  importe_anual: number | null;
}

export interface PlanConPrecio extends Plan {
  disciplina: string | null;
  precio: Precio | null;
  proximo: Precio | null;
}

export interface Disciplina {
  id: number;
  nombre: string;
}

export type EstadoSocio = "vigente" | "programado" | "baja" | "sin_alta";

export interface FilaPadron {
  id: number;
  numero: number | null;
  nombre: string;
  apellido: string;
  cedula: string;
  email: string | null;
  telefono: string | null;
  vinculado: boolean;
  estado: EstadoSocio;
  /** Alta de la membresía vigente (o la última). */
  alta: string | null;
  /** Baja de la última membresía, si terminó. */
  baja: string | null;
  disciplinas: { id: number; nombre: string; plan: string }[];
  medio: string | null;
  medioDisciplina: string | null;
  cuotasVencidas: number;
  deudaVencida: number;
  deudaTotal: number;
  saldoAFavor: number;
  alDia: boolean | null;
}

export interface Kpis {
  vigentes: number;
  altasMes: number;
  bajasMes: number;
  conDeuda: number;
  morosos: number;
  deudaVencida: number;
}

// ------------------------------------------------------------
// Catálogos
// ------------------------------------------------------------

export async function listarDisciplinas(): Promise<Disciplina[]> {
  const db = await createServerClient();
  const { data, error } = await db.from("disciplinas").select("id, nombre").eq("activa", true).order("nombre");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Planes con el precio vigente en `dia` y el próximo cargado (si hay). */
export async function listarPlanes(dia = hoyUruguay()): Promise<{ planes: PlanConPrecio[]; precios: Precio[] }> {
  const so = await createSociosClient();
  const [planesRes, preciosRes, disciplinas] = await Promise.all([
    so.from("planes").select("id, nombre, tipo, disciplina_id, permite_anual, activo").order("nombre"),
    so.from("plan_precios").select("id, plan_id, vigente_desde, importe_mensual, importe_anual").order("vigente_desde"),
    listarDisciplinasTodas(),
  ]);
  if (planesRes.error) throw new Error(planesRes.error.message);
  if (preciosRes.error) throw new Error(preciosRes.error.message);
  const nombreDisc = new Map(disciplinas.map((d) => [d.id, d.nombre]));
  const precios = (preciosRes.data ?? []).map((p) => ({
    ...p,
    importe_mensual: Number(p.importe_mensual),
    importe_anual: p.importe_anual === null ? null : Number(p.importe_anual),
  }));
  const planes = (planesRes.data ?? []).map((p) => {
    const propios = precios.filter((x) => x.plan_id === p.id);
    const vigentes = propios.filter((x) => x.vigente_desde <= dia);
    return {
      ...(p as Plan),
      disciplina: p.disciplina_id ? (nombreDisc.get(p.disciplina_id) ?? null) : null,
      precio: vigentes.at(-1) ?? null,
      proximo: propios.find((x) => x.vigente_desde > dia) ?? null,
    };
  });
  planes.sort(
    (a, b) =>
      (a.tipo === b.tipo ? 0 : a.tipo === "social" ? -1 : 1) ||
      (a.disciplina ?? "").localeCompare(b.disciplina ?? "", "es") ||
      a.nombre.localeCompare(b.nombre, "es")
  );
  return { planes, precios };
}

async function listarDisciplinasTodas(): Promise<Disciplina[]> {
  const db = await createServerClient();
  const { data, error } = await db.from("disciplinas").select("id, nombre").order("nombre");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listarMotivosBaja(): Promise<{ id: number; nombre: string }[]> {
  const so = await createSociosClient();
  const { data, error } = await so.from("motivos_baja").select("id, nombre").eq("activo", true).order("id");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function leerConfig() {
  const so = await createSociosClient();
  const { data, error } = await so.from("config").select("*").maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// ------------------------------------------------------------
// Padrón completo (lista y resumen)
// ------------------------------------------------------------

export async function cargarPadron(): Promise<{
  filas: FilaPadron[];
  kpis: Kpis;
  disciplinas: Disciplina[];
  porDisciplina: { disciplina: string; socios: number }[];
  hoy: string;
}> {
  const hoy = hoyUruguay();
  const { ini, fin } = mesDe(hoy);
  const db = await createServerClient();
  const so = await createSociosClient();

  const [personas, membresias, suscripciones, medios, situacion, planes, disciplinas] = await Promise.all([
    todas<PersonaPadron>((a, b) =>
      db
        .from("padron_socios")
        .select("id, numero_socio, nombre, apellido, cedula, email, telefono, perfil_id, activo")
        .order("id")
        .range(a, b) as unknown as PromiseLike<Respuesta<PersonaPadron>>
    ),
    todas((a, b) => so.from("membresias").select("persona_id, desde, hasta").order("id").range(a, b)),
    todas((a, b) =>
      so
        .from("suscripciones")
        .select("persona_id, plan_id")
        .lte("desde", hoy)
        .or(`hasta.is.null,hasta.gte.${hoy}`)
        .order("id")
        .range(a, b)
    ),
    todas((a, b) =>
      so
        .from("medios_cobro")
        .select("persona_id, medio, disciplina_id")
        .lte("desde", hoy)
        .or(`hasta.is.null,hasta.gte.${hoy}`)
        .order("id")
        .range(a, b)
    ),
    todas((a, b) => so.rpc("situacion", {}).order("persona_id").range(a, b)),
    so.from("planes").select("id, nombre, tipo, disciplina_id"),
    listarDisciplinasTodas(),
  ]);
  if (planes.error) throw new Error(planes.error.message);

  const planPorId = new Map((planes.data ?? []).map((p) => [p.id, p]));
  const discPorId = new Map(disciplinas.map((d) => [d.id, d.nombre]));

  const membPorPersona = new Map<number, { desde: string; hasta: string | null }[]>();
  for (const m of membresias) {
    const l = membPorPersona.get(m.persona_id) ?? [];
    l.push(m);
    membPorPersona.set(m.persona_id, l);
  }
  const discPorPersona = new Map<number, FilaPadron["disciplinas"]>();
  for (const s of suscripciones) {
    const p = planPorId.get(s.plan_id);
    if (!p || p.tipo !== "disciplina" || !p.disciplina_id) continue;
    const l = discPorPersona.get(s.persona_id) ?? [];
    l.push({ id: p.disciplina_id, nombre: discPorId.get(p.disciplina_id) ?? "—", plan: p.nombre });
    discPorPersona.set(s.persona_id, l);
  }
  const medioPorPersona = new Map(medios.map((m) => [m.persona_id, m]));
  const sitPorPersona = new Map(situacion.map((s) => [s.persona_id, s]));

  let altasMes = 0;
  let bajasMes = 0;
  for (const m of membresias) {
    if (m.desde >= ini && m.desde <= fin) altasMes++;
    if (m.hasta && m.hasta >= ini && m.hasta <= fin) bajasMes++;
  }

  const filas: FilaPadron[] = personas.map((p) => {
    const ms = (membPorPersona.get(p.id) ?? []).sort((a, b) => a.desde.localeCompare(b.desde));
    const vigente = ms.find((m) => vigenteEn(m.desde, m.hasta, hoy));
    const ultima = ms.at(-1);
    const estado: EstadoSocio = vigente
      ? "vigente"
      : ultima && ultima.desde > hoy
        ? "programado"
        : ultima
          ? "baja"
          : "sin_alta";
    const medio = medioPorPersona.get(p.id);
    const sit = sitPorPersona.get(p.id);
    return {
      id: p.id,
      numero: p.numero_socio,
      nombre: p.nombre,
      apellido: p.apellido,
      cedula: p.cedula,
      email: p.email,
      telefono: p.telefono,
      vinculado: !!p.perfil_id,
      estado,
      alta: (vigente ?? ultima)?.desde ?? null,
      baja: vigente ? null : (ultima?.hasta ?? null),
      disciplinas: (discPorPersona.get(p.id) ?? []).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
      medio: medio?.medio ?? null,
      medioDisciplina: medio?.disciplina_id ? (discPorId.get(medio.disciplina_id) ?? null) : null,
      cuotasVencidas: sit?.cuotas_vencidas ?? 0,
      deudaVencida: Number(sit?.deuda_vencida ?? 0),
      deudaTotal: Number(sit?.deuda_total ?? 0),
      saldoAFavor: Number(sit?.saldo_a_favor ?? 0),
      alDia: sit ? sit.al_dia : null,
    };
  });

  const vigentes = filas.filter((f) => f.estado === "vigente");
  const conteo = new Map<string, number>();
  for (const f of vigentes) {
    for (const d of new Set(f.disciplinas.map((x) => x.nombre))) conteo.set(d, (conteo.get(d) ?? 0) + 1);
  }

  return {
    filas,
    hoy,
    disciplinas,
    porDisciplina: [...conteo.entries()]
      .map(([disciplina, socios]) => ({ disciplina, socios }))
      .sort((a, b) => b.socios - a.socios),
    kpis: {
      vigentes: vigentes.length,
      altasMes,
      bajasMes,
      conDeuda: vigentes.filter((f) => f.deudaVencida > 0).length,
      morosos: vigentes.filter((f) => f.alDia === false).length,
      deudaVencida: vigentes.reduce((s, f) => s + f.deudaVencida, 0),
    },
  };
}

// ------------------------------------------------------------
// Ficha
// ------------------------------------------------------------

export interface Membresia {
  id: number;
  desde: string;
  hasta: string | null;
  motivo: string | null;
  notas: string | null;
}

export interface Inscripcion {
  id: number;
  plan_id: number;
  plan: string;
  tipo: "social" | "disciplina";
  disciplina: string | null;
  periodicidad: string;
  desde: string;
  hasta: string | null;
  motivo_fin: string | null;
  vigente: boolean;
  /** Empieza después de hoy. */
  futura: boolean;
}

export interface MedioRegistrado {
  id: number;
  medio: string;
  disciplina: string | null;
  disciplina_id: number | null;
  tarjeta_ultimos4: string | null;
  tarjeta_vencimiento: string | null;
  titular_documento: string | null;
  titular_nombre: string | null;
  desde: string;
  hasta: string | null;
}

export interface MovimientoCuenta {
  fecha: string;
  tipo: string;
  documento_id: number;
  concepto: string;
  cargo: number;
  abono: number;
  saldo: number;
}

export interface CuotaPendiente {
  id: number;
  concepto: string;
  fecha_vencimiento: string;
  importe: number;
  saldo: number;
  vencida: boolean;
}

export interface Situacion {
  cuotas_vencidas: number;
  deuda_vencida: number;
  deuda_total: number;
  saldo_a_favor: number;
  al_dia: boolean;
}

export interface Ficha {
  persona: PersonaPadron;
  perfil: { nombre: string; apellido: string; avatar_url: string | null } | null;
  estado: EstadoSocio;
  membresias: Membresia[];
  inscripciones: Inscripcion[];
  medios: MedioRegistrado[];
  movimientos: MovimientoCuenta[];
  pendientes: CuotaPendiente[];
  situacion: Situacion | null;
  hoy: string;
}

export async function cargarFicha(id: number): Promise<Ficha | null> {
  const hoy = hoyUruguay();
  const db = await createServerClient();
  const so = await createSociosClient();

  const { data: personaData, error: errorPersona } = await db
    .from("padron_socios")
    .select(
      "id, numero_socio, nombre, apellido, cedula, fecha_nacimiento, telefono, email, direccion, notas, perfil_id, vinculado_at, activo, created_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (errorPersona) throw new Error(errorPersona.message);
  if (!personaData) return null;
  const persona = personaData as unknown as PersonaPadron;

  const [membRes, motivosRes, suscRes, mediosRes, planesRes, disciplinas, cuentaRes, pendRes, sitRes, perfilRes] =
    await Promise.all([
      so.from("membresias").select("id, desde, hasta, motivo_baja_id, notas_baja").eq("persona_id", id).order("desde", { ascending: false }),
      so.from("motivos_baja").select("id, nombre"),
      so
        .from("suscripciones")
        .select("id, plan_id, periodicidad, desde, hasta, motivo_fin")
        .eq("persona_id", id)
        .order("desde", { ascending: false })
        .order("id", { ascending: false }),
      so
        .from("medios_cobro")
        .select("id, medio, disciplina_id, tarjeta_ultimos4, tarjeta_vencimiento, titular_documento, titular_nombre, desde, hasta")
        .eq("persona_id", id)
        .order("desde", { ascending: false }),
      so.from("planes").select("id, nombre, tipo, disciplina_id"),
      listarDisciplinasTodas(),
      so.rpc("estado_cuenta", { p_persona: id }),
      so
        .from("cuotas_saldo")
        .select("id, concepto, fecha_vencimiento, importe, saldo")
        .eq("persona_id", id)
        .eq("estado", "emitida")
        .gt("saldo", 0)
        .order("fecha_vencimiento"),
      so.rpc("situacion", {}).eq("persona_id", id).maybeSingle(),
      persona.perfil_id
        ? db.from("perfiles").select("nombre, apellido, avatar_url").eq("id", persona.perfil_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
  for (const r of [membRes, motivosRes, suscRes, mediosRes, planesRes, cuentaRes, pendRes, sitRes]) {
    if (r.error) throw new Error(r.error.message);
  }

  const motivo = new Map((motivosRes.data ?? []).map((m) => [m.id, m.nombre]));
  const planPorId = new Map((planesRes.data ?? []).map((p) => [p.id, p]));
  const discPorId = new Map(disciplinas.map((d) => [d.id, d.nombre]));

  const membresias: Membresia[] = (membRes.data ?? []).map((m) => ({
    id: m.id,
    desde: m.desde,
    hasta: m.hasta,
    motivo: m.motivo_baja_id ? (motivo.get(m.motivo_baja_id) ?? null) : null,
    notas: m.notas_baja,
  }));
  const vigente = membresias.find((m) => vigenteEn(m.desde, m.hasta, hoy));
  const ultima = membresias[0];
  const estado: EstadoSocio = vigente
    ? "vigente"
    : ultima && ultima.desde > hoy
      ? "programado"
      : ultima
        ? "baja"
        : "sin_alta";

  return {
    persona,
    perfil: perfilRes.data ?? null,
    estado,
    membresias,
    inscripciones: (suscRes.data ?? []).map((s) => {
      const p = planPorId.get(s.plan_id);
      return {
        id: s.id,
        plan_id: s.plan_id,
        plan: p?.nombre ?? `Plan ${s.plan_id}`,
        tipo: (p?.tipo ?? "social") as "social" | "disciplina",
        disciplina: p?.disciplina_id ? (discPorId.get(p.disciplina_id) ?? null) : null,
        periodicidad: s.periodicidad,
        desde: s.desde,
        hasta: s.hasta,
        motivo_fin: s.motivo_fin,
        vigente: vigenteEn(s.desde, s.hasta, hoy),
        futura: s.desde > hoy,
      };
    }),
    medios: (mediosRes.data ?? []).map((m) => ({
      ...m,
      disciplina: m.disciplina_id ? (discPorId.get(m.disciplina_id) ?? null) : null,
    })),
    movimientos: (cuentaRes.data ?? []).map((m) => ({
      ...m,
      cargo: Number(m.cargo),
      abono: Number(m.abono),
      saldo: Number(m.saldo),
    })),
    pendientes: (pendRes.data ?? []).map((c) => ({
      id: c.id as number,
      concepto: c.concepto as string,
      fecha_vencimiento: c.fecha_vencimiento as string,
      importe: Number(c.importe),
      saldo: Number(c.saldo),
      vencida: (c.fecha_vencimiento as string) < hoy,
    })),
    situacion: sitRes.data
      ? {
          cuotas_vencidas: sitRes.data.cuotas_vencidas,
          deuda_vencida: Number(sitRes.data.deuda_vencida),
          deuda_total: Number(sitRes.data.deuda_total),
          saldo_a_favor: Number(sitRes.data.saldo_a_favor),
          al_dia: sitRes.data.al_dia,
        }
      : null,
    hoy,
  };
}

// ------------------------------------------------------------
// Planes (pantalla de planes y precios)
// ------------------------------------------------------------

export interface PlanDetalle extends PlanConPrecio {
  precios: (Precio & { usado: boolean })[];
  inscriptos: number;
}

export async function cargarPlanes(): Promise<{ planes: PlanDetalle[]; disciplinas: Disciplina[]; hoy: string }> {
  const hoy = hoyUruguay();
  const so = await createSociosClient();
  const [{ planes, precios }, disciplinas, vigentes] = await Promise.all([
    listarPlanes(hoy),
    listarDisciplinas(),
    todas((a, b) =>
      so
        .from("suscripciones")
        .select("plan_id")
        .lte("desde", hoy)
        .or(`hasta.is.null,hasta.gte.${hoy}`)
        .order("id")
        .range(a, b)
    ),
  ]);
  // Precios ya usados en cuotas (la base no deja modificarlos).
  const usados = new Set<number>();
  await Promise.all(
    precios.map(async (p) => {
      const { data, error } = await so.from("cuotas").select("id").eq("precio_id", p.id).limit(1);
      if (error) throw new Error(error.message);
      if (data?.length) usados.add(p.id);
    })
  );
  const inscriptos = new Map<number, number>();
  for (const s of vigentes) inscriptos.set(s.plan_id, (inscriptos.get(s.plan_id) ?? 0) + 1);
  return {
    hoy,
    disciplinas,
    planes: planes.map((p) => ({
      ...p,
      precios: precios
        .filter((x) => x.plan_id === p.id)
        .map((x) => ({ ...x, usado: usados.has(x.id) }))
        .reverse(),
      inscriptos: inscriptos.get(p.id) ?? 0,
    })),
  };
}
