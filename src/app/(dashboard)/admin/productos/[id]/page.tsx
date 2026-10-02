import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { permisosComercial } from "@/lib/comercial/server";
import { cargarStock } from "../../stock/_lib/datos";
import { ProductoForm } from "../_components/producto-form";
import { EncabezadoProducto } from "../_components/encabezado-producto";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Editar producto" };

export default async function EditarProductoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const productoId = Number(id);
  if (!Number.isInteger(productoId) || productoId <= 0) notFound();

  const db = await createServerClient();
  const [{ data: producto }, { puedeOperar }] = await Promise.all([
    db
      .from("productos")
      .select(
        "*, categorias_producto(id, nombre, slug), producto_imagenes(id, url, alt_text, orden, es_principal, focal_point), producto_variantes(id, nombre, sku, precio_override, atributos, activo), producto_proveedores(id, proveedor_id, costo, codigo_proveedor, es_principal)"
      )
      .eq("id", productoId)
      .maybeSingle(),
    permisosComercial(),
  ]);
  if (!producto) notFound();

  const { productos } = await cargarStock({ productoIds: [productoId], verCostos: puedeOperar });

  return (
    <div className="mx-auto max-w-5xl px-1">
      <EncabezadoProducto titulo={producto.nombre} subtitulo={`Editando producto · ID ${producto.id}`} modo="editar" />
      <ProductoForm producto={producto} stock={productos[0] ?? null} verCostos={puedeOperar} puedeOperar={puedeOperar} />
    </div>
  );
}
