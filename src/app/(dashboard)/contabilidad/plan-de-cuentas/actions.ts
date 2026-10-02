"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createContabilidadClient, type ContabilidadClient } from "@/lib/contabilidad/server";
import { exigirEscritura } from "@/lib/contabilidad/permisos";
import { mensajeError } from "@/lib/contabilidad/formato";
import { admiteMonedaExtranjera } from "@/lib/contabilidad/plan-cuentas";
import type { Database } from "@/types/contabilidad";

type CuentaUpdate = Database["contabilidad"]["Tables"]["cuentas"]["Update"];

export type ResultadoAccion<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

const RUTA = "/contabilidad/plan-de-cuentas";

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

async function autorizar(): Promise<{ ok: false; error: string } | null> {
  try {
    await exigirEscritura();
    return null;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No autorizado" };
  }
}

function errorValidacion(error: z.ZodError): { ok: false; error: string } {
  return { ok: false, error: error.issues[0]?.message ?? "Datos inválidos" };
}

/** Traduce los errores de constraint que Postgres devuelve en inglés. */
function errorBase(
  error: { message?: string; code?: string } | null,
  contexto: "cuenta" | "centro"
): { ok: false; error: string } {
  if (error?.code === "23505") {
    return {
      ok: false,
      error:
        contexto === "cuenta"
          ? "Ya existe una cuenta con ese código"
          : "Ya existe un centro de costo con ese código",
    };
  }
  if (error?.code === "23503") {
    return {
      ok: false,
      error:
        contexto === "cuenta"
          ? "La cuenta está referenciada (subcuentas, movimientos o procesos automáticos) y no se puede eliminar"
          : "El centro de costo está en uso",
    };
  }
  if (error?.code === "23514") {
    return { ok: false, error: "La combinación de opciones no es válida para esta cuenta" };
  }
  return { ok: false, error: mensajeError(error) };
}

