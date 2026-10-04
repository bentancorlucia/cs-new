"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { createSociosClient, exigirPermisoSocios } from "@/lib/socios/server";
import { mensajeError } from "@/lib/contabilidad/formato";

/**
 * Disciplinas: gestión (secretaría o super_admin) y, desde tesorería, los
 * pagos de la disciplina al club y los planes de pago. La base vuelve a
 * validar cada operación (RLS de public.disciplinas y _exigir_tesoreria en
 * las funciones de socios).
 */

export type Resultado<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function fallo(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Error inesperado" };
}

function invalido(issues: { message: string }[]): { ok: false; error: string } {
  return { ok: false, error: issues[0]?.message ?? "Datos inválidos" };
}

function revalidar(id?: number) {
  revalidatePath("/secretaria/disciplinas");
  if (id) revalidatePath(`/secretaria/disciplinas/${id}`);
}

const id = z.number().int().positive();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Como máximo ${max} caracteres`)
    .nullish()
    .transform((v) => (v ? v : null));

/** La función acepta NULL aunque el tipo generado diga string/number. */
const nulo = <T,>(v: T | null | undefined) => (v ?? null) as T;

function slugDe(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ------------------------------------------------------------
// Gestión de la disciplina
// ------------------------------------------------------------

const disciplinaSchema = z.object({
  nombre: z.string().trim().min(1, "Indicá el nombre").max(100, "Como máximo 100 caracteres"),
  slug: z
    .string()
    .trim()
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "El slug va en minúsculas, sin tildes y con guiones (ej: hockey-femenino)")
    .or(z.literal(""))
    .nullish(),
  descripcion: textoOpcional(2000),
  imagen_url: z
    .string()
    .trim()
    .max(1000)
    .refine((v) => v === "" || v.startsWith("/") || /^https?:\/\//.test(v), "La imagen tiene que ser una URL (https://…) o una ruta del sitio (/images/…)")
    .nullish()
    .transform((v) => (v ? v : null)),
  contacto_nombre: textoOpcional(100),
  contacto_telefono: textoOpcional(20),
  contacto_email: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || z.email().safeParse(v).success, "Email inválido")
    .nullish()
    .transform((v) => (v ? v.toLowerCase() : null)),
  activa: z.boolean().default(true),
});

export type DisciplinaInput = z.input<typeof disciplinaSchema>;

function errorDisciplina(error: { message?: string; code?: string }): string {
  if (error.code === "23505") {
    return error.message?.includes("slug") ? "Ya hay una disciplina con ese slug" : "Ya hay una disciplina con ese nombre";
  }
  return mensajeError(error);
}

async function datosDisciplina(input: DisciplinaInput) {
  const p = disciplinaSchema.safeParse(input);
  if (!p.success) return { error: invalido(p.error.issues) } as const;
  const d = p.data;
  const slug = d.slug || slugDe(d.nombre);
  if (!slug) return { error: { ok: false as const, error: "No se pudo armar el slug: indicalo a mano" } } as const;
  return { datos: { ...d, slug } } as const;
}

export async function crearDisciplina(input: DisciplinaInput): Promise<Resultado<number>> {
  try {
    await exigirPermisoSocios("puedeGestionar");
    const r = await datosDisciplina(input);
    if ("error" in r) return r.error!;
    const db = await createServerClient();
    const { data, error } = await db.from("disciplinas").insert(r.datos).select("id").single();
    if (error) return { ok: false, error: errorDisciplina(error) };
    revalidar();
    return { ok: true, data: data.id };
  } catch (e) {
    return fallo(e);
  }
}

export async function editarDisciplina(disciplinaId: number, input: DisciplinaInput): Promise<Resultado> {
  try {
    await exigirPermisoSocios("puedeGestionar");
    const did = id.parse(disciplinaId);
    const r = await datosDisciplina(input);
    if ("error" in r) return r.error!;
    const db = await createServerClient();
    const { data, error } = await db.from("disciplinas").update(r.datos).eq("id", did).select("id");
    if (error) return { ok: false, error: errorDisciplina(error) };
    if (!data?.length) return { ok: false, error: "No tenés permiso para editar la disciplina o no existe" };
    revalidar(did);
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}

export async function cambiarActivaDisciplina(disciplinaId: number, activa: boolean): Promise<Resultado> {
  try {
    await exigirPermisoSocios("puedeGestionar");
    const did = id.parse(disciplinaId);
    const db = await createServerClient();
    const { data, error } = await db.from("disciplinas").update({ activa: z.boolean().parse(activa) }).eq("id", did).select("id");
    if (error) return { ok: false, error: errorDisciplina(error) };
    if (!data?.length) return { ok: false, error: "No tenés permiso para editar la disciplina o no existe" };
    revalidar(did);
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}

// ------------------------------------------------------------
// Pagos de la disciplina al club (tesorería)
// ------------------------------------------------------------

const pagoSchema = z.object({
  disciplina_id: id,
  fecha,
  importe: z.number().positive("El importe tiene que ser mayor que cero").max(100_000_000),
  cuenta_id: z.uuid("Elegí la cuenta de caja o banco"),
  referencia: textoOpcional(120),
  notas: textoOpcional(500),
  plan_id: id.nullish(),
});

export async function registrarPagoDisciplina(input: z.input<typeof pagoSchema>): Promise<Resultado<number>> {
  try {
    await exigirPermisoSocios("puedeTesoreria");
    const p = pagoSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const d = p.data;
    const db = await createSociosClient();
    const { data, error } = await db.rpc("registrar_cobro_disciplina", {
      p_disciplina: d.disciplina_id,
      p_fecha: d.fecha,
      p_importe: d.importe,
      p_cuenta: d.cuenta_id,
      p_referencia: nulo(d.referencia),
      p_plan: nulo(d.plan_id),
      p_notas: nulo(d.notas),
    });
    if (error) {
      if (error.code === "23505") return { ok: false, error: "Esa referencia ya se usó en otro pago vigente de la disciplina" };
      return { ok: false, error: mensajeError(error) };
    }
    revalidar(d.disciplina_id);
    return { ok: true, data };
  } catch (e) {
    return fallo(e);
  }
}

const anularPagoSchema = z.object({
  disciplina_id: id,
  id,
  motivo: z.string().trim().min(3, "Indicá el motivo").max(500),
});

export async function anularPagoDisciplina(input: z.input<typeof anularPagoSchema>): Promise<Resultado> {
  try {
    await exigirPermisoSocios("puedeTesoreria");
    const p = anularPagoSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const db = await createSociosClient();
    const { error } = await db.rpc("anular_cobro_disciplina", { p_cobro: p.data.id, p_motivo: p.data.motivo });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar(p.data.disciplina_id);
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}

// ------------------------------------------------------------
// Planes de pago (tesorería)
// ------------------------------------------------------------

const centavos = (n: number) => Math.round(n * 100);

const planSchema = z
  .object({
    disciplina_id: id,
    pedidos: z.array(id).min(1, "Elegí al menos un pedido").max(200),
    importe: z.number().positive("El importe del plan tiene que ser mayor que cero").max(100_000_000),
    cuotas: z
      .array(
        z.object({
          vencimiento: fecha,
          importe: z.number().positive("Cada cuota tiene que ser mayor que cero").max(100_000_000),
        })
      )
      .min(1, "Armá al menos una cuota")
      .max(60, "Como máximo 60 cuotas"),
    descripcion: textoOpcional(200),
    notas: textoOpcional(1000),
  })
  .refine((d) => d.cuotas.every((c, i) => i === 0 || c.vencimiento >= d.cuotas[i - 1].vencimiento), {
    message: "Los vencimientos van en orden",
  })
  .refine((d) => d.cuotas.reduce((s, c) => s + centavos(c.importe), 0) === centavos(d.importe), {
    message: "Las cuotas tienen que sumar el importe del plan",
  });

export type PlanPagoInput = z.input<typeof planSchema>;

export async function crearPlanPago(input: PlanPagoInput): Promise<Resultado<number>> {
  try {
    await exigirPermisoSocios("puedeTesoreria");
    const p = planSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const d = p.data;
    const db = await createSociosClient();
    const { data, error } = await db.rpc("crear_plan_pago", {
      p_disciplina: d.disciplina_id,
      p_pedidos: [...new Set(d.pedidos)],
      p_cuotas: d.cuotas.map((c) => ({ vencimiento: c.vencimiento, importe: centavos(c.importe) / 100 })),
      p_importe: centavos(d.importe) / 100,
      p_descripcion: nulo(d.descripcion),
      p_notas: nulo(d.notas),
    });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar(d.disciplina_id);
    revalidatePath("/pedidos-disciplinas");
    return { ok: true, data };
  } catch (e) {
    return fallo(e);
  }
}

const cancelarPlanSchema = z.object({
  disciplina_id: id,
  id,
  motivo: z.string().trim().min(3, "Indicá el motivo").max(500),
});

export async function cancelarPlanPago(input: z.input<typeof cancelarPlanSchema>): Promise<Resultado> {
  try {
    await exigirPermisoSocios("puedeTesoreria");
    const p = cancelarPlanSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const db = await createSociosClient();
    const { error } = await db.rpc("cancelar_plan_pago", { p_plan: p.data.id, p_motivo: p.data.motivo });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar(p.data.disciplina_id);
    revalidatePath("/pedidos-disciplinas");
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}
