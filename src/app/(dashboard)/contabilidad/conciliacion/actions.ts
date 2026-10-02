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
const idNumerico = z.number().int().positive("Identificador inválido");
const fecha = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Fecha inválida");
const importe = z.number({ message: "Importe inválido" }).finite("Importe inválido");

async function autorizar(): Promise<{ ok: false; error: string } | null> {
  try {
    await exigirEscritura();
    return null;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No autorizado" };
  }
}

function invalido(error: z.ZodError): { ok: false; error: string } {
  const issue = error.issues[0];
  if (!issue) return { ok: false, error: "Datos inválidos" };
  // Ubica el error de un movimiento: "Movimiento 3: …"
  const [campo, fila] = issue.path;
  if (campo === "movimientos" && typeof fila === "number") {
    return { ok: false, error: `Movimiento ${fila + 1}: ${issue.message}` };
  }
  return { ok: false, error: issue.message };
}

/**
 * Registrar en libros crea asientos y la conciliación cambia lo que
 * muestran mayor y balances: se refresca todo el módulo.
 */
function refrescar() {
  revalidatePath("/contabilidad", "layout");
}

// ------------------------------------------------------------
// Extractos
// ------------------------------------------------------------

const importarSchema = z
  .object({
    cuentaId: uuid,
    desde: fecha,
    hasta: fecha,
    saldoInicial: importe,
    saldoFinal: importe,
    archivo: z.string().trim().max(200).nullable(),
    movimientos: z
      .array(
        z.object({
          fecha,
          concepto: z.string().trim().min(1, "falta el concepto").max(500, "concepto demasiado largo"),
          referencia: z.string().trim().max(200).nullable(),
          importe: importe.refine((n) => n !== 0, "falta el importe"),
          saldo: importe.nullable(),
        })
      )
      .max(5000, "Demasiados movimientos para un extracto"),
  })
  .refine((d) => d.hasta >= d.desde, { message: "La fecha final es anterior a la inicial" });

export type ImportarExtractoInput = z.input<typeof importarSchema>;

export async function importarExtracto(input: ImportarExtractoInput): Promise<Resultado<{ id: string }>> {
  const p = importarSchema.safeParse(input);
  if (!p.success) return invalido(p.error);
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const d = p.data;
  const db = await createContabilidadClient();
  const { data, error } = await db.rpc("importar_extracto", {
    p_cuenta: d.cuentaId,
    p_desde: d.desde,
    p_hasta: d.hasta,
    p_saldo_inicial: d.saldoInicial,
    p_saldo_final: d.saldoFinal,
    p_movimientos: d.movimientos.map((m) => ({
      fecha: m.fecha,
      concepto: m.concepto,
      referencia: m.referencia || null,
      importe: m.importe,
      saldo: m.saldo,
    })),
    p_archivo: d.archivo || undefined,
  });
  if (error) return { ok: false, error: mensajeError(error) };
  refrescar();
  return { ok: true, data: { id: data } };
}

export async function eliminarExtracto(extractoId: string): Promise<Resultado> {
  const p = uuid.safeParse(extractoId);
  if (!p.success) return invalido(p.error);
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const db = await createContabilidadClient();
  const { error } = await db.rpc("eliminar_extracto", { p_extracto: p.data });
  if (error) return { ok: false, error: mensajeError(error) };
  refrescar();
  return { ok: true };
}

export async function cerrarExtracto(extractoId: string): Promise<Resultado> {
  const p = uuid.safeParse(extractoId);
  if (!p.success) return invalido(p.error);
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const db = await createContabilidadClient();
  const { error } = await db.rpc("cerrar_extracto", { p_extracto: p.data });
  if (error) return { ok: false, error: mensajeError(error) };
  refrescar();
  return { ok: true };
}

export async function reabrirExtracto(extractoId: string): Promise<Resultado> {
  const p = uuid.safeParse(extractoId);
  if (!p.success) return invalido(p.error);
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const db = await createContabilidadClient();
  const { error } = await db.rpc("reabrir_extracto", { p_extracto: p.data });
  if (error) return { ok: false, error: mensajeError(error) };
  refrescar();
  return { ok: true };
}

// ------------------------------------------------------------
// Conciliación
// ------------------------------------------------------------

const conciliarSchema = z
  .object({
    extractoId: uuid,
    movimientos: z.array(idNumerico).max(1000),
    lineas: z.array(idNumerico).max(1000),
  })
  .refine((d) => d.movimientos.length + d.lineas.length > 0, { message: "Elegí qué conciliar" });

