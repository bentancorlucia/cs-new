import { createServerClient } from "@/lib/supabase/server";
import { createComercialClient } from "@/lib/comercial/server";
import { leerPaginado } from "@/lib/contabilidad/reportes";
import { claveItem, type MetodoCosteo } from "@/lib/comercial/stock";
import type { ItemVista, ProductoVista } from "@/components/stock/tipos";

/**
 * Lecturas de stock para las pantallas (servidor). Existencia y valor
 * salen de `comercial.items`; si un ítem todavía no pasó por el motor,
 * se muestra el espejo `stock_actual` de public (stock heredado).
 */

export type ItemStock = ItemVista & { atributos: Record<string, string> };
export type ProductoStock = Omit<ProductoVista, "items"> & { items: ItemStock[] };

type FilaProducto = {
  id: number;
  nombre: string;
  sku: string | null;
  stock_actual: number;
  stock_minimo: number | null;
  activo: boolean | null;
  activo_pos: boolean;
  categorias_producto: { nombre: string } | null;
  producto_variantes: {
    id: number;
    nombre: string;
    sku: string | null;
    stock_actual: number;
    activo: boolean | null;
    atributos: unknown;
  }[];
};

type FilaItem = {
  id: number;
  producto_id: number;
  variante_id: number | null;
  metodo_costeo: string;
  stock: number;
  valor: number;
};

const COLUMNAS_PRODUCTO =
  "id, nombre, sku, stock_actual, stock_minimo, activo, activo_pos, categorias_producto(nombre), producto_variantes(id, nombre, sku, stock_actual, activo, atributos)";

function lotes<T>(xs: T[], n = 200): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < xs.length; i += n) r.push(xs.slice(i, i + n));
  return r;
}

