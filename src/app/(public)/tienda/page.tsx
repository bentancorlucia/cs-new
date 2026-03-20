import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase/server";
import { TiendaClient } from "./tienda-client";

export const metadata: Metadata = {
  title: "Tienda | Club Seminario",
  description:
    "Tienda oficial de Club Seminario. Encontrá indumentaria, accesorios y más.",
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
