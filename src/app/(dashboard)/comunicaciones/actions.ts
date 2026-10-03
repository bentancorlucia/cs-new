"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  createComunicacionesClient,
  exigirGestionComunicaciones,
  permisosComunicaciones,
  type ComunicacionesClient,
} from "@/lib/comunicaciones/server";
import { renderPlantilla, type Variables } from "@/lib/comunicaciones/render";
import { procesarCola } from "@/lib/comunicaciones/worker";
import { smtpConfigurado } from "@/lib/comunicaciones/smtp";
import { correrAutomatizacion, planCorrida } from "@/lib/comunicaciones/automatizaciones";
import { audienciaCompleta, contarBajas, supresionesVigentes, type Destinatario } from "@/lib/comunicaciones/consultas";
import {
  URL_BAJA_EJEMPLO,
  aprobarSchema,
  audienciaSchema,
  automatizacionSchema,
  configSchema,
  crearEnvioSchema,
  parsearListaEmails,
  plantillaSchema,
  supresionSchema,
  whatsappSchema,
  type Audiencia,
  type AutomatizacionInput,
  type ConfigInput,
  type Contenido,
  type PlantillaInput,
  type SupresionInput,
  type WhatsAppInput,
} from "@/lib/comunicaciones/esquemas";
import { hoyUruguay, mensajeError } from "@/lib/contabilidad/formato";
import type { Json } from "@/types/comunicaciones";

export type Resultado<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function fallo(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Error inesperado" };
}

function invalido(issues: { message: string }[]): { ok: false; error: string } {
  return { ok: false, error: issues[0]?.message ?? "Datos inválidos" };
}

function errorBase(error: { message?: string; code?: string }) {
  if (error.code === "23505" && error.message?.includes("clave")) return "Ya hay una plantilla con esa clave";
  if (error.code === "23503") return "Está en uso (por ejemplo, en una automatización): no se puede borrar";
  return mensajeError(error);
}

function revalidar() {
  revalidatePath("/comunicaciones", "layout");
}

async function usuario() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

const esUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

// ------------------------------------------------------------
// Audiencia
// ------------------------------------------------------------

/** Quita las claves vacías (la base interpreta "presente" como filtro). */
function limpiarFiltro(filtro: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(filtro).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0))
  );
}

async function destinatariosDe(db: ComunicacionesClient, audiencia: Audiencia) {
  const a = audienciaSchema.parse(audiencia);
  if (a.tipo === "socios") {
    const filtro = limpiarFiltro(a.filtro);
    return { filtro, destinatarios: await audienciaCompleta(db, filtro), invalidos: [] as string[], repetidos: 0 };
  }
  const { validos, invalidos, repetidos } = parsearListaEmails(a.texto);
  if (validos.length > 5000) throw new Error("Máximo 5.000 direcciones por envío pegado");
  // Si la dirección es de alguien del padrón, se completan sus datos.
  const padron = validos.length ? await audienciaCompleta(db, { vigentes: false }) : [];
  const porEmail = new Map(padron.map((p) => [p.email, p]));
  const destinatarios: Destinatario[] = validos.map((v) => {
    const p = porEmail.get(v.email);
    if (p) return p;
    const nombre = v.nombre ?? null;
    return {
      persona_id: null,
      perfil_id: null,
      email: v.email,
      nombre,
      variables: nombre ? { nombre: nombre.split(" ")[0] } : {},
    };
  });
  return { filtro: null, destinatarios, invalidos, repetidos };
}

export type PrevisualizacionAudiencia = {
  total: number;
  socios: number;
  bajaDifusion: number;
  bajaTotal: number;
  invalidos: string[];
  cantidadInvalidos: number;
  repetidos: number;
  muestra: Destinatario[];
};