export async function cargarStock({
  productoIds,
  verCostos,
}: {
  productoIds?: number[];
  verCostos: boolean;
}): Promise<{ productos: ProductoStock[]; error: string | null }> {
  const db = await createServerClient();
  const com = await createComercialClient();

  const prodRes = await leerPaginado<FilaProducto>((a, b) => {
    let q = db.from("productos").select(COLUMNAS_PRODUCTO).order("nombre").order("id");
    if (productoIds) q = q.in("id", productoIds);
    return q.range(a, b) as unknown as PromiseLike<{ data: FilaProducto[] | null; error: { message: string } | null }>;
  });
  if (prodRes.error) return { productos: [], error: prodRes.error };

  const [itemsRes, reservasRes] = await Promise.all([
    leerPaginado<FilaItem>((a, b) => {
      let q = com.from("items").select("id, producto_id, variante_id, metodo_costeo, stock, valor").order("id");
      if (productoIds) q = q.in("producto_id", productoIds);
      return q.range(a, b);
    }),
    leerPaginado<{ producto_id: number; variante_id: number | null; cantidad: number }>((a, b) => {
      let q = db
        .from("pedido_items")
        .select("producto_id, variante_id, cantidad, pedidos!inner(estado, stock_reservado)")
        .eq("es_encargue", false)
        .eq("pedidos.estado", "pendiente_verificacion")
        .eq("pedidos.stock_reservado", true)
        .order("id");
      if (productoIds) q = q.in("producto_id", productoIds);
      return q.range(a, b) as unknown as PromiseLike<{
        data: { producto_id: number; variante_id: number | null; cantidad: number }[] | null;
        error: { message: string } | null;
      }>;
    }),
  ]);
  // Sin permiso sobre comercial la lectura vuelve vacía (RLS): se usa el espejo.
  const items = itemsRes.filas;
  const porClave = new Map(items.map((i) => [claveItem(i.producto_id, i.variante_id), i]));

  // Ítems con kardex: todo ítem con movimientos tiene al menos una capa
  // (el primer movimiento siempre es una entrada).
  const conMovs = new Set<number>();
  for (const lote of lotes(items.map((i) => i.id))) {
    const r = await leerPaginado<{ item_id: number }>((a, b) =>
      com.from("capas").select("item_id").in("item_id", lote).order("id").range(a, b)
    );
    r.filas.forEach((c) => conMovs.add(c.item_id));
  }

  const reservado = new Map<string, number>();
  for (const r of reservasRes.filas) {
    const k = claveItem(r.producto_id, r.variante_id);
    reservado.set(k, (reservado.get(k) ?? 0) + r.cantidad);
  }

  const productos: ProductoStock[] = prodRes.filas.map((p) => {
    const variantes = [...(p.producto_variantes ?? [])].sort((a, b) => a.id - b.id);
    const filas: ItemStock[] = [];

    const armar = (
      varianteId: number | null,
      nombre: string,
      sku: string | null,
      activo: boolean,
      espejo: number,
      atributos: Record<string, string>
    ): ItemStock => {
      const clave = claveItem(p.id, varianteId);
      const it = porClave.get(clave);
      const stock = it ? it.stock : Math.max(0, espejo ?? 0);
      const res = reservado.get(clave) ?? 0;
      return {
        clave,
        productoId: p.id,
        varianteId,
        nombre,
        sku,
        activo,
        itemId: it?.id ?? null,
        stock,
        valor: verCostos && it ? Number(it.valor) : 0,
        reservado: res,
        disponible: Math.max(0, stock - res),
        conMovimientos: it ? conMovs.has(it.id) : false,
        metodo: (it?.metodo_costeo as MetodoCosteo) ?? "promedio",
        heredado: !it && (espejo ?? 0) > 0,
        atributos,
      };
    };

    if (variantes.length > 0) {
      for (const v of variantes) {
        filas.push(
          armar(v.id, v.nombre, v.sku, v.activo !== false, v.stock_actual, (v.atributos ?? {}) as Record<string, string>)
        );
      }
      // Stock que quedó a nivel producto antes de crear variantes (no debería pasar).
      const suelto = porClave.get(claveItem(p.id, null));
      if (suelto && suelto.stock > 0) {
        filas.unshift(armar(null, "Sin variante", p.sku, true, 0, {}));
      }
    } else {
      filas.push(armar(null, p.nombre, p.sku, p.activo !== false || p.activo_pos, p.stock_actual, {}));
    }

    const metodos = new Set(
      filas.filter((f) => f.itemId !== null).map((f) => f.metodo)
    );
    const suma = (k: "stock" | "reservado" | "disponible" | "valor") =>
      filas.reduce((s, f) => s + f[k], 0);

    return {
      id: p.id,
      nombre: p.nombre,
      sku: p.sku,
      categoria: p.categorias_producto?.nombre ?? null,
      stockMinimo: p.stock_minimo ?? 0,
      activo: p.activo !== false,
      activoPos: p.activo_pos,
      tieneVariantes: variantes.length > 0,
      items: filas,
      stock: suma("stock"),
      reservado: suma("reservado"),
      disponible: suma("disponible"),
      valor: Math.round(suma("valor") * 100) / 100,
      metodo: metodos.size > 1 ? "mixto" : ([...metodos][0] ?? "promedio"),
    };
  });

  return { productos, error: itemsRes.error ?? reservasRes.error };
}

export interface ControlMercaderia {
  valor_stock: number;
  saldo_contable: number;
  diferencia: number;
  movimientos_sin_asiento: number;
}

export async function controlMercaderia(): Promise<ControlMercaderia | null> {
  const com = await createComercialClient();
  const { data, error } = await com.rpc("control_mercaderia");
  if (error || !data?.[0]) return null;
  const c = data[0];
  return {
    valor_stock: Number(c.valor_stock),
    saldo_contable: Number(c.saldo_contable),
    diferencia: Number(c.diferencia),
    movimientos_sin_asiento: Number(c.movimientos_sin_asiento),
  };
}
