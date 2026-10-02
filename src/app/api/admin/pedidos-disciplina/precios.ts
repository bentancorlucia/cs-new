import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Precios mayoristas de una disciplina: ítems de sus listas ACTIVAS.
 * Si un producto figura en varias listas gana el menor precio, y el precio
 * de la variante tiene prioridad sobre el del producto (misma regla para el
 * catálogo que se muestra y para lo que se cobra).
 */
export async function preciosDisciplina(db: ReturnType<typeof createAdminClient>, disciplinaId: number) {
  const { data: links } = await db
    .from("lista_precio_disciplinas")
    .select("lista_precio_id, listas_precio!inner(activa)")
    .eq("disciplina_id", disciplinaId)
    .eq("listas_precio.activa", true);
  const listaIds = (links ?? []).map((l) => l.lista_precio_id);

  const filas: { producto_id: number; variante_id: number | null; precio: number }[] = [];
  if (listaIds.length > 0) {
    const { data } = await db
      .from("lista_precio_items")
      .select("producto_id, variante_id, precio")
      .in("lista_precio_id", listaIds)
      .limit(5000);
    for (const f of data ?? []) {
      filas.push({ producto_id: f.producto_id, variante_id: f.variante_id, precio: Number(f.precio) });
    }
  }

  const precio = (productoId: number, varianteId: number | null): number | null => {
    const delProducto = filas.filter((f) => f.producto_id === productoId);
    const deVariante = varianteId ? delProducto.filter((f) => f.variante_id === varianteId) : [];
    const candidatas = deVariante.length > 0 ? deVariante : delProducto.filter((f) => f.variante_id == null);
    if (candidatas.length === 0) return null;
    return Math.min(...candidatas.map((f) => f.precio));
  };

  return { listas: listaIds.length, filas, precio };
}
