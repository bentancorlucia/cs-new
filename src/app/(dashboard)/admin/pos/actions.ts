"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirOperador } from "@/lib/comercial/server";
import {
  createCajaClient,
  leerCaja,
  leerEstadoCaja,
  type EstadoCaja,
} from "@/lib/comercial/caja";
import { mensajeError } from "@/lib/contabilidad/formato";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CategoriaPos, ProductoPos, SocioPos } from "@/components/pos/tipos";
import { catalogoPos } from "./datos";

export type ResultadoCaja = {
  ok: boolean;
  error?: string;
  /** Diferencia del arqueo: positiva = sobrante, negativa = faltante. */
  diferencia?: number;
  estado?: EstadoCaja;
};

function fallo(e: unknown): ResultadoCaja {
  return { ok: false, error: e instanceof Error ? e.message : "Error inesperado" };
}

function revalidar() {
  revalidatePath("/admin/pos");
  revalidatePath("/admin/pos/caja");
}

const importe = z
  .number({ error: "Indicá el importe" })
  .finite()
  .min(0, "El importe no puede ser negativo")
  .max(100_000_000, "Importe fuera de rango")
  .transform((n) => Math.round(n * 100) / 100);

const notas = z.string().trim().max(2000).optional().nullable();

// ------------------------------------------------------------
// Caja
// ------------------------------------------------------------

export async function abrirCaja(input: { contado: number; notas?: string | null }): Promise<ResultadoCaja> {
  try {
    await exigirOperador();
    const p = z.object({ contado: importe, notas }).safeParse(input);
    if (!p.success) return { ok: false, error: p.error.issues[0]?.message };
    const caja = await leerCaja();
    if (!caja) return { ok: false, error: "No hay una caja activa configurada" };
    const db = await createCajaClient();
    const { data: sesionId, error } = await db.rpc("abrir_caja", {
      p_caja: caja.id,
      p_contado: p.data.contado,
      p_notas: p.data.notas || null,
    });
    if (error) return { ok: false, error: mensajeError(error) };
    const { data: s } = await db
      .from("caja_sesiones")
      .select("saldo_inicial, contado_inicial")
      .eq("id", sesionId)
      .maybeSingle();
    revalidar();
    return {
      ok: true,
      diferencia: s ? Number(s.contado_inicial) - Number(s.saldo_inicial) : 0,
      estado: await leerEstadoCaja(),
    };
  } catch (e) {
    return fallo(e);
  }
}

const movimientoSchema = z
  .object({
    sesion: z.number().int().positive(),
    tipo: z.enum(["deposito_banco", "retiro", "ingreso", "gasto"]),
    importe: importe.refine((n) => n > 0, "El importe tiene que ser mayor que cero"),
    cuenta_id: z.uuid("Elegí la cuenta"),
    descripcion: z.string().trim().min(3, "Escribí una descripción (mínimo 3 letras)").max(500),
    centro_costo_id: z.uuid().optional().nullable(),
  });

export async function registrarMovimientoCaja(
  input: z.input<typeof movimientoSchema>
): Promise<ResultadoCaja> {
  try {
    await exigirOperador();
    const p = movimientoSchema.safeParse(input);
    if (!p.success) return { ok: false, error: p.error.issues[0]?.message };
    const db = await createCajaClient();
    const { error } = await db.rpc("movimiento_caja", {
      p_sesion: p.data.sesion,
      p_tipo: p.data.tipo,
      p_importe: p.data.importe,
      p_cuenta_contrapartida: p.data.cuenta_id,
      p_descripcion: p.data.descripcion,
      p_centro_costo: p.data.centro_costo_id || null,
    });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar();
    return { ok: true, estado: await leerEstadoCaja() };
  } catch (e) {
    return fallo(e);
  }
}

export async function cerrarCaja(input: {
  sesion: number;
  contado: number;
  notas?: string | null;
}): Promise<ResultadoCaja> {
  try {
    await exigirOperador();
    const p = z.object({ sesion: z.number().int().positive(), contado: importe, notas }).safeParse(input);
    if (!p.success) return { ok: false, error: p.error.issues[0]?.message };
    const db = await createCajaClient();
    const { data, error } = await db.rpc("cerrar_caja", {
      p_sesion: p.data.sesion,
      p_contado: p.data.contado,
      p_notas: p.data.notas || null,
    });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar();
    return { ok: true, diferencia: Number(data ?? 0), estado: await leerEstadoCaja() };
  } catch (e) {
    return fallo(e);
  }
}

export async function refrescarCaja(): Promise<ResultadoCaja> {
  try {
    await exigirOperador();
    return { ok: true, estado: await leerEstadoCaja() };
  } catch (e) {
    return fallo(e);
  }
}

// ------------------------------------------------------------
// Venta
// ------------------------------------------------------------

export async function refrescarCatalogo(): Promise<
  { ok: true; productos: ProductoPos[]; categorias: CategoriaPos[] } | { ok: false; error: string }
> {
  try {
    await exigirOperador();
    return { ok: true, ...(await catalogoPos()) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error inesperado" };
  }
}

/** Socio por cédula (con o sin puntos y guion). */
export async function buscarSocio(
  cedula: string
): Promise<{ ok: true; socio: SocioPos } | { ok: false; error: string }> {
  try {
    await exigirOperador();
    const texto = String(cedula ?? "").trim().slice(0, 20);
    const digitos = texto.replace(/\D/g, "");
    if (digitos.length < 6) return { ok: false, error: "Ingresá una cédula válida" };
    const formateada =
      digitos.length >= 7
        ? `${digitos.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${digitos.slice(-1)}`
        : digitos;
    const candidatos = [...new Set([texto, digitos, formateada])];
    const { data, error } = await createAdminClient()
      .from("perfiles")
      .select("id, nombre, apellido, cedula, es_socio")
      .in("cedula", candidatos)
      .limit(1);
    if (error) return { ok: false, error: mensajeError(error) };
    const p = data?.[0];
    if (!p) return { ok: false, error: "No se encontró nadie con esa cédula" };
    return {
      ok: true,
      socio: {
        id: p.id,
        nombre: p.nombre ?? "",
        apellido: p.apellido ?? "",
        cedula: p.cedula,
        es_socio: p.es_socio === true,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error inesperado" };
  }
}
