import type { SupabaseClient } from "@supabase/supabase-js";
import { createComercialClient, permisosComercial } from "@/lib/comercial/server";
import { createContabilidadClient } from "@/lib/contabilidad/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Cliente de `comercial` sin tipos para lo nuevo de la migración de
 * trazabilidad (bajas, recuentos) hasta que se regeneren los tipos.
 * Las filas se tipan a mano en cada lectura.
 */
export async function comercialSinTipos(): Promise<SupabaseClient> {
  return (await createComercialClient()) as unknown as SupabaseClient;
}

export interface FilaBaja {
  id: number;
  numero: string;
  fecha: string;
  tipo: string;
  descripcion: string;
  centro_costo_id: string | null;
  asiento_id: string | null;
  creado_por: string | null;
  created_at: string;
}

export interface FilaBajaItem {
  id: number;
  baja_id: number;
  item_id: number;
  cantidad: number;
  valor: number;
}

export interface FilaRecuento {
  id: number;
  numero: string;
  estado: "borrador" | "confirmado" | "descartado";
  notas: string | null;
  creado_por: string | null;
  created_at: string;
  confirmado_por: string | null;
  confirmado_at: string | null;
  asiento_id: string | null;
}

export interface FilaRecuentoItem {
  id: number;
  recuento_id: number;
  item_id: number;
  contado: number;
  stock_sistema: number | null;
  diferencia: number | null;
  valor: number | null;
}

/** Permisos de las pantallas de stock. */
export async function permisosStock() {
  const p = await permisosComercial();
  return {
    ...p,
    // Inventario inicial: solo tesorero o super_admin (la base vuelve a validar).
    puedeInventario: p.roles.includes("super_admin") || p.roles.includes("tesorero"),
  };
}

/**
 * Nombres de usuarios por la RPC de contabilidad (tesorero, comisión
 * fiscal, super_admin). Si quien mira no tiene permiso, vuelve vacío y
 * se muestra "Usuario xxxx".
 */
export async function nombresUsuarios(ids: (string | null)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (unicos.length === 0) return new Map();
  try {
    const conta = await createContabilidadClient();
    const { data, error } = await conta.rpc("nombres_usuarios", { p_ids: unicos });
    if (error || !data) return new Map();
    return new Map(data.map((u) => [u.id, u.nombre]));
  } catch {
    return new Map();
  }
}

/** Centros de costo activos (solo los ven tesorería y super_admin; para tienda vuelve vacío). */
export async function centrosCosto(): Promise<{ id: string; codigo: string; nombre: string }[]> {
  try {
    const conta = await createContabilidadClient();
    const { data } = await conta.from("centros_costo").select("id, codigo, nombre").eq("activo", true).order("nombre");
    return data ?? [];
  } catch {
    return [];
  }
}

export interface ItemNombrado {
  itemId: number;
  productoId: number;
  varianteId: number | null;
  producto: string;
  variante: string | null;
  sku: string | null;
}

/** Producto y variante de cada ítem del motor (para los detalles de bajas y recuentos). */
export async function nombresItems(itemIds: number[]): Promise<Map<number, ItemNombrado>> {
  const ids = [...new Set(itemIds)];
  if (ids.length === 0) return new Map();
  const com = await createComercialClient();
  const { data: items } = await com.from("items").select("id, producto_id, variante_id").in("id", ids);
  const prodIds = [...new Set((items ?? []).map((i) => i.producto_id))];
  const varIds = (items ?? []).map((i) => i.variante_id).filter((v): v is number => v !== null);
  const db = await createServerClient();
  const [{ data: prods }, { data: vars }] = await Promise.all([
    prodIds.length ? db.from("productos").select("id, nombre, sku").in("id", prodIds) : Promise.resolve({ data: [] }),
    varIds.length ? db.from("producto_variantes").select("id, nombre, sku").in("id", varIds) : Promise.resolve({ data: [] }),
  ]);
  const prod = new Map((prods ?? []).map((p) => [p.id, p]));
  const vari = new Map((vars ?? []).map((v) => [v.id, v]));
  return new Map(
    (items ?? []).map((i) => {
      const p = prod.get(i.producto_id);
      const v = i.variante_id !== null ? vari.get(i.variante_id) : undefined;
      return [
        i.id,
        {
          itemId: i.id,
          productoId: i.producto_id,
          varianteId: i.variante_id,
          producto: p?.nombre ?? `Producto ${i.producto_id}`,
          variante: v?.nombre ?? null,
          sku: v?.sku ?? p?.sku ?? null,
        },
      ];
    })
  );
}