export async function previsualizarAudiencia(audiencia: Audiencia): Promise<Resultado<PrevisualizacionAudiencia>> {
  try {
    await exigirGestionComunicaciones();
    const parsed = audienciaSchema.safeParse(audiencia);
    if (!parsed.success) return invalido(parsed.error.issues);
    const db = await createComunicacionesClient();
    const [{ destinatarios, invalidos, repetidos }, supresiones] = await Promise.all([
      destinatariosDe(db, parsed.data),
      supresionesVigentes(db),
    ]);
    const bajas = contarBajas(
      destinatarios.map((d) => d.email),
      supresiones
    );
    return {
      ok: true,
      data: {
        total: destinatarios.length,
        socios: destinatarios.filter((d) => d.persona_id !== null).length,
        bajaDifusion: bajas.difusion,
        bajaTotal: bajas.total,
        invalidos: invalidos.slice(0, 20),
        cantidadInvalidos: invalidos.length,
        repetidos,
        muestra: destinatarios.slice(0, 25),
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

// ------------------------------------------------------------
// Envíos
// ------------------------------------------------------------

export async function crearEnvio(input: { audiencia: Audiencia; contenido: Contenido }): Promise<Resultado<string>> {
  try {
    await exigirGestionComunicaciones();
    const parsed = crearEnvioSchema.safeParse(input);
    if (!parsed.success) return invalido(parsed.error.issues);
    const { audiencia, contenido } = parsed.data;
    const db = await createComunicacionesClient();
    const { filtro, destinatarios } = await destinatariosDe(db, audiencia);
    if (destinatarios.length === 0) return { ok: false, error: "La audiencia no tiene destinatarios con correo" };

    const { data, error } = await db.rpc("crear_envio", {
      p_nombre: contenido.nombre || contenido.asunto,
      p_categoria: contenido.categoria,
      p_asunto: contenido.asunto,
      p_cuerpo: contenido.cuerpo,
      p_destinatarios: destinatarios.map((d) => ({
        email: d.email,
        nombre: d.nombre,
        persona_id: d.persona_id,
        perfil_id: d.perfil_id,
        variables: d.variables,
      })) as Json,
      p_plantilla: (contenido.plantilla_id ?? null) as string,
      p_audiencia: (audiencia.tipo === "socios"
        ? { tipo: "socios", filtro }
        : { tipo: "lista", cantidad: destinatarios.length }) as Json,
    });
    if (error) return { ok: false, error: errorBase(error) };
    revalidar();
    return { ok: true, data: data as string };
  } catch (e) {
    return fallo(e);
  }
}

export async function aprobarEnvio(input: { id: string; programado_para?: string | null }): Promise<Resultado> {
  try {
    await exigirGestionComunicaciones();
    const parsed = aprobarSchema.safeParse(input);
    if (!parsed.success) return invalido(parsed.error.issues);
    const { id, programado_para } = parsed.data;
    if (programado_para && new Date(programado_para).getTime() < Date.now() - 60_000) {
      return { ok: false, error: "La fecha programada ya pasó" };
    }
    const db = await createComunicacionesClient();
    const { error } = await db.rpc("aprobar_envio", {
      p_envio: id,
      p_programado_para: (programado_para ?? null) as string,
    });
    if (error) return { ok: false, error: errorBase(error) };
    // Sin esperar al cron (que en las ramas de prueba no corre).
    if (!programado_para && smtpConfigurado()) {
      after(() => procesarCola({ presupuestoMs: 50_000 }).catch((e) => console.error("[comunicaciones] cola:", e)));
    }
    revalidar();
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}

/** Manda ya lo que esté listo en la cola (respetando el tope por hora). */
export async function procesarColaAhora(): Promise<
  Resultado<{ enviados: number; fallidos: number; reintentos: number; omitidos: number }>
> {
  try {
    await exigirGestionComunicaciones();
    if (!smtpConfigurado()) return { ok: false, error: "El servidor de correo no está configurado" };
    const r = await procesarCola({ presupuestoMs: 50_000 });
    revalidar();
    return { ok: true, data: { enviados: r.enviados, fallidos: r.fallidos, reintentos: r.reintentos, omitidos: r.omitidos } };
  } catch (e) {
    return fallo(e);
  }
}

export async function cancelarEnvio(id: string): Promise<Resultado<number>> {
  try {
    await exigirGestionComunicaciones();
    if (!esUuid(id)) return { ok: false, error: "Envío inválido" };
    const db = await createComunicacionesClient();
    const { data, error } = await db.rpc("cancelar_envio", { p_envio: id });
    if (error) return { ok: false, error: errorBase(error) };
    revalidar();
    return { ok: true, data: data ?? 0 };
  } catch (e) {
    return fallo(e);
  }
}

export async function reintentarFallidos(id: string): Promise<Resultado<number>> {
  try {
    await exigirGestionComunicaciones();
    if (!esUuid(id)) return { ok: false, error: "Envío inválido" };
    const db = await createComunicacionesClient();
    const { data, error } = await db.rpc("reintentar_fallidos", { p_envio: id });
    if (error) return { ok: false, error: errorBase(error) };
    revalidar();
    return { ok: true, data: data ?? 0 };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * Manda el envío a la propia casilla del usuario, como un envío aparte de
 * un destinatario (aprobado al momento), con los datos del primer
 * destinatario para ver las variables reales.
 */
export async function enviarPrueba(
  id: string
): Promise<Resultado<{ id: string; email: string; estado: string; error: string | null }>> {
  try {
    await exigirGestionComunicaciones();
    if (!esUuid(id)) return { ok: false, error: "Envío inválido" };
    const user = await usuario();
    if (!user?.email) return { ok: false, error: "Tu usuario no tiene correo" };
    const db = await createComunicacionesClient();
    const [{ data: envio, error: e1 }, { data: muestra }] = await Promise.all([
      db.from("envios").select("id, nombre, categoria, asunto, cuerpo, plantilla_id").eq("id", id).maybeSingle(),
      db.from("mensajes").select("nombre, variables").eq("envio_id", id).is("html", null).order("created_at").limit(1),
    ]);
    if (e1) return { ok: false, error: errorBase(e1) };
    if (!envio) return { ok: false, error: "El envío no existe" };
    if (!envio.cuerpo) return { ok: false, error: "Este envío tiene el mail ya armado: no admite prueba" };
    const m = muestra?.[0];
    const { data: nuevo, error } = await db.rpc("crear_envio", {
      p_nombre: (envio.nombre.startsWith("Prueba —") ? envio.nombre : `Prueba — ${envio.nombre}`).slice(0, 200),
      p_categoria: envio.categoria,
      p_asunto: envio.asunto.startsWith("[Prueba]") ? envio.asunto : `[Prueba] ${envio.asunto}`,
      p_cuerpo: envio.cuerpo,
      p_destinatarios: [
        { email: user.email, nombre: m?.nombre ?? null, variables: m?.variables ?? {} },
      ] as Json,
      p_plantilla: (envio.plantilla_id ?? null) as string,
      p_audiencia: { tipo: "prueba", envio: id } as Json,
    });
    if (error || !nuevo) return { ok: false, error: errorBase(error ?? {}) };
    const { error: e2 } = await db.rpc("aprobar_envio", { p_envio: nuevo as string });
    if (e2) return { ok: false, error: errorBase(e2) };
    // La prueba sale en el momento: así se ve enseguida si el SMTP anda.
    if (smtpConfigurado()) await procesarCola({ presupuestoMs: 25_000 });
    const { data: msj } = await db
      .from("mensajes")
      .select("estado, error, motivo_omision")
      .eq("envio_id", nuevo as string)
      .maybeSingle();
    revalidar();
    return {
      ok: true,
      data: {
        id: nuevo as string,
        email: user.email,
        estado: msj?.estado ?? "pendiente",
        error: msj?.error ?? msj?.motivo_omision ?? null,
      },
    };
  } catch (e) {
    return fallo(e);
  }
}

/** Mensaje armado tal como sale (para el historial y el detalle). */
export async function leerMensaje(id: string): Promise<Resultado<{ asunto: string; html: string }>> {
  try {
    const { puedeVer } = await permisosComunicaciones();
    if (!puedeVer) return { ok: false, error: "No autorizado" };
    if (!esUuid(id)) return { ok: false, error: "Mensaje inválido" };
    const db = await createComunicacionesClient();
    const { data: m, error } = await db
      .from("mensajes")
      .select("id, nombre, categoria, variables, html, envios(asunto, cuerpo)")
      .eq("id", id)
      .maybeSingle();
    if (error) return { ok: false, error: errorBase(error) };
    if (!m) return { ok: false, error: "El mensaje no existe" };
    const envio = m.envios as unknown as { asunto: string; cuerpo: string | null } | null;
    if (m.html) return { ok: true, data: { asunto: envio?.asunto ?? "", html: m.html } };
    const { data: cfg } = await db.from("config").select("pie").maybeSingle();
    const { adjunto: _a, ...variables } = (m.variables ?? {}) as Record<string, unknown>;
    void _a;
    const r = renderPlantilla(
      { asunto: envio?.asunto ?? "", cuerpo: envio?.cuerpo ?? "" },
      { nombre: m.nombre ?? "", ...(variables as Variables) },
      { pie: cfg?.pie, bajaUrl: m.categoria === "difusion" ? URL_BAJA_EJEMPLO : null }
    );
    return { ok: true, data: { asunto: r.asunto, html: r.html } };
  } catch (e) {
    return fallo(e);
  }
}

// ------------------------------------------------------------
// Plantillas
// ------------------------------------------------------------

export async function guardarPlantilla(input: PlantillaInput, id?: string): Promise<Resultado<string>> {
  try {
    await exigirGestionComunicaciones();
    const parsed = plantillaSchema.safeParse(input);
    if (!parsed.success) return invalido(parsed.error.issues);
    const p = parsed.data;
    const db = await createComunicacionesClient();
    if (id) {
      if (!esUuid(id)) return { ok: false, error: "Plantilla inválida" };
      const { data: actual } = await db.from("plantillas").select("clave, sistema").eq("id", id).maybeSingle();
      if (!actual) return { ok: false, error: "La plantilla no existe" };
      if (actual.sistema && actual.clave !== p.clave) {
        return { ok: false, error: "Las plantillas del sistema no cambian de clave" };
      }
      const { data: filas, error } = await db.from("plantillas").update(p).eq("id", id).select("id");
      if (error) return { ok: false, error: errorBase(error) };
      if (!filas?.length) return { ok: false, error: "No tenés permiso para editar plantillas" };
      revalidar();
      return { ok: true, data: id };
    }
    const { data, error } = await db.from("plantillas").insert(p).select("id").single();
    if (error) return { ok: false, error: errorBase(error) };
    revalidar();
    return { ok: true, data: data.id };
  } catch (e) {
    return fallo(e);
  }
}

export async function eliminarPlantilla(id: string): Promise<Resultado> {
  try {
    await exigirGestionComunicaciones();
    if (!esUuid(id)) return { ok: false, error: "Plantilla inválida" };
    const db = await createComunicacionesClient();
    const { data: actual } = await db.from("plantillas").select("sistema").eq("id", id).maybeSingle();
    if (!actual) return { ok: false, error: "La plantilla no existe" };
    if (actual.sistema) return { ok: false, error: "Las plantillas del sistema no se borran (se pueden desactivar)" };
    const { error } = await db.from("plantillas").delete().eq("id", id);
    if (error) return { ok: false, error: errorBase(error) };
    revalidar();
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}

// ------------------------------------------------------------
// Bajas
// ------------------------------------------------------------

export async function suprimirEmail(input: SupresionInput): Promise<Resultado> {
  try {
    await exigirGestionComunicaciones();
    const parsed = supresionSchema.safeParse(input);
    if (!parsed.success) return invalido(parsed.error.issues);
    const s = parsed.data;
    const db = await createComunicacionesClient();
    const { data: ya } = await db
      .from("supresiones")
      .select("id")
      .eq("email", s.email)
      .eq("alcance", s.alcance)
      .is("revocada_at", null)
      .maybeSingle();
    if (ya) return { ok: false, error: "Esa dirección ya tiene una baja vigente con ese alcance" };
    const { error } = await db.rpc("suprimir", {
      p_email: s.email,
      p_alcance: s.alcance,
      p_motivo: s.motivo,
      p_notas: (s.notas || null) as string,
    });
    if (error) return { ok: false, error: errorBase(error) };
    revalidar();
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}

export async function revocarSupresion(id: number): Promise<Resultado> {
  try {
    await exigirGestionComunicaciones();
    if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Baja inválida" };
    const db = await createComunicacionesClient();
    const { error } = await db.rpc("revocar_supresion", { p_supresion: id });
    if (error) return { ok: false, error: errorBase(error) };
    revalidar();
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}

// ------------------------------------------------------------
// Automatizaciones
// ------------------------------------------------------------

export async function guardarAutomatizacion(input: AutomatizacionInput): Promise<Resultado> {
  try {
    await exigirGestionComunicaciones();
    const parsed = automatizacionSchema.safeParse(input);
    if (!parsed.success) return invalido(parsed.error.issues);
    const a = parsed.data;
    const db = await createComunicacionesClient();
    const [{ data: actual }, { data: plantilla }, user] = await Promise.all([
      db.from("automatizaciones").select("parametros").eq("clave", a.clave).maybeSingle(),
      db.from("plantillas").select("clave, activa").eq("clave", a.plantilla_clave).maybeSingle(),
      usuario(),
    ]);
    if (!actual) return { ok: false, error: "La automatización no existe" };
    if (!plantilla) return { ok: false, error: "La plantilla no existe" };
    if (a.activa && !plantilla.activa) return { ok: false, error: "La plantilla elegida está desactivada" };
    const parametros = { ...((actual.parametros ?? {}) as Record<string, unknown>) };
    if (a.dia_del_mes !== undefined) parametros.dia_del_mes = a.dia_del_mes;
    const { data: filas, error } = await db
      .from("automatizaciones")
      .update({
        activa: a.activa,
        modo: a.modo,
        plantilla_clave: a.plantilla_clave,
        parametros: parametros as NonNullable<Json>,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("clave", a.clave)
      .select("clave");
    if (error) return { ok: false, error: errorBase(error) };
    if (!filas?.length) return { ok: false, error: "No tenés permiso para editar automatizaciones" };
    revalidar();
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}

/** Corre la automatización ya, con el mismo período y filtro que el cron. */
export async function correrAhora(clave: string): Promise<Resultado<{ envio: string | null; periodo: string; motivo?: string }>> {
  try {
    await exigirGestionComunicaciones();
    const db = await createComunicacionesClient();
    const { data: a } = await db.from("automatizaciones").select("*").eq("clave", clave).maybeSingle();
    if (!a) return { ok: false, error: "La automatización no existe" };
    if (!a.activa) return { ok: false, error: "Activala primero: solo corren las automatizaciones activas" };
    const plan = planCorrida(a.clave, a.parametros, hoyUruguay(), { ignorarDia: true });
    if (!plan) return { ok: false, error: "Esta automatización no se puede correr a mano" };
    const { data: previa } = await db
      .from("corridas")
      .select("id, envio_id, cantidad")
      .eq("clave", clave)
      .eq("periodo", plan.periodo)
      .maybeSingle();
    if (previa) {
      return {
        ok: true,
        data: { envio: previa.envio_id, periodo: plan.periodo, motivo: "Ya corrió para este período" },
      };
    }
    const { envio, error } = await correrAutomatizacion(db, clave, plan);
    if (error) return { ok: false, error };
    revalidar();
    return {
      ok: true,
      data: { envio, periodo: plan.periodo, motivo: envio ? undefined : "No había destinatarios para este período" },
    };
  } catch (e) {
    return fallo(e);
  }
}

// ------------------------------------------------------------
// Configuración
// ------------------------------------------------------------

export async function guardarConfig(input: ConfigInput): Promise<Resultado> {
  try {
    await exigirGestionComunicaciones();
    const parsed = configSchema.safeParse(input);
    if (!parsed.success) return invalido(parsed.error.issues);
    const c = parsed.data;
    if (c.limite_por_tanda > c.limite_por_hora) {
      return { ok: false, error: "La tanda no puede ser mayor que el límite por hora" };
    }
    const [db, user] = await Promise.all([createComunicacionesClient(), usuario()]);
    const { data: filas, error } = await db
      .from("config")
      .update({ ...c, updated_by: user?.id ?? null, updated_at: new Date().toISOString() })
      .eq("id", true)
      .select("id");
    if (error) return { ok: false, error: errorBase(error) };
    if (!filas?.length) return { ok: false, error: "No tenés permiso para cambiar la configuración" };
    revalidar();
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}

/**
 * WhatsApp de la tienda: lo edita secretaría y también el rol tienda. La
 * RLS de config le permite a tienda actualizar toda la fila: acá se limita
 * a estas dos columnas.
 */
export async function guardarWhatsApp(input: WhatsAppInput): Promise<Resultado> {
  try {
    const { roles, puedeGestionar } = await permisosComunicaciones();
    if (!puedeGestionar && !roles.includes("tienda")) return { ok: false, error: "No autorizado" };
    const parsed = whatsappSchema.safeParse(input);
    if (!parsed.success) return invalido(parsed.error.issues);
    const w = parsed.data;
    const [db, user] = await Promise.all([createComunicacionesClient(), usuario()]);
    const { data: actual } = await db.from("config").select("whatsapp_mensajes").maybeSingle();
    const mensajes = {
      ...((actual?.whatsapp_mensajes ?? {}) as Record<string, unknown>),
      pedido_listo: w.pedido_listo,
      consulta: w.consulta,
    };
    const { data: filas, error } = await db
      .from("config")
      .update({
        whatsapp_tienda: w.numero,
        whatsapp_mensajes: mensajes as NonNullable<Json>,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true)
      .select("id");
    if (error) return { ok: false, error: errorBase(error) };
    if (!filas?.length) return { ok: false, error: "No tenés permiso para cambiar el WhatsApp de la tienda" };
    revalidar();
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}
