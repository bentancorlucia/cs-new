"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createContabilidadClient } from "@/lib/contabilidad/server";
import { exigirEscritura } from "@/lib/contabilidad/permisos";
import { hoyUruguay, mensajeError } from "@/lib/contabilidad/formato";
import { sincronizarCotizacionesBcu, type ResultadoSincronizacion } from "@/lib/contabilidad/bcu";

export type Resultado<T = undefined> =
  | ({ ok: true; error?: undefined } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

async function autorizar(): Promise<{ ok: false; error: string } | null> {
  try {
    await exigirEscritura();
    return null;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No autorizado" };
  }
}

function refrescar() {
  revalidatePath("/contabilidad/cotizaciones");
  // La revaluación y el cierre muestran la cotización disponible.
  revalidatePath("/contabilidad/ejercicios");
}

/** Trae los últimos 30 días del BCU con la sesión del usuario (la base exige tesorero). */
export async function actualizarDesdeBcu(): Promise<Resultado<ResultadoSincronizacion>> {
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  try {
    const db = await createContabilidadClient();
    const r = await sincronizarCotizacionesBcu(db, 30);
    refrescar();
    return { ok: true, data: r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo consultar al BCU" };
  }
}

const manualSchema = z.object({
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
    .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Fecha inválida")
    .refine((s) => s <= hoyUruguay(), "No se cargan cotizaciones de fechas futuras"),
  tasa: z
    .number({ message: "Tasa inválida" })
    .positive("La tasa tiene que ser mayor que cero")
    .max(1000, "La tasa parece incorrecta: son pesos por dólar"),
});

/**
 * Cotización manual: solo para días en que el BCU no publicó. La base
 * rechaza pisar una cotización BCU.
 */
export async function registrarCotizacionManual(input: {
  fecha: string;
  tasa: number;
}): Promise<Resultado> {
  const p = manualSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos inválidos" };
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const db = await createContabilidadClient();
  const { error } = await db.rpc("registrar_cotizacion", {
    p_moneda: "USD",
    p_fecha: p.data.fecha,
    p_tasa: Math.round(p.data.tasa * 1e6) / 1e6,
    p_fuente: "manual",
  });
  if (error) return { ok: false, error: mensajeError(error) };
  refrescar();
  return { ok: true };
}
