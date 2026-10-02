"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createContabilidadClient } from "@/lib/contabilidad/server";
import { exigirEscritura, permisosContabilidad } from "@/lib/contabilidad/permisos";
import { mensajeError } from "@/lib/contabilidad/formato";
import {
  esFechaIso,
  leerFiltros,
  tcVigente,
  todosLosAsientos,
  type FiltrosLibro,
} from "@/lib/contabilidad/asientos";
import type { Json } from "@/types/contabilidad";

export type ResultadoAccion = { ok: boolean; error?: string; id?: string; numero?: number | null };

const RUTA = "/contabilidad/asientos";

function revalidar(...ids: (string | null | undefined)[]) {
  revalidatePath(RUTA);
  revalidatePath("/contabilidad");
  for (const id of ids) if (id) revalidatePath(`${RUTA}/${id}`);
}

function fallo(e: unknown): ResultadoAccion {
  if (e instanceof Error) return { ok: false, error: e.message };
  return { ok: false, error: "Error inesperado" };
}

const fecha = z.string().refine(esFechaIso, "Fecha inválida");
const uuid = z.uuid("Identificador inválido");

const lineaSchema = z.object({
  cuenta_id: z.uuid("Elegí la cuenta"),
  lado: z.enum(["debe", "haber"]),
  importe: z.number().finite().positive("El importe tiene que ser mayor que cero"),
  tc: z.number().finite().positive("Tipo de cambio inválido").nullable().optional(),
  descripcion: z.string().trim().max(500).nullable().optional(),
  centro_costo_id: z.uuid().nullable().optional(),
  proveedor_id: z.number().int().positive().nullable().optional(),
  disciplina_id: z.number().int().positive().nullable().optional(),
});

const asientoSchema = z.object({
  id: uuid.nullable(),
  fecha,
  descripcion: z.string().trim().min(1, "Escribí una descripción").max(500),
  tipo: z.enum(["manual", "apertura"]),
  confirmar: z.boolean(),
  lineas: z.array(lineaSchema).min(1, "El asiento no tiene líneas").max(500),
});

export type AsientoInput = z.input<typeof asientoSchema>;

export async function guardarAsiento(input: AsientoInput): Promise<ResultadoAccion> {
  try {
    await exigirEscritura();
    const p = asientoSchema.safeParse(input);
    if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos inválidos" };
    const d = p.data;

    if (d.confirmar) {
      if (d.lineas.length < 2) return { ok: false, error: "Un asiento necesita al menos dos líneas" };
    }

    // Solo mandamos lo que corresponde: la base rechaza auxiliares que la cuenta no lleva.
    const lineas = d.lineas.map((l) => {
      const o: Record<string, Json> = { cuenta_id: l.cuenta_id, lado: l.lado, importe: l.importe };
      if (l.tc) o.tc = l.tc;
      if (l.descripcion) o.descripcion = l.descripcion;
      if (l.centro_costo_id) o.centro_costo_id = l.centro_costo_id;
      if (l.proveedor_id) o.proveedor_id = l.proveedor_id;
      if (l.disciplina_id) o.disciplina_id = l.disciplina_id;
      return o;
    });

    const supabase = await createContabilidadClient();
    const { data: id, error } = await supabase.rpc("guardar_asiento", {
      // La función acepta NULL para crear uno nuevo (el tipo generado no lo refleja).
      p_id: d.id as string,
      p_fecha: d.fecha,
      p_descripcion: d.descripcion,
      p_lineas: lineas,
      p_confirmar: d.confirmar,
      p_tipo: d.tipo,
    });
    if (error) return { ok: false, error: mensajeError(error) };

    let numero: number | null = null;
    if (d.confirmar) {
      const { data } = await supabase.from("asientos").select("numero").eq("id", id).maybeSingle();
      numero = data?.numero ?? null;
    }

    revalidar(id);
    return { ok: true, id, numero };
  } catch (e) {
    return fallo(e);
  }
}

