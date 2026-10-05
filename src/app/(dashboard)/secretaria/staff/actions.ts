"use server";

import { revalidatePath } from "next/cache";
import { createSociosClient } from "@/lib/socios/server";
import { getUserRoles } from "@/lib/supabase/roles";
import { mensajeError } from "@/lib/contabilidad/formato";
import { altaStaffSchema, bajaStaffSchema, editarStaffSchema } from "@/lib/socios/staff";
import type { Json } from "@/types/socios";

/**
 * Acciones del staff: las usan secretaría (/secretaria/staff) y el panel de
 * cada disciplina. La base controla que quien llama sea representante de
 * esa disciplina o del club (el personal sin disciplina, solo secretaría)
 * y deja el cambio en el registro de la disciplina.
 */

export type Resultado<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const ROLES_STAFF = ["super_admin", "secretaria", "tesorero", "representante_disciplina"];

function invalido(issues: { message: string }[]): { ok: false; error: string } {
  return { ok: false, error: issues[0]?.message ?? "Datos inválidos" };
}

async function ejecutar<T>(
  llamar: (db: Awaited<ReturnType<typeof createSociosClient>>) => PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>
): Promise<Resultado<T | null>> {
  try {
    const roles = await getUserRoles();
    if (!roles.some((r) => ROLES_STAFF.includes(r))) return { ok: false, error: "No autorizado" };
    const db = await createSociosClient();
    const { data, error } = await llamar(db);
    if (error) return { ok: false, error: mensajeError(error) };
    revalidatePath("/secretaria/staff");
    revalidatePath("/disciplina", "layout");
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error inesperado" };
  }
}

export async function altaStaff(input: unknown): Promise<Resultado<number | null>> {
  const p = altaStaffSchema.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  const v = p.data;
  return ejecutar((db) =>
    db.rpc("alta_staff", {
      // La función acepta NULL (personal del club); los tipos generados no lo reflejan.
      p_disciplina: v.disciplina as number,
      p_persona: v.persona as unknown as Json,
      p_funcion: v.funcion,
      p_detalle: v.detalle ?? undefined,
      p_desde: v.desde,
      p_notas: v.notas ?? undefined,
    })
  );
}

export async function editarStaff(input: unknown): Promise<Resultado<null | undefined>> {
  const p = editarStaffSchema.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  const v = p.data;
  return ejecutar((db) =>
    db.rpc("editar_staff", {
      p_staff: v.staff,
      p_funcion: v.funcion,
      p_detalle: v.detalle as string,
      p_desde: v.desde,
      p_notas: v.notas ?? undefined,
      p_contacto: v.contacto as unknown as Json,
    })
  );
}

export async function bajaStaff(input: unknown): Promise<Resultado<null | undefined>> {
  const p = bajaStaffSchema.safeParse(input);
  if (!p.success) return invalido(p.error.issues);
  const v = p.data;
  return ejecutar((db) => db.rpc("baja_staff", { p_staff: v.staff, p_hasta: v.hasta, p_motivo: v.motivo ?? undefined }));
}

export async function anularBajaStaff(staff: number): Promise<Resultado<null | undefined>> {
  if (!Number.isInteger(staff) || staff <= 0) return { ok: false, error: "Datos inválidos" };
  return ejecutar((db) => db.rpc("anular_baja_staff", { p_staff: staff }));
}

export async function eliminarStaff(staff: number): Promise<Resultado<null | undefined>> {
  if (!Number.isInteger(staff) || staff <= 0) return { ok: false, error: "Datos inválidos" };
  return ejecutar((db) => db.rpc("eliminar_staff", { p_staff: staff }));
}
