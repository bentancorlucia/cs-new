"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createComercialClient, exigirOperador } from "@/lib/comercial/server";
import { mensajeError } from "@/lib/contabilidad/formato";
import {
  anularSchema,
  aplicarSchema,
  documentoSchema,
  esFecha,
  ordenCompraSchema,
  ordenPagoSchema,
  pagarSchema,
  recepcionSchema,
  type DocumentoInput,
  type OrdenCompraInput,
  type OrdenPagoInput,
  type RecepcionInput,
} from "@/lib/comercial/compras-esquemas";
import { sendOrdenCompraProveedor } from "@/lib/email/send";
import {
  datosPdfOrdenCompra,
  documentosPendientes,
  pendientesDeFacturar,
  permisosCompras,
  tcVigenteCompras,
  type DocumentoCC,
  type PendienteFacturar,
} from "@/lib/comercial/compras";
import type { Json } from "@/types/comercial";

export type Resultado<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

function fallo(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Error inesperado" };
}

function invalido(issues: { message: string }[]): { ok: false; error: string } {
  return { ok: false, error: issues[0]?.message ?? "Datos inválidos" };
}

function revalidar(...rutas: string[]) {
  revalidatePath("/admin/compras", "layout");
  revalidatePath("/admin/proveedores", "layout");
  for (const r of rutas) revalidatePath(r);
}

/** La función acepta NULL aunque el tipo generado diga number/string. */
const nulo = <T,>(v: T | null | undefined) => (v ?? null) as T;

// ------------------------------------------------------------
// Lecturas para los formularios
// ------------------------------------------------------------

export async function leerTcVigente(fecha: string, moneda: string): Promise<Resultado<number | null>> {
  try {
    const { puedeVer } = await permisosCompras();
    if (!puedeVer) return { ok: false, error: "No autorizado" };
    if (!esFecha(fecha) || !/^[A-Z]{3}$/.test(moneda)) return { ok: false, error: "Fecha inválida" };
    return { ok: true, data: await tcVigenteCompras(fecha, moneda) };
  } catch (e) {
    return fallo(e);
  }
}

export async function leerPendientesDeFacturar(proveedorId: number): Promise<Resultado<PendienteFacturar[]>> {
  try {
    const { puedeVer } = await permisosCompras();
    if (!puedeVer) return { ok: false, error: "No autorizado" };
    if (!Number.isInteger(proveedorId) || proveedorId <= 0) return { ok: false, error: "Proveedor inválido" };
    return { ok: true, data: await pendientesDeFacturar(proveedorId) };
  } catch (e) {
    return fallo(e);
  }
}

export async function leerDocumentosPendientes(
  proveedorId: number,
  moneda?: string
): Promise<Resultado<DocumentoCC[]>> {
  try {
    const { puedeVer } = await permisosCompras();
    if (!puedeVer) return { ok: false, error: "No autorizado" };
    if (!Number.isInteger(proveedorId) || proveedorId <= 0) return { ok: false, error: "Proveedor inválido" };
    return { ok: true, data: await documentosPendientes(proveedorId, moneda) };
  } catch (e) {
    return fallo(e);
  }
}

// ------------------------------------------------------------
// Órdenes de compra
// ------------------------------------------------------------

export async function guardarOrdenCompra(input: OrdenCompraInput): Promise<Resultado<number>> {
  try {
    await exigirOperador();
    const p = ordenCompraSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const d = p.data;
    const com = await createComercialClient();
    const { data, error } = await com.rpc("guardar_orden_compra", {
      p_id: nulo(d.id),
      p_proveedor: d.proveedor_id,
      p_fecha: d.fecha,
      p_moneda: d.moneda,
      p_items: d.items.map((i) => ({
        producto_id: i.producto_id,
        variante_id: i.variante_id,
        cantidad: i.cantidad,
        costo_unitario: i.costo_unitario,
      })) as Json,
      p_notas: d.notas ?? undefined,
    });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar(`/admin/compras/ordenes/${data}`);
    return { ok: true, data };
  } catch (e) {
    return fallo(e);
  }
}

