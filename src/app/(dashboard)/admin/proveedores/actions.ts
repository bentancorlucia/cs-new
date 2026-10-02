"use server";

import { revalidatePath } from "next/cache";
import { createComercialClient, exigirOperador } from "@/lib/comercial/server";
import { createServerClient } from "@/lib/supabase/server";
import { mensajeError } from "@/lib/contabilidad/formato";
import { proveedorSchema, type ProveedorInput } from "@/lib/comercial/compras-esquemas";

function errorProveedor(error: { message?: string; code?: string }): string {
  if (error.code === "23505" && error.message?.includes("rut")) return "Ya hay un proveedor con ese RUT";
  return mensajeError(error);
}

export type ResultadoProveedor = { ok: true; id: number } | { ok: false; error: string };

/** Alta o edición de un proveedor y sus condiciones comerciales. */
export async function guardarProveedor(input: ProveedorInput): Promise<ResultadoProveedor> {
  try {
    await exigirOperador();
    const p = proveedorSchema.safeParse(input);
    if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Datos inválidos" };
    const d = p.data;

    const pub = await createServerClient();
    const datos = {
      nombre: d.nombre,
      rut: d.rut,
      razon_social: d.razon_social,
      contacto_nombre: d.contacto_nombre,
      contacto_telefono: d.contacto_telefono,
      contacto_email: d.contacto_email,
      direccion: d.direccion,
      notas: d.notas,
      activo: d.activo,
    };

    let id = d.id;
    if (id) {
      const { data, error } = await pub.from("proveedores").update(datos).eq("id", id).select("id");
      if (error) return { ok: false, error: errorProveedor(error) };
      if (!data || data.length === 0) return { ok: false, error: "No tenés permiso para editar proveedores" };
    } else {
      const { data, error } = await pub.from("proveedores").insert(datos).select("id").single();
      if (error) return { ok: false, error: errorProveedor(error) };
      id = data.id;
    }

    const com = await createComercialClient();
    const { error: errorCond } = await com.from("proveedores_condiciones").upsert({
      proveedor_id: id,
      moneda: d.moneda,
      plazo_dias: d.plazo_dias,
      cuenta_gasto_id: d.cuenta_gasto_id,
      centro_costo_id: d.centro_costo_id,
      updated_at: new Date().toISOString(),
    });
    if (errorCond) return { ok: false, error: `Proveedor guardado, pero no sus condiciones: ${mensajeError(errorCond)}` };

    revalidatePath("/admin/proveedores");
    revalidatePath(`/admin/proveedores/${id}`);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error inesperado" };
  }
}
