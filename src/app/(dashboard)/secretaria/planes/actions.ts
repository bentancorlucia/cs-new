"use server";

import { revalidatePath } from "next/cache";
import { createSociosClient, exigirPermisoSocios } from "@/lib/socios/server";
import { mensajeError } from "@/lib/contabilidad/formato";
import { planSchema, precioSchema, type PlanInput, type PrecioInput } from "@/lib/socios/esquemas";

export type Resultado<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function fallo(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Error inesperado" };
}

function errorPlan(error: { message?: string; code?: string }): string {
  if (error.code === "23505" && error.message?.includes("planes_nombre_unico")) {
    return "Ya hay un plan con ese nombre (en esa disciplina)";
  }
  if (error.code === "23505" && error.message?.includes("plan_precios")) {
    return "Ese plan ya tiene un precio desde ese mes: editalo o elegí otro mes";
  }
  return mensajeError(error);
}

function revalidar() {
  revalidatePath("/secretaria/planes");
  revalidatePath("/secretaria/socios", "layout");
}

/** Crea o edita un plan (secretaría puede: la RLS lo permite). */
export async function guardarPlan(input: PlanInput): Promise<Resultado<number>> {
  try {
    await exigirPermisoSocios("puedeGestionar");
    const p = planSchema.safeParse(input);
    if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos inválidos" };
    const d = p.data;
    const so = await createSociosClient();
    const fila = {
      nombre: d.nombre,
      tipo: d.tipo,
      disciplina_id: d.tipo === "disciplina" ? (d.disciplina_id ?? null) : null,
      permite_anual: d.permite_anual,
      activo: d.activo,
    };
    if (d.id) {
      // Tipo y disciplina no cambian una vez creado: las cuotas e inscripciones dependen de eso.
      const { error } = await so
        .from("planes")
        .update({ nombre: fila.nombre, permite_anual: fila.permite_anual, activo: fila.activo })
        .eq("id", d.id);
      if (error) return { ok: false, error: errorPlan(error) };
      revalidar();
      return { ok: true, data: d.id };
    }
    const { data, error } = await so.from("planes").insert(fila).select("id").single();
    if (error) return { ok: false, error: errorPlan(error) };
    revalidar();
    return { ok: true, data: data.id };
  } catch (e) {
    return fallo(e);
  }
}

/** Precios: solo tesorería / super_admin. Un precio usado en cuotas no se toca (lo impide la base). */
export async function guardarPrecio(input: PrecioInput): Promise<Resultado> {
  try {
    await exigirPermisoSocios("puedeTesoreria");
    const p = precioSchema.safeParse(input);
    if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos inválidos" };
    const d = p.data;
    const fila = {
      plan_id: d.plan_id,
      vigente_desde: `${d.mes}-01`,
      importe_mensual: Math.round(d.importe_mensual * 100) / 100,
      importe_anual: d.importe_anual ? Math.round(d.importe_anual * 100) / 100 : null,
    };
    const so = await createSociosClient();
    const { error } = d.id
      ? await so.from("plan_precios").update(fila).eq("id", d.id)
      : await so.from("plan_precios").insert(fila);
    if (error) return { ok: false, error: errorPlan(error) };
    revalidar();
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}

export async function eliminarPrecio(id: number): Promise<Resultado> {
  try {
    await exigirPermisoSocios("puedeTesoreria");
    if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Precio inválido" };
    const so = await createSociosClient();
    const { error } = await so.from("plan_precios").delete().eq("id", id);
    if (error) return { ok: false, error: errorPlan(error) };
    revalidar();
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}