export async function aprobarOrdenCompra(id: number): Promise<Resultado> {
  try {
    await exigirOperador();
    if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Orden inválida" };
    const com = await createComercialClient();
    const { error } = await com.rpc("aprobar_orden_compra", { p_id: id });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar(`/admin/compras/ordenes/${id}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}

export async function cancelarOrdenCompra(id: number): Promise<Resultado> {
  try {
    await exigirOperador();
    if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Orden inválida" };
    const com = await createComercialClient();
    const { error } = await com.rpc("cancelar_orden_compra", { p_id: id });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar(`/admin/compras/ordenes/${id}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}

const envioOrdenSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email inválido").max(200),
  mensaje: z.string().trim().max(2000, "El mensaje es muy largo").default(""),
});

/** Manda la orden al proveedor por mail con el PDF adjunto (sale por la cola de Comunicaciones). */
export async function enviarOrdenCompra(id: number, input: { email: string; mensaje?: string }): Promise<Resultado> {
  try {
    await exigirOperador();
    if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Orden inválida" };
    const p = envioOrdenSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const pdf = await datosPdfOrdenCompra(id);
    if (!pdf) return { ok: false, error: "Orden inexistente" };
    if (pdf.estado === "borrador") return { ok: false, error: "Aprobá la orden antes de mandarla al proveedor" };
    if (pdf.estado === "cancelada") return { ok: false, error: "La orden está cancelada" };
    const ok = await sendOrdenCompraProveedor(p.data.email, { ordenId: id, mensaje: p.data.mensaje, pdf });
    if (!ok) return { ok: false, error: "No se pudo encolar el mail. Probá de nuevo." };
    revalidatePath(`/admin/compras/ordenes/${id}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}

// ------------------------------------------------------------
// Recepciones
// ------------------------------------------------------------

export async function recibirMercaderia(input: RecepcionInput): Promise<Resultado<number>> {
  try {
    await exigirOperador();
    const p = recepcionSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const d = p.data;
    const items = d.items.map((i) =>
      d.orden_id
        ? { orden_item_id: i.orden_item_id, cantidad: i.cantidad, costo_unitario: i.costo_unitario }
        : { producto_id: i.producto_id, variante_id: i.variante_id, cantidad: i.cantidad, costo_unitario: i.costo_unitario }
    );
    const com = await createComercialClient();
    const { data, error } = await com.rpc("recibir_mercaderia", {
      p_proveedor: d.proveedor_id,
      p_orden: nulo(d.orden_id),
      p_fecha: d.fecha,
      p_moneda: d.moneda,
      p_items: items as Json,
      p_remito: d.remito ?? undefined,
      p_tc: d.moneda === "UYU" ? undefined : d.tc ?? undefined,
      p_idempotency_key: d.idempotency_key,
    });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar(`/admin/compras/recepciones/${data}`, ...(d.orden_id ? [`/admin/compras/ordenes/${d.orden_id}`] : []));
    return { ok: true, data };
  } catch (e) {
    return fallo(e);
  }
}

// ------------------------------------------------------------
// Documentos del proveedor
// ------------------------------------------------------------

export async function registrarDocumento(input: DocumentoInput): Promise<Resultado<number>> {
  try {
    await exigirOperador();
    const p = documentoSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const d = p.data;
    const lineas = d.lineas.map((l) => {
      if (l.tipo === "recepcion") {
        return { tipo: l.tipo, recepcion_item_id: l.recepcion_item_id, cantidad: l.cantidad, importe: l.importe };
      }
      if (l.tipo === "gasto") {
        const o: Record<string, Json> = { tipo: l.tipo, cuenta_id: l.cuenta_id, importe: l.importe };
        if (l.centro_costo_id) o.centro_costo_id = l.centro_costo_id;
        if (l.descripcion) o.descripcion = l.descripcion;
        return o;
      }
      return {
        tipo: l.tipo,
        producto_id: l.producto_id,
        variante_id: l.variante_id,
        cantidad: l.cantidad,
        importe: l.importe,
      };
    });
    const com = await createComercialClient();
    const { data, error } = await com.rpc("registrar_documento_proveedor", {
      p_proveedor: d.proveedor_id,
      p_tipo: d.tipo,
      p_serie: d.serie,
      p_numero: d.numero,
      p_fecha: d.fecha,
      p_moneda: d.moneda,
      p_lineas: lineas as Json,
      p_vencimiento: d.vencimiento ?? undefined,
      p_tc: d.moneda === "UYU" ? undefined : d.tc ?? undefined,
      p_cuenta_pago: d.cuenta_pago_id ?? undefined,
      p_notas: d.notas ?? undefined,
    });
    if (error) {
      if (error.code === "23505") return { ok: false, error: "Ya hay un documento de este proveedor con esa serie y número" };
      return { ok: false, error: mensajeError(error) };
    }
    revalidar(`/admin/compras/documentos/${data}`);
    return { ok: true, data };
  } catch (e) {
    return fallo(e);
  }
}

export async function anularDocumento(input: { id: number; motivo: string }): Promise<Resultado> {
  try {
    await exigirOperador();
    const p = anularSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const com = await createComercialClient();
    const { error } = await com.rpc("anular_documento_proveedor", { p_id: p.data.id, p_motivo: p.data.motivo });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar(`/admin/compras/documentos/${p.data.id}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}

export async function aplicarNotaCredito(input: {
  origen_id: number;
  documento_id: number;
  importe: number;
}): Promise<Resultado<number>> {
  try {
    await exigirOperador();
    const p = aplicarSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const com = await createComercialClient();
    const { data, error } = await com.rpc("aplicar_nota_credito", {
      p_nota: p.data.origen_id,
      p_documento: p.data.documento_id,
      p_importe: p.data.importe,
    });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar(`/admin/compras/documentos/${p.data.origen_id}`, `/admin/compras/documentos/${p.data.documento_id}`);
    return { ok: true, data };
  } catch (e) {
    return fallo(e);
  }
}

// ------------------------------------------------------------
// Órdenes de pago
// ------------------------------------------------------------

export async function crearOrdenPago(input: OrdenPagoInput): Promise<Resultado<number>> {
  try {
    await exigirOperador();
    const p = ordenPagoSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const d = p.data;
    const com = await createComercialClient();
    const { data, error } = await com.rpc("crear_orden_pago", {
      p_proveedor: d.proveedor_id,
      p_moneda: d.moneda,
      p_importe: d.importe,
      p_cuenta_pago: d.cuenta_pago_id,
      p_aplicaciones: d.aplicaciones as Json,
      p_referencia: d.referencia ?? undefined,
      p_notas: d.notas ?? undefined,
    });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar(`/admin/compras/pagos/${data}`);
    return { ok: true, data };
  } catch (e) {
    return fallo(e);
  }
}

export async function pagarOrden(input: { id: number; fecha: string; tc?: number | null }): Promise<Resultado<string>> {
  try {
    await exigirOperador();
    const p = pagarSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const com = await createComercialClient();
    const { data, error } = await com.rpc("pagar_orden", {
      p_id: p.data.id,
      p_fecha: p.data.fecha,
      p_tc: p.data.tc ?? undefined,
    });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar(`/admin/compras/pagos/${p.data.id}`);
    return { ok: true, data };
  } catch (e) {
    return fallo(e);
  }
}

export async function anularOrdenPago(input: { id: number; motivo: string }): Promise<Resultado> {
  try {
    await exigirOperador();
    const p = anularSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const com = await createComercialClient();
    const { error } = await com.rpc("anular_orden_pago", { p_id: p.data.id, p_motivo: p.data.motivo });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar(`/admin/compras/pagos/${p.data.id}`);
    return { ok: true, data: undefined };
  } catch (e) {
    return fallo(e);
  }
}

export async function aplicarAnticipo(input: {
  origen_id: number;
  documento_id: number;
  importe: number;
}): Promise<Resultado<number>> {
  try {
    await exigirOperador();
    const p = aplicarSchema.safeParse(input);
    if (!p.success) return invalido(p.error.issues);
    const com = await createComercialClient();
    const { data, error } = await com.rpc("aplicar_anticipo", {
      p_pago: p.data.origen_id,
      p_documento: p.data.documento_id,
      p_importe: p.data.importe,
    });
    if (error) return { ok: false, error: mensajeError(error) };
    revalidar(`/admin/compras/pagos/${p.data.origen_id}`, `/admin/compras/documentos/${p.data.documento_id}`);
    return { ok: true, data };
  } catch (e) {
    return fallo(e);
  }
}