export async function confirmarAsiento(id: string): Promise<ResultadoAccion> {
  try {
    await exigirEscritura();
    if (!uuid.safeParse(id).success) return { ok: false, error: "Asiento inválido" };
    const supabase = await createContabilidadClient();
    const { data, error } = await supabase.rpc("confirmar_asiento", { p_id: id });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar(id);
    return { ok: true, id, numero: data };
  } catch (e) {
    return fallo(e);
  }
}

export async function eliminarBorrador(id: string): Promise<ResultadoAccion> {
  try {
    await exigirEscritura();
    if (!uuid.safeParse(id).success) return { ok: false, error: "Asiento inválido" };
    const supabase = await createContabilidadClient();
    const { error } = await supabase.rpc("eliminar_borrador", { p_id: id });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar(id);
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

const reversionSchema = z.object({
  id: uuid,
  motivo: z.string().trim().min(3, "Indicá el motivo de la reversión").max(500),
  fecha,
});

export async function revertirAsiento(input: z.input<typeof reversionSchema>): Promise<ResultadoAccion> {
  try {
    await exigirEscritura();
    const p = reversionSchema.safeParse(input);
    if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos inválidos" };
    const supabase = await createContabilidadClient();
    const { data, error } = await supabase.rpc("revertir_asiento", {
      p_id: p.data.id,
      p_motivo: p.data.motivo,
      p_fecha: p.data.fecha,
    });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar(p.data.id, data);
    return { ok: true, id: data };
  } catch (e) {
    return fallo(e);
  }
}

/** Solo lectura: TC del día hábil anterior a la fecha (null si no hay cotización). */
export async function obtenerTcVigente(
  fechaIso: string,
  moneda = "USD"
): Promise<{ ok: boolean; tc: number | null; error?: string }> {
  try {
    const { puedeLeer } = await permisosContabilidad();
    if (!puedeLeer) return { ok: false, tc: null, error: "No autorizado" };
    if (!esFechaIso(fechaIso) || !/^[A-Z]{3}$/.test(moneda)) return { ok: false, tc: null, error: "Fecha inválida" };
    return { ok: true, tc: await tcVigente(fechaIso, moneda) };
  } catch (e) {
    return { ok: false, tc: null, error: e instanceof Error ? e.message : "Error inesperado" };
  }
}

export type FilaExportacion = {
  fecha: string;
  numero: number | null;
  tipo: string;
  estado: string;
  asiento: string;
  revertido: boolean;
  codigo: string;
  cuenta: string;
  detalle: string;
  debe: number;
  haber: number;
  moneda: string;
  importe_origen: number | null;
  tc: number | null;
};

/** Solo lectura: todas las líneas del rango filtrado del libro diario. */
export async function exportarLibroDiario(
  f: FiltrosLibro
): Promise<{ ok: boolean; filas?: FilaExportacion[]; error?: string }> {
  try {
    const { puedeLeer } = await permisosContabilidad();
    if (!puedeLeer) return { ok: false, error: "No autorizado" };
    if (!esFechaIso(f?.desde) || !esFechaIso(f?.hasta)) return { ok: false, error: "Rango inválido" };
    // Normaliza lo que viene del cliente con las mismas reglas que la página.
    const filtros = leerFiltros({
      desde: f.desde,
      hasta: f.hasta,
      estado: f.estado ?? undefined,
      tipo: f.tipo ?? undefined,
      q: typeof f.q === "string" ? f.q : "",
    });
    const asientos = await todosLosAsientos(filtros);
    const filas: FilaExportacion[] = [];
    for (const a of asientos) {
      for (const l of a.lineas) {
        filas.push({
          fecha: a.fecha,
          numero: a.numero,
          tipo: a.tipo,
          estado: a.estado,
          asiento: a.descripcion,
          revertido: !!a.revertido_por_id,
          codigo: l.cuenta_codigo,
          cuenta: l.cuenta_nombre,
          detalle: l.descripcion ?? "",
          debe: l.debe,
          haber: l.haber,
          moneda: l.moneda ?? "UYU",
          importe_origen: l.importe_origen,
          tc: l.tc,
        });
      }
    }
    return { ok: true, filas };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error inesperado" };
  }
}
