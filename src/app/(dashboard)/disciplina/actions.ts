"use server";

import { revalidatePath } from "next/cache";
import { createSociosClient } from "@/lib/socios/server";
import { getUserRoles } from "@/lib/supabase/roles";
import { mensajeError } from "@/lib/contabilidad/formato";
import {
  altaDiscSchema,
  bajaDiscSchema,
  cambiarMedioDiscSchema,
  cambiarPlanDiscSchema,
  cobroDiscSchema,
  crearPlanDiscSchema,
  datosDiscSchema,
  leerLiquidacion,
  nuevoPrecioDiscSchema,
} from "@/lib/socios/panel-disciplina";
import type { ResumenLiquidacion } from "@/lib/socios/liquidacion-mail";
import type { Json } from "@/types/socios";

/**
 * Acciones del panel de la disciplina. Cada función de la base vuelve a
 * controlar que quien llama sea representante de la disciplina (o del club)
 * y deja el cambio en el registro para tesorería.
 */

export type Resultado<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const ROLES_PANEL = ["super_admin", "representante_disciplina", "secretaria", "tesorero"];

function invalido(issues: { message: string }[]): { ok: false; error: string } {
  return { ok: false, error: issues[0]?.message ?? "Datos inválidos" };
}

function fallo(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Error inesperado" };
}

/** Corta antes de llegar a la base si el usuario no puede escribir en ningún panel (la base valida la disciplina). */
async function exigirEscritura() {
  const roles = await getUserRoles();
  if (!roles.some((r) => ROLES_PANEL.includes(r))) throw new Error("No autorizado");
}

function revalidar(disciplina: number) {
  revalidatePath(`/disciplina/${disciplina}`);
  revalidatePath("/disciplina");
}

async function ejecutar<T>(disciplina: number, llamar: (db: Awaited<ReturnType<typeof createSociosClient>>) => PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>): Promise<Resultado<T | null>> {
  try {
    await exigirEscritura();
    const db = await createSociosClient();
    const { data, error } = await llamar(db);
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar(disciplina);
    return { ok: true, data };
  } catch (e) {
    return fallo(e);
  }
}

export async function altaSocioDisc(input: unknown): Promise<Resultado<number | null>> {
  const p = altaDiscSchema.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  const v = p.data;
  return ejecutar(v.disciplina, (db) =>
    db.rpc("disc_alta_socio", {
      p_disciplina: v.disciplina,
      p_persona: v.persona as unknown as Json,
      p_desde: v.desde,
      p_plan: v.plan,
      p_medio: (v.medio ?? undefined) as unknown as Json | undefined,
    })
  );
}

export async function bajaDisc(input: unknown): Promise<Resultado<null | undefined>> {
  const p = bajaDiscSchema.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  const v = p.data;
  return ejecutar(v.disciplina, (db) =>
    db.rpc("disc_baja", {
      p_disciplina: v.disciplina,
      p_persona: v.persona,
      p_hasta: v.hasta,
      p_baja_club: v.baja_club,
      p_motivo: v.motivo ?? undefined,
    })
  );
}

export async function cambiarPlanDisc(input: unknown): Promise<Resultado<number | null>> {
  const p = cambiarPlanDiscSchema.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  const v = p.data;
  return ejecutar(v.disciplina, (db) =>
    db.rpc("disc_cambiar_plan", { p_disciplina: v.disciplina, p_suscripcion: v.suscripcion, p_plan: v.plan, p_desde: v.desde })
  );
}

export async function cambiarMedioDisc(input: unknown): Promise<Resultado<number | null>> {
  const p = cambiarMedioDiscSchema.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  const v = p.data;
  return ejecutar(v.disciplina, (db) =>
    db.rpc("disc_cambiar_medio", {
      p_disciplina: v.disciplina,
      p_persona: v.persona,
      p_medio: v.medio as unknown as Json,
      p_desde: v.desde,
    })
  );
}

export async function actualizarDatosDisc(input: unknown): Promise<Resultado<null | undefined>> {
  const p = datosDiscSchema.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  const v = p.data;
  return ejecutar(v.disciplina, (db) =>
    db.rpc("disc_actualizar_datos", { p_disciplina: v.disciplina, p_persona: v.persona, p_datos: v.datos as unknown as Json })
  );
}

export async function crearPlanDisc(input: unknown): Promise<Resultado<number | null>> {
  const p = crearPlanDiscSchema.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  const v = p.data;
  return ejecutar(v.disciplina, (db) =>
    db.rpc("disc_crear_plan", { p_disciplina: v.disciplina, p_nombre: v.nombre, p_importe: v.importe, p_desde: v.desde })
  );
}

export async function nuevoPrecioDisc(input: unknown): Promise<Resultado<null | undefined>> {
  const p = nuevoPrecioDiscSchema.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  const v = p.data;
  return ejecutar(v.disciplina, (db) =>
    db.rpc("disc_nuevo_precio", { p_disciplina: v.disciplina, p_plan: v.plan, p_importe: v.importe, p_desde: v.desde })
  );
}

export async function registrarCobroDisc(input: unknown): Promise<Resultado<number | null>> {
  const p = cobroDiscSchema.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  const v = p.data;
  return ejecutar(v.disciplina, (db) =>
    db.rpc("disc_registrar_cobro", {
      p_disciplina: v.disciplina,
      p_persona: v.persona,
      p_fecha: v.fecha,
      p_importe: v.importe,
      p_referencia: v.referencia ?? undefined,
    })
  );
}

/** Detalle de una liquidación (la base controla que sea de una disciplina que el usuario puede ver). */
export async function leerLiquidacionDisc(id: number): Promise<Resultado<ResumenLiquidacion>> {
  try {
    if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Liquidación inválida" };
    const db = await createSociosClient();
    const r = await leerLiquidacion(db, id);
    if (!r) return { ok: false, error: "No se encontró la liquidación" };
    return { ok: true, data: r };
  } catch (e) {
    return fallo(e);
  }
}
