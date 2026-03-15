import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ProductoDetalleClient } from "./producto-detalle-client";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("productos")
    .select("nombre, descripcion_corta")
    .eq("slug", slug)
    .eq("activo", true)
    .single();

  const producto = data as { nombre: string; descripcion_corta: string | null } | null;
  if (!producto) return { title: "Producto no encontrado" };

  return {
    title: `${producto.nombre} | Tienda Club Seminario`,
    description: producto.descripcion_corta || `Comprá ${producto.nombre} en la tienda oficial de Club Seminario.`,
  };
}

export default async function ProductoDetallePage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createServerClient();

  const { data: rawProducto } = await supabase
    .from("productos")
    .select(
      "*, categorias_producto(id, nombre, slug), producto_imagenes(id, url, alt_text, orden, es_principal), producto_variantes(id, nombre, sku, precio_override, stock_actual, atributos, activo)"
    )
    .eq("slug", slug)
    .eq("activo", true)
    .single();

  if (!rawProducto) notFound();
  const producto = rawProducto as any;

  // Productos relacionados (misma categoría)
  let relacionados: any[] = [];
  if (producto.categoria_id) {
    const { data } = await supabase
      .from("productos")
      .select("*, producto_imagenes(url, es_principal)")
      .eq("activo", true)
      .eq("categoria_id", producto.categoria_id)
      .neq("id", producto.id)
      .limit(4);
    relacionados = (data as any[]) ?? [];
  }

  return (
    <ProductoDetalleClient
      producto={producto}
      relacionados={relacionados}
    />
  );
}
