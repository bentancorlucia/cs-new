"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSociosClient } from "@/lib/socios/server";
import { permisosCuotas } from "@/lib/socios/cuotas-permisos";
import { createServerClient } from "@/lib/supabase/server";
import { hoyUruguay, mensajeError } from "@/lib/contabilidad/formato";
import {
  buscarPersonas,
  cuentaPersona,
  identificarDebitos,
  planillaDebito,
  previsualizarLote,
  simularLiquidacionVisa,
  type CuentaPersona,
  type FilaPlanilla,
  type FilaPrevia,
  type Identificacion,
  type Persona,
  type SimulacionVisa,
} from "@/lib/socios/cuotas";
import { avisarLiquidaciones, type AvisoLiquidaciones, type ResumenLiquidacion } from "@/lib/socios/liquidacion-mail";
import type { Json } from "@/types/socios";

export type Resultado<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

type Permiso = "puedeVer" | "puedeCobrar" | "puedeTesoreria" | "verTesoreria";

async function exigir(permiso: Permiso) {
  const p = await permisosCuotas();
  if (!p[permiso]) throw new Error("No tenés permiso para esta operación");
  return p;
}

function fallo(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Error inesperado" };
}

function invalido(issues: { message: string }[]): { ok: false; error: string } {
  return { ok: false, error: issues[0]?.message ?? "Datos inválidos" };
}

function revalidar() {
  revalidatePath("/cuotas", "layout");
}

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const periodo = z
  .string()
  .regex(/^\d{4}-\d{2}(-\d{2})?$/, "Período inválido")
  .transform((s) => `${s.slice(0, 7)}-01`);
const id = z.number().int().positive();
const importe = z.number().positive("El importe tiene que ser mayor que cero").max(100_000_000);
const motivo = z.string().trim().min(3, "Indicá el motivo").max(500);
const anularSchema = z.object({ id, motivo });

/** La función acepta NULL aunque el tipo generado diga string/number. */
const nulo = <T,>(v: T | null | undefined) => (v ?? null) as T;

// ------------------------------------------------------------
// Lecturas
// ------------------------------------------------------------

export async function buscarPersonasAction(texto: string): Promise<Resultado<Persona[]>> {
  try {
    await exigir("verTesoreria");
    const t = z.string().max(80).parse(texto);
    return { ok: true, data: await buscarPersonas(await createServerClient(), t) };
  } catch (e) {
    return fallo(e);
  }
}

export async function leerCuentaPersona(personaId: number, al?: string): Promise<Resultado<CuentaPersona | null>> {
  try {
    await exigir("verTesoreria");
    const pid = id.parse(personaId);
    const f = al ? fecha.parse(al) : hoyUruguay();
    const [db, padron] = await Promise.all([createSociosClient(), createServerClient()]);
    return { ok: true, data: await cuentaPersona(db, padron, pid, f) };
  } catch (e) {
    return fallo(e);
  }
}

// ------------------------------------------------------------
// Lotes
// ------------------------------------------------------------

export async function previsualizarLoteAction(p: string): Promise<Resultado<FilaPrevia[]>> {
  try {
    await exigir("verTesoreria");
    const per = periodo.parse(p);
    const [db, padron] = await Promise.all([createSociosClient(), createServerClient()]);
    return { ok: true, data: await previsualizarLote(db, padron, per) };
  } catch (e) {
    return fallo(e);
  }
}

const emitirSchema = z
  .object({
    periodo,
    fecha_emision: fecha,
    fecha_vencimiento: fecha,
    omitir: z.array(id).max(20000),
  })
  .refine((d) => d.fecha_vencimiento >= d.fecha_emision, {
    message: "El vencimiento no puede ser anterior a la emisión",
  });

export async function emitirLote(input: z.input<typeof emitirSchema>): Promise<Resultado<number>> {
  try {
    await exigir("puedeTesoreria");
    const p = emitirSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const db = await createSociosClient();
    const { data, error } = await db.rpc("emitir_lote", {
      p_periodo: p.data.periodo,
      p_fecha_emision: p.data.fecha_emision,
      p_fecha_vencimiento: p.data.fecha_vencimiento,
      p_omitir: p.data.omitir,
    });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar();
    return { ok: true, data };
  } catch (e) {
    return fallo(e);
  }
}