export async function conciliar(input: z.input<typeof conciliarSchema>): Promise<Resultado<{ id: number }>> {
  const p = conciliarSchema.safeParse(input);
  if (!p.success) return invalido(p.error);
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const db = await createContabilidadClient();
  const { data, error } = await db.rpc("conciliar", {
    p_extracto: p.data.extractoId,
    p_movimientos: p.data.movimientos,
    p_lineas: p.data.lineas,
  });
  if (error) return { ok: false, error: mensajeError(error) };
  refrescar();
  return { ok: true, data: { id: data } };
}

const sugerenciasSchema = z.object({
  extractoId: uuid,
  pares: z
    .array(z.object({ movimientoId: idNumerico, lineaId: idNumerico }))
    .min(1, "Elegí al menos una sugerencia")
    .max(1000),
});

/**
 * Concilia cada par 1 a 1. Sigue con los demás si alguno falla (por
 * ejemplo, porque alguien lo concilió mientras tanto) y devuelve cuántos
 * se aplicaron y el primer error.
 */
export async function aplicarSugerencias(
  input: z.input<typeof sugerenciasSchema>
): Promise<Resultado<{ aplicadas: number; fallidas: number; primerError: string | null }>> {
  const p = sugerenciasSchema.safeParse(input);
  if (!p.success) return invalido(p.error);
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const db = await createContabilidadClient();
  let aplicadas = 0;
  let fallidas = 0;
  let primerError: string | null = null;
  for (const par of p.data.pares) {
    const { error } = await db.rpc("conciliar", {
      p_extracto: p.data.extractoId,
      p_movimientos: [par.movimientoId],
      p_lineas: [par.lineaId],
    });
    if (error) {
      fallidas++;
      primerError ??= mensajeError(error);
    } else {
      aplicadas++;
    }
  }
  if (aplicadas > 0) refrescar();
  if (aplicadas === 0) return { ok: false, error: primerError ?? "No se pudo conciliar" };
  return { ok: true, data: { aplicadas, fallidas, primerError } };
}

export async function desconciliar(conciliacionId: number): Promise<Resultado> {
  const p = idNumerico.safeParse(conciliacionId);
  if (!p.success) return invalido(p.error);
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const db = await createContabilidadClient();
  const { error } = await db.rpc("desconciliar", { p_conciliacion: p.data });
  if (error) return { ok: false, error: mensajeError(error) };
  refrescar();
  return { ok: true };
}

const contabilizarSchema = z.object({
  movimientoId: idNumerico,
  contrapartidaId: uuid,
  descripcion: z.string().trim().max(500, "La descripción es demasiado larga"),
  centroCostoId: uuid.nullable(),
  proveedorId: idNumerico.nullable(),
  disciplinaId: idNumerico.nullable(),
});

/** Registra en los libros un movimiento del banco que no estaba y lo deja conciliado. */
export async function registrarEnLibros(
  input: z.input<typeof contabilizarSchema>
): Promise<Resultado<{ asientoId: string }>> {
  const p = contabilizarSchema.safeParse(input);
  if (!p.success) return invalido(p.error);
  const noAutorizado = await autorizar();
  if (noAutorizado) return noAutorizado;

  const d = p.data;
  const extra: Record<string, string | number> = {};
  if (d.centroCostoId) extra.centro_costo_id = d.centroCostoId;
  if (d.proveedorId) extra.proveedor_id = d.proveedorId;
  if (d.disciplinaId) extra.disciplina_id = d.disciplinaId;

  const db = await createContabilidadClient();
  const { data, error } = await db.rpc("contabilizar_movimiento_extracto", {
    p_movimiento: d.movimientoId,
    p_contrapartida: d.contrapartidaId,
    p_descripcion: d.descripcion || undefined,
    p_extra: extra,
  });
  if (error) {
    // Ya hay un asiento vigente generado desde este movimiento (se desconcilió).
    if (error.code === "23505" && error.message.includes("asientos_origen_unico")) {
      return {
        ok: false,
        error:
          "Este movimiento ya se registró en los libros: conciliálo con esa línea o revertí ese asiento antes de registrarlo de nuevo",
      };
    }
    return { ok: false, error: mensajeError(error) };
  }
  refrescar();
  return { ok: true, data: { asientoId: data } };
}
