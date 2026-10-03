"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { createSociosClient, exigirPermisoSocios, permisosSocios } from "@/lib/socios/server";
import { mensajeError } from "@/lib/contabilidad/formato";
import {
  altaSchema,
  bajaSchema,
  cambiarMedioSchema,
  cambiarPlanSchema,
  cedulaSchema,
  finalizarSchema,
  inscribirSchema,
  personaSchema,
  type AltaInput,
  type Persona,
  type PersonaInput,
} from "@/lib/socios/esquemas";
import type { EstadoSocio, PersonaPadron } from "@/lib/socios/padron";
import type { Json } from "@/types/socios";

export type Resultado<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function fallo(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Error inesperado" };
}

function invalido(issues: { message: string }[]): { ok: false; error: string } {
  return { ok: false, error: issues[0]?.message ?? "Datos inválidos" };
}

/** Mensaje de la base, con las violaciones de unicidad del padrón en castellano. */
function errorBase(error: { message?: string; code?: string }, numeroAutomatico = false): string {
  if (error.code === "23505" && error.message?.includes("numero_socio")) {
    return numeroAutomatico
      ? "El número de socio automático ya lo tiene otra persona (la numeración no está al día con los números cargados a mano): ingresá el número de socio"
      : "Ese número de socio ya lo tiene otra persona del padrón";
  }
  if (error.code === "23505" && error.message?.includes("cedula")) {
    return "Ya hay una persona con esa cédula en el padrón";
  }
  return mensajeError(error);
}

function revalidar(personaId?: number) {
  revalidatePath("/secretaria", "layout");
  if (personaId) revalidatePath(`/secretaria/socios/${personaId}`);
}

const COLUMNAS_PERSONA =
  "id, numero_socio, nombre, apellido, cedula, fecha_nacimiento, telefono, email, direccion, notas, perfil_id, vinculado_at, activo, created_at";

// ------------------------------------------------------------
// Búsqueda por cédula (alta / reingreso)
// ------------------------------------------------------------

export async function buscarPorCedula(
  cedula: string
): Promise<Resultado<{ persona: PersonaPadron | null; estado: EstadoSocio; alta: string | null }>> {
  try {
    const { puedeGestionar } = await permisosSocios();
    if (!puedeGestionar) return { ok: false, error: "No autorizado" };
    const c = cedulaSchema.safeParse(cedula);
    if (!c.success) return invalido(c.error.issues);
    const db = await createServerClient();
    const { data, error } = await db.from("padron_socios").select(COLUMNAS_PERSONA).eq("cedula", c.data).maybeSingle();
    if (error) return { ok: false, error: mensajeError(error) };
    if (!data) return { ok: true, data: { persona: null, estado: "sin_alta", alta: null } };
    const persona = data as unknown as PersonaPadron;
    const so = await createSociosClient();
    const { data: ms, error: e2 } = await so
      .from("membresias")
      .select("desde, hasta")
      .eq("persona_id", persona.id)
      .order("desde", { ascending: false })
      .limit(1);
    if (e2) return { ok: false, error: mensajeError(e2) };
    const ultima = ms?.[0];
    const estado: EstadoSocio = !ultima ? "sin_alta" : ultima.hasta === null ? "vigente" : "baja";
    return { ok: true, data: { persona, estado, alta: ultima?.desde ?? null } };
  } catch (e) {
    return fallo(e);
  }
}

// ------------------------------------------------------------
// Alta (y reingreso)
// ------------------------------------------------------------

/** Datos de padron_socios que la secretaría edita (nunca `activo`: lo deriva la membresía). */
function datosPadron(p: Persona, soloCompletar: boolean, actual?: PersonaPadron) {
  const campos = {
    nombre: p.nombre,
    apellido: p.apellido,
    fecha_nacimiento: p.fecha_nacimiento,
    telefono: p.telefono,
    email: p.email,
    direccion: p.direccion,
    numero_socio: p.numero_socio,
    notas: p.notas,
  };
  if (!soloCompletar) return campos;
  // Importación: completa lo que falta, no pisa lo que ya estaba cargado.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(campos)) {
    if (v === null || v === undefined) continue;
    const previo = actual ? (actual as unknown as Record<string, unknown>)[k] : null;
    if (k === "nombre" || k === "apellido" || previo === null || previo === undefined || previo === "") out[k] = v;
  }
  return out;
}

async function alta(input: AltaInput, soloCompletar: boolean): Promise<Resultado<{ id: number; reingreso: boolean }>> {
  await exigirPermisoSocios("puedeGestionar");
  const p = altaSchema.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  const d = p.data;
  const db = await createServerClient();
  const so = await createSociosClient();

  const { data: existente, error: e0 } = await db
    .from("padron_socios")
    .select(COLUMNAS_PERSONA)
    .eq("cedula", d.persona.cedula)
    .maybeSingle();
  if (e0) return { ok: false, error: mensajeError(e0) };
  const actual = (existente ?? undefined) as unknown as PersonaPadron | undefined;

  const { data: id, error } = await so.rpc("alta_socio", {
    p_persona: {
      cedula: d.persona.cedula,
      nombre: d.persona.nombre,
      apellido: d.persona.apellido,
      fecha_nacimiento: d.persona.fecha_nacimiento,
      telefono: d.persona.telefono,
      email: d.persona.email,
      direccion: d.persona.direccion,
      // En un reingreso la función conserva el número que ya tenía.
      numero_socio: d.persona.numero_socio === null ? "" : String(d.persona.numero_socio),
    } as Json,
    p_desde: d.desde,
    p_planes: d.planes as unknown as Json,
    // Sin medio: se omite (un null de JSON llegaría como 'null'::jsonb, no como NULL).
    p_medio: d.medio ? (d.medio as unknown as Json) : undefined,
  });
  if (error) return { ok: false, error: errorBase(error, d.persona.numero_socio === null) };

  // La función crea la persona con todos sus datos, pero en un reingreso
  // no los toca: se actualizan acá (y las notas, que la función no recibe).
  const cambios = actual ? datosPadron(d.persona, soloCompletar, actual) : d.persona.notas ? { notas: d.persona.notas } : {};
  if (Object.keys(cambios).length > 0) {
    const { error: e2 } = await db
      .from("padron_socios")
      .update(cambios as never)
      .eq("id", id);
    if (e2) {
      revalidar(id);
      return { ok: false, error: `El alta quedó registrada, pero no se pudieron actualizar los datos: ${errorBase(e2)}` };
    }
  }
  revalidar(id);
  return { ok: true, data: { id, reingreso: !!actual } };
}