export async function anularLote(input: z.input<typeof anularSchema>): Promise<Resultado> {
  try {
    await exigir("puedeTesoreria");
    const p = anularSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const db = await createSociosClient();
    const { error } = await db.rpc("anular_lote", { p_lote: p.data.id, p_motivo: p.data.motivo });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar();
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}

// ------------------------------------------------------------
// Cobros
// ------------------------------------------------------------

const cobroSchema = z
  .object({
    persona_id: id,
    fecha,
    medio: z.enum(["transferencia_club", "transferencia_disciplina", "efectivo"]),
    importe,
    cuenta_id: z.uuid().nullish(),
    disciplina_id: id.nullish(),
    referencia: z.string().trim().max(120).nullish(),
    cuotas: z.array(id).max(500).nullish(),
  })
  .refine((d) => d.medio !== "transferencia_disciplina" || !!d.disciplina_id, {
    message: "Indicá en la cuenta de qué disciplina pagó",
  })
  .refine((d) => d.fecha <= hoyUruguay(), { message: "La fecha del cobro no puede ser futura" });

export async function registrarCobro(input: z.input<typeof cobroSchema>): Promise<Resultado<number>> {
  try {
    const permisos = await exigir("puedeCobrar");
    const p = cobroSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const d = p.data;
    const db = await createSociosClient();
    const { data, error } = await db.rpc("registrar_cobro", {
      p_persona: d.persona_id,
      p_fecha: d.fecha,
      p_medio: d.medio,
      p_importe: d.importe,
      // Secretaría no elige la cuenta: va a la configurada (banco o caja).
      p_cuenta: nulo(d.medio !== "transferencia_disciplina" && permisos.puedeTesoreria ? d.cuenta_id : null),
      p_disciplina: nulo(d.medio === "transferencia_disciplina" ? d.disciplina_id : null),
      p_referencia: nulo(d.referencia || null),
      p_cuotas: nulo(d.cuotas && d.cuotas.length > 0 ? d.cuotas : null),
    });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar();
    return { ok: true, data };
  } catch (e) {
    return fallo(e);
  }
}

export async function anularCobro(input: z.input<typeof anularSchema>): Promise<Resultado> {
  try {
    await exigir("puedeTesoreria");
    const p = anularSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const db = await createSociosClient();
    const { error } = await db.rpc("anular_cobro", { p_cobro: p.data.id, p_motivo: p.data.motivo });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar();
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}

// ------------------------------------------------------------
// Débito Visa
// ------------------------------------------------------------

export async function leerPlanillaDebito(p: string, incluirDeuda = false): Promise<Resultado<FilaPlanilla[]>> {
  try {
    await exigir("verTesoreria");
    const per = periodo.parse(p);
    const [db, padron] = await Promise.all([createSociosClient(), createServerClient()]);
    return { ok: true, data: await planillaDebito(db, padron, per, z.boolean().parse(incluirDeuda)) };
  } catch (e) {
    return fallo(e);
  }
}

const identificarSchema = z.object({
  fecha,
  claves: z.array(z.object({ clave: z.string().trim().max(40), tipo: z.enum(["cedula", "ultimos4"]) })).max(5000),
});

export async function identificarVisa(input: z.input<typeof identificarSchema>): Promise<Resultado<Identificacion[]>> {
  try {
    await exigir("verTesoreria");
    const p = identificarSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const [db, padron] = await Promise.all([createSociosClient(), createServerClient()]);
    return { ok: true, data: await identificarDebitos(db, padron, p.data.claves, p.data.fecha) };
  } catch (e) {
    return fallo(e);
  }
}

const cobradoSchema = z.object({ persona_id: id, importe, referencia: z.string().trim().max(120).nullish() });
const rechazoSchema = z
  .object({
    persona_id: id.nullish(),
    documento: z.string().trim().max(40).nullish(),
    importe,
    motivo: z.string().trim().max(200).nullish(),
  })
  .refine((r) => !!r.persona_id || !!r.documento, { message: "Cada rechazo necesita la persona o el documento" });

const simularSchema = z.object({
  periodo,
  fecha,
  comision: z.number().min(0),
  iva: z.number().min(0),
  cobrados: z.array(cobradoSchema).max(5000),
});

export async function simularVisa(input: z.input<typeof simularSchema>): Promise<Resultado<SimulacionVisa>> {
  try {
    await exigir("verTesoreria");
    const p = simularSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const [db, padron] = await Promise.all([createSociosClient(), createServerClient()]);
    return { ok: true, data: await simularLiquidacionVisa(db, padron, p.data) };
  } catch (e) {
    return fallo(e);
  }
}

const visaSchema = z
  .object({
    periodo,
    fecha,
    comision: z.number().min(0, "La comisión no puede ser negativa"),
    iva: z.number().min(0, "El IVA no puede ser negativo"),
    cuenta_id: z.uuid().nullish(),
    archivo: z.string().trim().max(200).nullish(),
    cobrados: z.array(cobradoSchema).min(1, "La liquidación no tiene débitos cobrados").max(5000),
    rechazados: z.array(rechazoSchema).max(5000),
  })
  .refine((d) => new Set(d.cobrados.map((c) => c.persona_id)).size === d.cobrados.length, {
    message: "Hay personas repetidas entre los cobrados",
  })
  .refine((d) => d.comision + d.iva < d.cobrados.reduce((s, c) => s + c.importe, 0), {
    message: "La comisión más el IVA no pueden ser mayores que lo cobrado",
  });

export async function aplicarLiquidacionVisa(input: z.input<typeof visaSchema>): Promise<Resultado<number>> {
  try {
    await exigir("puedeTesoreria");
    const p = visaSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const d = p.data;
    const db = await createSociosClient();
    const { data, error } = await db.rpc("aplicar_liquidacion_visa", {
      p_periodo: d.periodo,
      p_fecha: d.fecha,
      p_comision: d.comision,
      p_cobrados: d.cobrados.map((c) => ({
        persona_id: c.persona_id,
        importe: c.importe,
        ...(c.referencia ? { referencia: c.referencia } : {}),
      })) as Json,
      p_rechazados: d.rechazados.map((r) => ({
        ...(r.persona_id ? { persona_id: r.persona_id } : {}),
        ...(r.documento ? { documento: r.documento } : {}),
        importe: r.importe,
        ...(r.motivo ? { motivo: r.motivo } : {}),
      })) as Json,
      p_cuenta: nulo(d.cuenta_id),
      p_archivo: nulo(d.archivo || null),
      p_iva: d.iva,
    });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar();
    return { ok: true, data };
  } catch (e) {
    return fallo(e);
  }
}

export async function anularLiquidacionVisa(input: z.input<typeof anularSchema>): Promise<Resultado> {
  try {
    await exigir("puedeTesoreria");
    const p = anularSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const db = await createSociosClient();
    const { error } = await db.rpc("anular_liquidacion_visa", { p_liquidacion: p.data.id, p_motivo: p.data.motivo });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar();
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}

// ------------------------------------------------------------
// Notas de crédito
// ------------------------------------------------------------

const creditoSchema = z.object({
  persona_id: id,
  fecha,
  tipo: z.enum(["bonificacion", "anulacion"]),
  motivo,
  cuotas: z.array(z.object({ cuota_id: id, importe })).min(1, "Elegí al menos una cuota").max(500),
});

export async function registrarCredito(input: z.input<typeof creditoSchema>): Promise<Resultado<number>> {
  try {
    await exigir("puedeTesoreria");
    const p = creditoSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const d = p.data;
    const db = await createSociosClient();
    const { data, error } = await db.rpc("registrar_credito", {
      p_persona: d.persona_id,
      p_fecha: d.fecha,
      p_tipo: d.tipo,
      p_motivo: d.motivo,
      p_cuotas: d.cuotas as Json,
    });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar();
    return { ok: true, data };
  } catch (e) {
    return fallo(e);
  }
}

export async function anularCredito(input: z.input<typeof anularSchema>): Promise<Resultado> {
  try {
    await exigir("puedeTesoreria");
    const p = anularSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const db = await createSociosClient();
    const { error } = await db.rpc("anular_credito", { p_credito: p.data.id, p_motivo: p.data.motivo });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar();
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}

// ------------------------------------------------------------
// Disciplinas
// ------------------------------------------------------------

const configDisciplinaSchema = z.object({
  disciplina_id: id,
  porcentaje: z.number().min(0, "Entre 0 y 100").max(100, "Entre 0 y 100"),
  datos_transferencia: z.string().trim().max(500).nullish(),
});

export async function guardarDisciplinaCobranza(input: z.input<typeof configDisciplinaSchema>): Promise<Resultado> {
  try {
    await exigir("puedeTesoreria");
    const p = configDisciplinaSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const db = await createSociosClient();
    const { error } = await db.from("disciplinas_cobranza").upsert({
      disciplina_id: p.data.disciplina_id,
      porcentaje_comision: p.data.porcentaje,
      datos_transferencia: p.data.datos_transferencia || null,
      updated_at: new Date().toISOString(),
    });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar();
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}

const liquidarMesSchema = z
  .object({
    periodo,
    fecha,
    /** null: todas las que tienen algo para liquidar. */
    disciplinas: z.array(id).max(500).nullish(),
  })
  .refine((d) => d.fecha <= hoyUruguay(), { message: "La fecha no puede ser futura" })
  .refine((d) => !d.disciplinas || d.disciplinas.length > 0, { message: "Elegí al menos una disciplina" });

export type ResultadoLiquidarMes = { ids: number[]; aviso: AvisoLiquidaciones | null; errorAviso: string | null };

/**
 * Liquida el mes a las disciplinas elegidas (o a todas) y les manda el
 * resumen a sus representantes. Si el mail falla, la liquidación queda hecha
 * igual y se avisa (se puede reenviar después).
 */
export async function liquidarMes(input: z.input<typeof liquidarMesSchema>): Promise<Resultado<ResultadoLiquidarMes>> {
  try {
    await exigir("puedeTesoreria");
    const p = liquidarMesSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const d = p.data;
    const db = await createSociosClient();
    const { data, error } = await db.rpc("liquidar_disciplinas_mes", {
      p_periodo: d.periodo,
      p_fecha: d.fecha,
      p_disciplinas: nulo(d.disciplinas && d.disciplinas.length > 0 ? d.disciplinas : null),
    });
    if (error) return { ok: false, error: mensajeError(error) };
    const ids = (data ?? []).map(Number);
    revalidar();
    revalidatePath("/secretaria/disciplinas", "layout");
    if (ids.length === 0) return { ok: true, data: { ids, aviso: null, errorAviso: null } };
    try {
      const aviso = await avisarLiquidaciones(db, ids);
      return { ok: true, data: { ids, aviso, errorAviso: null } };
    } catch (e) {
      return { ok: true, data: { ids, aviso: null, errorAviso: e instanceof Error ? e.message : "No se pudo mandar el resumen" } };
    }
  } catch (e) {
    return fallo(e);
  }
}

/** Vuelve a mandar el resumen de una liquidación a los representantes de la disciplina. */
export async function reenviarResumenLiquidacion(liquidacionId: number): Promise<Resultado<AvisoLiquidaciones>> {
  try {
    await exigir("puedeTesoreria");
    const lid = id.parse(liquidacionId);
    const db = await createSociosClient();
    return { ok: true, data: await avisarLiquidaciones(db, [lid], { reenvio: true }) };
  } catch (e) {
    return fallo(e);
  }
}

/** Resumen de una liquidación con el detalle por socio (como la planilla de tesorería). */
export async function leerResumenLiquidacion(liquidacionId: number): Promise<Resultado<ResumenLiquidacion>> {
  try {
    await exigir("verTesoreria");
    const lid = id.parse(liquidacionId);
    const db = await createSociosClient();
    const { data, error } = await db.rpc("resumen_liquidacion", { p_liquidacion: lid });
    if (error) return { ok: false, error: mensajeError(error) };
    if (!data) return { ok: false, error: "La liquidación no existe" };
    return { ok: true, data: data as unknown as ResumenLiquidacion };
  } catch (e) {
    return fallo(e);
  }
}

const pagarSchema = z
  .object({
    liquidacion_id: id,
    disciplina_id: id,
    fecha,
    transferir: z.number().min(0, "Lo transferido no puede ser negativo").max(100_000_000),
    cuenta_id: z.uuid().nullish(),
    compensar: z.number().min(0, "Lo compensado no puede ser negativo").max(100_000_000),
    plan_id: id.nullish(),
    referencia: z.string().trim().max(120).nullish(),
    notas: z.string().trim().max(500).nullish(),
  })
  .refine((d) => d.transferir + d.compensar > 0, { message: "Indicá cuánto se transfiere y/o cuánto se compensa" })
  .refine((d) => d.transferir === 0 || !!d.cuenta_id, { message: "Elegí la cuenta desde la que se transfiere" })
  .refine((d) => !d.plan_id || d.compensar > 0, { message: "Para imputar a un plan de pago hay que compensar parte de la deuda" });

/** Pago (total o parcial) de una liquidación: transferencia y/o compensación de la deuda de la disciplina. */
export async function pagarLiquidacion(input: z.input<typeof pagarSchema>): Promise<Resultado<number>> {
  try {
    await exigir("puedeTesoreria");
    const p = pagarSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const d = p.data;
    const db = await createSociosClient();
    const { data, error } = await db.rpc("pagar_liquidacion_disciplina", {
      p_liquidacion: d.liquidacion_id,
      p_fecha: d.fecha,
      p_transferir: d.transferir,
      p_cuenta: nulo(d.transferir > 0 ? d.cuenta_id : null),
      p_compensar: d.compensar,
      p_plan: nulo(d.compensar > 0 ? d.plan_id : null),
      p_referencia: nulo(d.referencia || null),
      p_notas: nulo(d.notas || null),
    });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar();
    revalidatePath(`/secretaria/disciplinas/${d.disciplina_id}`);
    return { ok: true, data };
  } catch (e) {
    return fallo(e);
  }
}

export async function anularPagoLiquidacion(input: z.input<typeof anularSchema>): Promise<Resultado> {
  try {
    await exigir("puedeTesoreria");
    const p = anularSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const db = await createSociosClient();
    const { error } = await db.rpc("anular_pago_liquidacion", { p_pago: p.data.id, p_motivo: p.data.motivo });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar();
    revalidatePath("/secretaria/disciplinas", "layout");
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}

export async function anularLiquidacionDisciplina(input: z.input<typeof anularSchema>): Promise<Resultado> {
  try {
    await exigir("puedeTesoreria");
    const p = anularSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const db = await createSociosClient();
    const { error } = await db.rpc("anular_liquidacion_disciplina", {
      p_liquidacion: p.data.id,
      p_motivo: p.data.motivo,
    });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar();
    revalidatePath("/secretaria/disciplinas", "layout");
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}

// ------------------------------------------------------------
// Cambios para el débito
// ------------------------------------------------------------

const marcarSchema = z
  .object({
    ids: z.array(id).min(1, "Elegí al menos un cambio").max(2000),
    estado: z.enum(["aplicado", "descartado"]),
    notas: z.string().trim().max(500).nullish(),
  })
  .refine((d) => d.estado !== "descartado" || (d.notas ?? "").length >= 3, { message: "Indicá por qué se descarta" });

/** Marca cambios como cargados en el portal de Visa (o descartados). El número de tarjeta se borra. */
export async function marcarCambios(input: z.input<typeof marcarSchema>): Promise<Resultado<number>> {
  try {
    await exigir("puedeTesoreria");
    const p = marcarSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const db = await createSociosClient();
    const { data, error } = await db.rpc("marcar_cambios", {
      p_cambios: p.data.ids,
      p_estado: p.data.estado,
      p_notas: nulo(p.data.notas || null),
    });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar();
    revalidatePath("/secretaria/disciplinas", "layout");
    return { ok: true, data: Number(data ?? 0) };
  } catch (e) {
    return fallo(e);
  }
}

/** Número completo de una tarjeta pendiente (solo tesorería; la base registra cada consulta). */
export async function verTarjeta(cambioId: number): Promise<Resultado<string>> {
  try {
    await exigir("puedeTesoreria");
    const cid = id.parse(cambioId);
    const db = await createSociosClient();
    const { data, error } = await db.rpc("ver_tarjeta", { p_cambio: cid });
    if (error) return { ok: false, error: mensajeError(error) };
    if (!data) return { ok: false, error: "No hay un número de tarjeta para ese cambio" };
    return { ok: true, data };
  } catch (e) {
    return fallo(e);
  }
}

// ------------------------------------------------------------
// Configuración
// ------------------------------------------------------------

const configSchema = z.object({
  tolerancia_cuotas: z.number().int().min(0).max(36),
  tolerancia_debito: z.number().int().min(0).max(36),
  dia_vencimiento: z.number().int().min(1, "Entre 1 y 28").max(28, "Entre 1 y 28"),
  mes_cuota_anual: z.number().int().min(1).max(12),
  cobrar_mes_alta: z.boolean(),
  baja_con_deuda: z.enum(["mantener", "anular"]),
});

export async function guardarConfigCuotas(input: z.input<typeof configSchema>): Promise<Resultado> {
  try {
    await exigir("puedeTesoreria");
    const p = configSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const [db, padron] = await Promise.all([createSociosClient(), createServerClient()]);
    const { data: auth } = await padron.auth.getUser();
    const { error, count } = await db
      .from("config")
      .update({ ...p.data, updated_at: new Date().toISOString(), updated_by: auth.user?.id ?? null }, { count: "exact" })
      .eq("id", true);
    if (error) return { ok: false, error: mensajeError(error) };
    if (!count) return { ok: false, error: "No tenés permiso para cambiar la configuración" };
    revalidar();
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}
