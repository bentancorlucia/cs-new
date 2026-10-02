"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createContabilidadClient } from "@/lib/contabilidad/server";
import { exigirEscritura } from "@/lib/contabilidad/permisos";
import { mensajeError } from "@/lib/contabilidad/formato";

export type Resultado<T = undefined> =
  | ({ ok: true; error?: undefined } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

const uuid = z.string().uuid("Identificador inválido");
const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Fecha inválida");

async function autorizar(): Promise<{ ok: false; error: string } | null> {
  try {
    await exigirEscritura();
    return null;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No autorizado" };
  }
}

function invalido(error: z.ZodError): { ok: false; error: string } {
  return { ok: false, error: error.issues[0]?.message ?? "Datos inválidos" };
}

/** Cierres y aperturas cambian asientos, balances y mayores: se refresca todo el módulo. */
function refrescar() {
  revalidatePath("/contabilidad", "layout");
}

export async function crearEjercicio(anio: number): Promise<Resultado<{ id: string }>> {
  const p = z
    .number({ message: "Año inválido" })
    .int("Año inválido")
    .min(2000, "El año tiene que ser 2000 o posterior")
    .max(2100, "Año inválido")
    .safeParse(anio);
  if (!p.success) return invalido(p.error);
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const db = await createContabilidadClient();
  const { data, error } = await db.rpc("crear_ejercicio", { p_anio: p.data });
  if (error) return { ok: false, error: mensajeError(error) };
  refrescar();
  return { ok: true, data: { id: data } };
}

export async function cerrarPeriodo(periodoId: string): Promise<Resultado> {
  const p = uuid.safeParse(periodoId);
  if (!p.success) return invalido(p.error);
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const db = await createContabilidadClient();
  const { error } = await db.rpc("cerrar_periodo", { p_periodo: p.data });
  if (error) return { ok: false, error: mensajeError(error) };
  refrescar();
  return { ok: true };
}

export async function reabrirPeriodo(periodoId: string): Promise<Resultado> {
  const p = uuid.safeParse(periodoId);
  if (!p.success) return invalido(p.error);
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const db = await createContabilidadClient();
  const { error } = await db.rpc("reabrir_periodo", { p_periodo: p.data });
  if (error) return { ok: false, error: mensajeError(error) };
  refrescar();
  return { ok: true };
}

/** Revalúa las cuentas en dólares a la fecha. `asientoId` null = no había diferencias. */
export async function revaluarMonedaExtranjera(
  fechaRevaluacion: string
): Promise<Resultado<{ asientoId: string | null }>> {
  const p = fecha.safeParse(fechaRevaluacion);
  if (!p.success) return invalido(p.error);
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const db = await createContabilidadClient();
  const { data, error } = await db.rpc("revaluar_moneda_extranjera", { p_fecha: p.data });
  if (error) return { ok: false, error: mensajeError(error) };
  refrescar();
  return { ok: true, data: { asientoId: data ?? null } };
}

const cierreSchema = z.object({
  ejercicioId: uuid,
  confirmacion: z.string().trim(),
});

/**
 * Cierra el ejercicio. Se pide el año escrito a mano como confirmación;
 * acá se vuelve a comparar contra el ejercicio real, no contra lo que
 * mandó el formulario.
 */
export async function cerrarEjercicio(input: {
  ejercicioId: string;
  confirmacion: string;
}): Promise<Resultado<{ siguienteId: string }>> {
  const p = cierreSchema.safeParse(input);
  if (!p.success) return invalido(p.error);
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const db = await createContabilidadClient();
  const { data: ejercicio, error: errorLectura } = await db
    .from("ejercicios")
    .select("id, fecha_fin, estado")
    .eq("id", p.data.ejercicioId)
    .maybeSingle();
  if (errorLectura) return { ok: false, error: mensajeError(errorLectura) };
  if (!ejercicio) return { ok: false, error: "El ejercicio no existe" };
  const anioReal = ejercicio.fecha_fin.slice(0, 4);
  if (p.data.confirmacion !== anioReal) {
    return { ok: false, error: `Para confirmar escribí el año del ejercicio (${anioReal})` };
  }

  const { data, error } = await db.rpc("cerrar_ejercicio", { p_ejercicio: p.data.ejercicioId });
  if (error) return { ok: false, error: mensajeError(error) };
  refrescar();
  return { ok: true, data: { siguienteId: data } };
}

export async function reabrirEjercicio(ejercicioId: string): Promise<Resultado> {
  const p = uuid.safeParse(ejercicioId);
  if (!p.success) return invalido(p.error);
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const db = await createContabilidadClient();
  const { error } = await db.rpc("reabrir_ejercicio", { p_ejercicio: p.data });
  if (error) return { ok: false, error: mensajeError(error) };
  refrescar();
  return { ok: true };
}