export async function darDeAlta(input: AltaInput): Promise<Resultado<{ id: number; reingreso: boolean }>> {
  try {
    return await alta(input, false);
  } catch (e) {
    return fallo(e);
  }
}

/** Una fila del Excel de migración del padrón (completa datos, no pisa). */
export async function importarFila(input: AltaInput): Promise<Resultado<{ id: number; reingreso: boolean }>> {
  try {
    return await alta(input, true);
  } catch (e) {
    return fallo(e);
  }
}

// ------------------------------------------------------------
// Datos personales
// ------------------------------------------------------------

export async function editarPersona(id: number, input: PersonaInput): Promise<Resultado> {
  try {
    await exigirPermisoSocios("puedeGestionar");
    if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Persona inválida" };
    const p = personaSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const db = await createServerClient();
    const { data, error } = await db
      .from("padron_socios")
      .update(datosPadron(p.data, false) as never)
      .eq("id", id)
      .select("id");
    if (error) return { ok: false, error: errorBase(error) };
    if (!data?.length) return { ok: false, error: "No se encontró la persona (o no tenés permiso para editarla)" };
    revalidar(id);
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}

// ------------------------------------------------------------
// Inscripciones
// ------------------------------------------------------------

export async function inscribir(input: unknown): Promise<Resultado<number>> {
  try {
    await exigirPermisoSocios("puedeGestionar");
    const p = inscribirSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const so = await createSociosClient();
    const { data, error } = await so.rpc("inscribir", {
      p_persona: p.data.persona_id,
      p_plan: p.data.plan_id,
      p_desde: p.data.desde,
      p_periodicidad: p.data.periodicidad,
    });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar(p.data.persona_id);
    return { ok: true, data };
  } catch (e) {
    return fallo(e);
  }
}

export async function cambiarPlan(personaId: number, input: unknown): Promise<Resultado<number>> {
  try {
    await exigirPermisoSocios("puedeGestionar");
    const p = cambiarPlanSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const so = await createSociosClient();
    const { data, error } = await so.rpc("cambiar_plan", {
      p_suscripcion: p.data.suscripcion_id,
      p_plan_nuevo: p.data.plan_id,
      p_desde: p.data.desde,
      p_periodicidad: p.data.periodicidad,
    });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar(personaId);
    return { ok: true, data };
  } catch (e) {
    return fallo(e);
  }
}

export async function finalizarInscripcion(personaId: number, input: unknown): Promise<Resultado> {
  try {
    await exigirPermisoSocios("puedeGestionar");
    const p = finalizarSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const so = await createSociosClient();
    const { error } = await so.rpc("finalizar_inscripcion", {
      p_suscripcion: p.data.suscripcion_id,
      p_hasta: p.data.hasta,
      p_motivo: p.data.motivo ?? undefined,
    });
    if (error) {
      // El trigger arma un daterange con las fechas: si están al revés falla antes del CHECK.
      if (error.code === "23514" || error.message?.includes("range lower bound")) {
        return { ok: false, error: "La fecha de fin no puede ser anterior al inicio de la inscripción" };
      }
      return { ok: false, error: mensajeError(error) };
    }
    revalidar(personaId);
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}

// ------------------------------------------------------------
// Medio de cobro
// ------------------------------------------------------------

export async function cambiarMedio(input: unknown): Promise<Resultado<number>> {
  try {
    await exigirPermisoSocios("puedeGestionar");
    const p = cambiarMedioSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const so = await createSociosClient();
    const { data, error } = await so.rpc("cambiar_medio_cobro", {
      p_persona: p.data.persona_id,
      p_medio: p.data.medio as unknown as Json,
      p_desde: p.data.desde,
    });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar(p.data.persona_id);
    return { ok: true, data };
  } catch (e) {
    return fallo(e);
  }
}

// ------------------------------------------------------------
// Baja
// ------------------------------------------------------------

export async function darBaja(input: unknown): Promise<Resultado> {
  try {
    await exigirPermisoSocios("puedeGestionar");
    const p = bajaSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const so = await createSociosClient();
    const { error } = await so.rpc("dar_baja", {
      p_persona: p.data.persona_id,
      p_hasta: p.data.hasta,
      p_motivo: p.data.motivo_id,
      p_notas: p.data.notas ?? undefined,
      p_anular_deuda: p.data.anular_deuda,
    });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar(p.data.persona_id);
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}

export async function anularBaja(personaId: number): Promise<Resultado> {
  try {
    await exigirPermisoSocios("puedeGestionar");
    if (!Number.isInteger(personaId) || personaId <= 0) return { ok: false, error: "Persona inválida" };
    const so = await createSociosClient();
    const { error } = await so.rpc("anular_baja", { p_persona: personaId });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar(personaId);
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}
