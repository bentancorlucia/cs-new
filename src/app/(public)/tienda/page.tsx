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
        "*, categorias_producto(nombre, slug), producto_imagenes(url, es_principal, focal_point)"
      )
      .eq("activo", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("categorias_producto")
      .select("*")
      .eq("activa", true)
      .order("orden"),
  ]);

  return (
    <TiendaClient
      initialProductos={(prodRes.data ?? []) as never[]}
      initialCategorias={catRes.data ?? []}
    />
  );
}