async function tieneMovimientos(supabase: ContabilidadClient, cuentaId: string) {
  const { count, error } = await supabase
    .from("lineas")
    .select("id", { count: "exact", head: true })
    .eq("cuenta_id", cuentaId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

async function tieneHijas(supabase: ContabilidadClient, cuentaId: string) {
  const { count, error } = await supabase
    .from("cuentas")
    .select("id", { count: "exact", head: true })
    .eq("padre_id", cuentaId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

// ------------------------------------------------------------------
// Esquemas
// ------------------------------------------------------------------

const textoOpcional = z
  .string()
  .trim()
  .max(500, "La descripción es muy larga")
  .optional()
  .transform((v) => (v ? v : null));

const flagsCuenta = {
  nombre: z.string().trim().min(1, "Escribí un nombre").max(120, "El nombre es muy largo"),
  descripcion: textoOpcional,
  imputable: z.boolean(),
  naturaleza: z.enum(["deudora", "acreedora"]),
  moneda: z.enum(["UYU", "USD"]),
  /** Solo cuenta si la moneda es USD: partida monetaria que se ajusta al cierre. */
  revalua: z.boolean(),
  es_disponibilidad: z.boolean(),
  requiere_auxiliar: z.enum(["ninguno", "proveedor", "disciplina"]),
  requiere_centro_costo: z.boolean(),
};

const crearCuentaSchema = z.object({
  padre_id: z.uuid("Cuenta padre inválida"),
  codigo: z
    .string()
    .trim()
    .regex(/^[1-5](\.[0-9]{1,3})*$/, "El código tiene que ser del tipo 1.1.01.07"),
  ...flagsCuenta,
});

const editarCuentaSchema = z.object({
  id: z.uuid("Cuenta inválida"),
  activa: z.boolean(),
  ...flagsCuenta,
});

export type CuentaFormInput = z.input<typeof crearCuentaSchema>;
export type EditarCuentaInput = z.input<typeof editarCuentaSchema>;

type Flags = z.output<z.ZodObject<typeof flagsCuenta>>;

/** Aplica las reglas del plan para que la base no rechace combinaciones imposibles. */
function normalizarFlags(f: Flags, clase: Database["contabilidad"]["Enums"]["clase_cuenta"]) {
  if (!f.imputable) {
    return {
      imputable: false,
      moneda: null,
      es_disponibilidad: false,
      revalua: false,
      requiere_auxiliar: null,
      requiere_centro_costo: false,
    } satisfies CuentaUpdate;
  }
  const moneda = f.moneda === "USD" && admiteMonedaExtranjera(clase) ? "USD" : null;
  return {
    imputable: true,
    moneda,
    // Las partidas no monetarias en USD (ej. anticipos) no se revalúan.
    revalua: moneda !== null && f.revalua,
    es_disponibilidad: clase === "activo" ? f.es_disponibilidad : false,
    requiere_auxiliar: f.requiere_auxiliar === "ninguno" ? null : f.requiere_auxiliar,
    requiere_centro_costo: f.requiere_centro_costo,
  } satisfies CuentaUpdate;
}

// ------------------------------------------------------------------
// Cuentas
// ------------------------------------------------------------------

export async function crearCuenta(input: CuentaFormInput): Promise<ResultadoAccion> {
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const parsed = crearCuentaSchema.safeParse(input);
  if (!parsed.success) return errorValidacion(parsed.error);
  const datos = parsed.data;

  const supabase = await createContabilidadClient();
  const { data: padre, error: errorPadre } = await supabase
    .from("cuentas")
    .select("id, codigo, clase, imputable")
    .eq("id", datos.padre_id)
    .maybeSingle();
  if (errorPadre) return errorBase(errorPadre, "cuenta");
  if (!padre) return { ok: false, error: "La cuenta padre no existe" };
  if (padre.imputable) {
    return {
      ok: false,
      error: `La cuenta ${padre.codigo} es imputable: convertila en agrupadora antes de agregarle subcuentas`,
    };
  }
  const resto = datos.codigo.slice(padre.codigo.length + 1);
  if (!datos.codigo.startsWith(`${padre.codigo}.`) || resto.length === 0 || resto.includes(".")) {
    return {
      ok: false,
      error: `El código tiene que colgar directamente de ${padre.codigo} (ej. ${padre.codigo}.01)`,
    };
  }

  // nivel y clase los deriva el trigger a partir del padre.
  const { error } = await supabase.from("cuentas").insert({
    padre_id: padre.id,
    codigo: datos.codigo,
    nombre: datos.nombre,
    descripcion: datos.descripcion,
    nivel: 0,
    clase: padre.clase,
    naturaleza: datos.naturaleza,
    ...normalizarFlags(datos, padre.clase),
  });
  if (error) return errorBase(error, "cuenta");

  revalidatePath(RUTA);
  return { ok: true };
}

export async function editarCuenta(input: EditarCuentaInput): Promise<ResultadoAccion> {
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const parsed = editarCuentaSchema.safeParse(input);
  if (!parsed.success) return errorValidacion(parsed.error);
  const datos = parsed.data;

  const supabase = await createContabilidadClient();
  const { data: actual, error: errorActual } = await supabase
    .from("cuentas")
    .select("id, codigo, clase, naturaleza, imputable, moneda, requiere_auxiliar")
    .eq("id", datos.id)
    .maybeSingle();
  if (errorActual) return errorBase(errorActual, "cuenta");
  if (!actual) return { ok: false, error: "La cuenta no existe" };

  const flags = normalizarFlags(datos, actual.clase);

  try {
    if (flags.imputable && !actual.imputable && (await tieneHijas(supabase, actual.id))) {
      return {
        ok: false,
        error: `La cuenta ${actual.codigo} tiene subcuentas: no puede ser imputable`,
      };
    }
    if (await tieneMovimientos(supabase, actual.id)) {
      const cambiaAlgoFijo =
        datos.naturaleza !== actual.naturaleza ||
        flags.imputable !== actual.imputable ||
        flags.moneda !== (actual.moneda ?? null) ||
        flags.requiere_auxiliar !== (actual.requiere_auxiliar ?? null);
      if (cambiaAlgoFijo) {
        return {
          ok: false,
          error: `La cuenta ${actual.codigo} tiene movimientos: no se puede cambiar su naturaleza, moneda, imputabilidad ni auxiliar`,
        };
      }
    }
  } catch (e) {
    return errorBase(e as { message?: string; code?: string }, "cuenta");
  }

  const { error } = await supabase
    .from("cuentas")
    .update({
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      activa: datos.activa,
      naturaleza: datos.naturaleza,
      ...flags,
    })
    .eq("id", actual.id);
  if (error) return errorBase(error, "cuenta");

  revalidatePath(RUTA);
  return { ok: true };
}

export async function convertirEnAgrupadora(id: string): Promise<ResultadoAccion> {
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return { ok: false, error: "Cuenta inválida" };

  const supabase = await createContabilidadClient();
  try {
    if (await tieneMovimientos(supabase, parsedId.data)) {
      return {
        ok: false,
        error: "La cuenta tiene movimientos: no se puede convertir en agrupadora",
      };
    }
  } catch (e) {
    return errorBase(e as { message?: string; code?: string }, "cuenta");
  }

  const { error } = await supabase
    .from("cuentas")
    .update({
      imputable: false,
      moneda: null,
      es_disponibilidad: false,
      revalua: false,
      requiere_auxiliar: null,
      requiere_centro_costo: false,
    })
    .eq("id", parsedId.data);
  if (error) return errorBase(error, "cuenta");

  revalidatePath(RUTA);
  return { ok: true };
}

export async function eliminarCuenta(id: string): Promise<ResultadoAccion> {
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return { ok: false, error: "Cuenta inválida" };
  const cuentaId = parsedId.data;

  const supabase = await createContabilidadClient();
  try {
    if (await tieneHijas(supabase, cuentaId)) {
      return { ok: false, error: "La cuenta tiene subcuentas: eliminá primero las subcuentas" };
    }
    if (await tieneMovimientos(supabase, cuentaId)) {
      return {
        ok: false,
        error: "La cuenta tiene movimientos: no se puede eliminar. Podés desactivarla.",
      };
    }
  } catch (e) {
    return errorBase(e as { message?: string; code?: string }, "cuenta");
  }

  const [{ count: enSistema }, { count: enParametros }] = await Promise.all([
    supabase
      .from("cuentas_sistema")
      .select("rol", { count: "exact", head: true })
      .eq("cuenta_id", cuentaId),
    supabase
      .from("parametros_cuentas")
      .select("id", { count: "exact", head: true })
      .eq("cuenta_id", cuentaId),
  ]);
  if ((enSistema ?? 0) > 0) {
    return { ok: false, error: "Es una cuenta de sistema: no se puede eliminar" };
  }
  if ((enParametros ?? 0) > 0) {
    return {
      ok: false,
      error: "La cuenta la usa un proceso automático (tienda, cuotas…): no se puede eliminar",
    };
  }

  const { error } = await supabase.from("cuentas").delete().eq("id", cuentaId);
  if (error) return errorBase(error, "cuenta");

  revalidatePath(RUTA);
  return { ok: true };
}

// ------------------------------------------------------------------
// Centros de costo
// ------------------------------------------------------------------

const crearCentroSchema = z.object({
  codigo: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(
      z
        .string()
        .min(1, "Escribí un código")
        .max(20, "El código es muy largo")
        .regex(/^[A-Z0-9-]+$/, "El código solo admite letras, números y guiones")
    ),
  nombre: z.string().trim().min(1, "Escribí un nombre").max(80, "El nombre es muy largo"),
});

export type CentroCostoInput = z.input<typeof crearCentroSchema>;

export async function crearCentroCosto(input: CentroCostoInput): Promise<ResultadoAccion> {
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const parsed = crearCentroSchema.safeParse(input);
  if (!parsed.success) return errorValidacion(parsed.error);

  const supabase = await createContabilidadClient();
  const { error } = await supabase.from("centros_costo").insert(parsed.data);
  if (error) return errorBase(error, "centro");

  revalidatePath(RUTA);
  return { ok: true };
}

export async function cambiarEstadoCentro(id: string, activo: boolean): Promise<ResultadoAccion> {
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const parsed = z.object({ id: z.uuid(), activo: z.boolean() }).safeParse({ id, activo });
  if (!parsed.success) return { ok: false, error: "Centro de costo inválido" };

  const supabase = await createContabilidadClient();
  const { error } = await supabase
    .from("centros_costo")
    .update({ activo: parsed.data.activo })
    .eq("id", parsed.data.id);
  if (error) return errorBase(error, "centro");

  revalidatePath(RUTA);
  return { ok: true };
}

export async function sincronizarCentros(): Promise<ResultadoAccion<{ creados: number }>> {
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const supabase = await createContabilidadClient();
  const { data, error } = await supabase.rpc("sincronizar_centros_disciplinas");
  if (error) return errorBase(error, "centro");

  revalidatePath(RUTA);
  return { ok: true, data: { creados: Number(data ?? 0) } };
}
