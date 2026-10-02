import { createAdminClient } from "@/lib/supabase/admin";
import type { MtoCampo } from "@/types/mto";
import type { CategoriaPos, ProductoPos, VariantePos } from "@/components/pos/tipos";

/*
 * Catálogo del POS. Se lee con service role (quien llama ya validó el rol):
 * así aparecen los productos que están solo en el POS (`activo_pos` sin
 * `activo`) y no viaja el costo al navegador. El disponible descuenta lo
 * reservado por pedidos pendientes de verificación, igual que la base al
 * vender.
 */
export async function catalogoPos(): Promise<{ productos: ProductoPos[]; categorias: CategoriaPos[] }> {
  const db = createAdminClient();
  const [{ data: prods }, { data: cats }, { data: reservas }] = await Promise.all([
    db
      .from("productos")
      .select(
        "id, nombre, precio, precio_socio, stock_actual, categoria_id, mto_disponible, mto_solo, mto_campos, mto_tiempo_fabricacion_dias, producto_imagenes(url, es_principal, focal_point, orden), producto_variantes(id, nombre, sku, precio_override, stock_actual, atributos, activo)"
      )
      .eq("activo_pos", true)
      .order("nombre"),
    db.from("categorias_producto").select("id, nombre").eq("activa", true).order("orden"),
    db
      .from("pedido_items")
      .select("producto_id, variante_id, cantidad, pedidos!inner(estado, stock_reservado)")
      .eq("es_encargue", false)
      .eq("pedidos.estado", "pendiente_verificacion")
      .eq("pedidos.stock_reservado", true),
  ]);

  const reservado = new Map<string, number>();
  for (const r of reservas ?? []) {
    const k = r.variante_id != null ? `v${r.variante_id}` : `p${r.producto_id}`;
    reservado.set(k, (reservado.get(k) ?? 0) + r.cantidad);
  }

  const productos: ProductoPos[] = (prods ?? []).map((p) => {
    const imagenes = [...(p.producto_imagenes ?? [])].sort(
      (a, b) => Number(b.es_principal) - Number(a.es_principal) || (a.orden ?? 0) - (b.orden ?? 0)
    );
    const variantes: VariantePos[] = (p.producto_variantes ?? [])
      .filter((v) => v.activo !== false)
      .sort((a, b) => a.id - b.id)
      .map((v) => ({
        id: v.id,
        nombre: v.nombre,
        sku: v.sku,
        precio_override: v.precio_override == null ? null : Number(v.precio_override),
        disponible: Math.max(0, v.stock_actual - (reservado.get(`v${v.id}`) ?? 0)),
        atributos: (v.atributos ?? {}) as Record<string, string>,
      }));
    const disponible =
      variantes.length > 0
        ? variantes.reduce((s, v) => s + v.disponible, 0)
        : Math.max(0, p.stock_actual - (reservado.get(`p${p.id}`) ?? 0));
    return {
      id: p.id,
      nombre: p.nombre,
      precio: Number(p.precio),
      precio_socio: p.precio_socio == null ? null : Number(p.precio_socio),
      disponible,
      categoria_id: p.categoria_id,
      imagen_url: imagenes[0]?.url ?? null,
      imagen_focal_point: imagenes[0]?.focal_point ?? null,
      variantes,
      mto_disponible: p.mto_disponible === true,
      mto_solo: p.mto_solo === true,
      mto_campos: (Array.isArray(p.mto_campos) ? p.mto_campos : []) as unknown as MtoCampo[],
      mto_tiempo_fabricacion_dias: p.mto_tiempo_fabricacion_dias ?? null,
    };
  });

  return { productos, categorias: cats ?? [] };
}
