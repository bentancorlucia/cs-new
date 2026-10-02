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

function refrescar() {
  revalidatePath("/contabilidad/presupuesto", "layout");
}

const crearSchema = z
  .object({
    ejercicioId: uuid,
    base: z.enum(["vacio", "ejercicio_anterior", "promedio", "vigente"], { message: "Base inválida" }),
    meses: z
      .number({ message: "Cantidad de meses inválida" })
      .int("Cantidad de meses inválida")
      .min(1, "El promedio va de 1 a 24 meses")
      .max(24, "El promedio va de 1 a 24 meses")
      .default(3),
    nombre: z.string().trim().max(120, "El nombre es demasiado largo").optional(),
  })
  .strict();

/** Crea el borrador del ejercicio (o la reformulación del aprobado, con base "vigente"). */
export async function crearPresupuesto(input: z.input<typeof crearSchema>): Promise<Resultado<{ id: string }>> {
  const p = crearSchema.safeParse(input);
  if (!p.success) return invalido(p.error);
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const db = await createContabilidadClient();
  const { data, error } = await db.rpc("crear_presupuesto", {
    p_ejercicio: p.data.ejercicioId,
    p_base: p.data.base,
    p_meses: p.data.meses,
    ...(p.data.nombre ? { p_nombre: p.data.nombre } : {}),
  });
  if (error) return { ok: false, error: mensajeError(error) };
  refrescar();
  return { ok: true, data: { id: data } };
}

const celdaSchema = z
  .object({
    cuenta_id: uuid,
    centro_costo_id: uuid.nullable(),
    mes: z.number().int().min(1, "Mes inválido").max(12, "Mes inválido"),
    importe: z
      .number({ message: "Importe inválido" })
      .finite("Importe inválido")
      .min(0, "Los importes del presupuesto van en positivo")
      .max(999_999_999_999, "Importe demasiado grande"),
  })
  .strict();

const guardarSchema = z
  .object({
    presupuestoId: uuid,
    lineas: z.array(celdaSchema).min(1, "No hay cambios para guardar").max(20_000, "Demasiados cambios juntos"),
  })
  .strict()
  .refine(
    (v) => new Set(v.lineas.map((l) => `${l.cuenta_id}|${l.centro_costo_id ?? ""}|${l.mes}`)).size === v.lineas.length,
    "Hay celdas repetidas en el lote"
  );

/** Guarda un lote de celdas del borrador. Importe 0 borra la celda. */
export async function guardarLineasPresupuesto(
  input: z.input<typeof guardarSchema>
): Promise<Resultado<{ celdas: number }>> {
  const p = guardarSchema.safeParse(input);
  if (!p.success) return invalido(p.error);
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const db = await createContabilidadClient();
  const { data, error } = await db.rpc("guardar_presupuesto_lineas", {
    p_presupuesto: p.data.presupuestoId,
    p_lineas: p.data.lineas.map((l) => ({ ...l, importe: Math.round(l.importe * 100) / 100 })),
  });
  if (error) return { ok: false, error: mensajeError(error) };
  refrescar();
  return { ok: true, data: { celdas: data ?? p.data.lineas.length } };
}

export async function aprobarPresupuesto(presupuestoId: string): Promise<Resultado> {
  const p = uuid.safeParse(presupuestoId);
  if (!p.success) return invalido(p.error);
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const db = await createContabilidadClient();
  const { error } = await db.rpc("aprobar_presupuesto", { p_presupuesto: p.data });
  if (error) return { ok: false, error: mensajeError(error) };
  refrescar();
  return { ok: true };
}

export async function eliminarPresupuesto(presupuestoId: string): Promise<Resultado> {
  const p = uuid.safeParse(presupuestoId);
  if (!p.success) return invalido(p.error);
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const db = await createContabilidadClient();
  const { error } = await db.rpc("eliminar_presupuesto", { p_presupuesto: p.data });
  if (error) return { ok: false, error: mensajeError(error) };
  refrescar();
  return { ok: true };
}

const actualizarSchema = z
  .object({
    presupuestoId: uuid,
    nombre: z.string().trim().min(1, "El nombre no puede quedar vacío").max(120, "El nombre es demasiado largo"),
    notas: z.string().trim().max(2000, "Las notas son demasiado largas").optional(),
  })
  .strict();

/** Renombra un borrador y edita sus notas (la base rechaza aprobados y reemplazados). */
export async function actualizarPresupuesto(input: z.input<typeof actualizarSchema>): Promise<Resultado> {
  const p = actualizarSchema.safeParse(input);
  if (!p.success) return invalido(p.error);
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const db = await createContabilidadClient();
  const { error } = await db.rpc("actualizar_presupuesto", {
    p_presupuesto: p.data.presupuestoId,
    p_nombre: p.data.nombre,
    ...(p.data.notas ? { p_notas: p.data.notas } : {}),
  });
  if (error) return { ok: false, error: mensajeError(error) };
  refrescar();
  return { ok: true };
}
