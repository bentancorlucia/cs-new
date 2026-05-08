import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import { TiendaClient } from "./tienda-client";

export const metadata: Metadata = {
  title: "Tienda Oficial",
  description:
    "Tienda online oficial del Club Seminario. Indumentaria deportiva, camisetas, accesorios y merchandising. Envíos a todo Uruguay y retiro en Montevideo.",
  alternates: { canonical: "/tienda" },
  openGraph: {
    title: "Tienda Oficial — Club Seminario",
    description:
      "Indumentaria deportiva, camisetas y accesorios del Club Seminario. Envíos a todo Uruguay.",
    url: "/tienda",
  },
};

export default async function TiendaPage() {
  const supabase = await createServerClient();

  const [prodRes, catRes] = await Promise.all([
    supabase
      .from("productos")
      .select(
        "*, categorias_producto(nombre, slug), producto_imagenes(url, es_principal, focal_point), producto_variantes(id, nombre, sku, precio_override, stock_actual, atributos, activo)"
      )
      .eq("activo", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("categorias_producto")
      .select("*")
      .eq("activa", true)
      .order("orden"),
  ]);

  const productos = (prodRes.data ?? []) as { id: number }[];
  const productoIds = productos.map((p) => p.id);

  const stockReservadoProductos: Record<number, number> = {};
  const stockReservadoVariantes: Record<number, number> = {};

  if (productoIds.length > 0) {
    const { data: reservados } = await supabase
      .from("pedido_items")
      .select("producto_id, variante_id, cantidad, pedidos!inner(estado)")
      .in("producto_id", productoIds)
      .eq("pedidos.estado", "pendiente_verificacion");

    if (reservados) {
      for (const item of reservados as {
        producto_id: number;
        variante_id: number | null;
        cantidad: number;
      }[]) {
        stockReservadoProductos[item.producto_id] =
          (stockReservadoProductos[item.producto_id] || 0) + item.cantidad;
        if (item.variante_id) {
          stockReservadoVariantes[item.variante_id] =
            (stockReservadoVariantes[item.variante_id] || 0) + item.cantidad;
        }
      }
    }
  }

  return (
    <TiendaClient
      initialProductos={(prodRes.data ?? []) as never[]}
      initialCategorias={catRes.data ?? []}
      stockReservadoProductos={stockReservadoProductos}
      stockReservadoVariantes={stockReservadoVariantes}
    />
  );
}
