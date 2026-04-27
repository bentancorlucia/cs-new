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
    .select("nombre, descripcion_corta, producto_imagenes(url, es_principal)")
    .eq("slug", slug)
    .eq("activo", true)
    .single();

  const producto = data as
    | {
        nombre: string;
        descripcion_corta: string | null;
        producto_imagenes: { url: string; es_principal: boolean }[];
      }
    | null;
  if (!producto) return { title: "Producto no encontrado", robots: { index: false } };

  const imagen =
    producto.producto_imagenes?.find((i) => i.es_principal)?.url ||
    producto.producto_imagenes?.[0]?.url;
  const description =
    producto.descripcion_corta ||
    `Comprá ${producto.nombre} en la tienda oficial del Club Seminario. Envíos a todo Uruguay.`;

  return {
    title: producto.nombre,
    description,
    alternates: { canonical: `/tienda/${slug}` },
    openGraph: {
      type: "website",
      title: `${producto.nombre} — Club Seminario`,
      description,
      url: `/tienda/${slug}`,
      images: imagen ? [{ url: imagen, width: 1200, height: 1200, alt: producto.nombre }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: producto.nombre,
      description,
      images: imagen ? [imagen] : undefined,
    },
  };
}

export default async function ProductoDetallePage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createServerClient();

  const { data: rawProducto } = await supabase
    .from("productos")
    .select(
      "*, categorias_producto(id, nombre, slug), producto_imagenes(id, url, alt_text, orden, es_principal, focal_point), producto_variantes(id, nombre, sku, precio_override, stock_actual, atributos, activo)"
    )
    .eq("slug", slug)
    .eq("activo", true)
    .single();

  if (!rawProducto) notFound();
  const producto = rawProducto as any;

  // Detectar si el usuario actual es socio (server-side, sin race condition)
  let esSocio = false;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: perfil } = await supabase
        .from("perfiles")
        .select("es_socio")
        .eq("id", user.id)
        .single();
      esSocio = (perfil as { es_socio?: boolean } | null)?.es_socio === true;
    }
  } catch {
    // sin sesión / fallo silencioso → esSocio queda en false
  }

  // Stock reservado (pedidos pendientes de verificación)
  const { data: reservados } = await supabase
    .from("pedido_items")
    .select("producto_id, variante_id, cantidad, pedidos!inner(estado)")
    .eq("producto_id", producto.id)
    .eq("pedidos.estado", "pendiente_verificacion");

  // Build reserved map: { productoTotal, variantes: { [varianteId]: cantidad } }
  let stockReservadoProducto = 0;
  const stockReservadoVariantes: Record<number, number> = {};
  if (reservados) {
    for (const item of reservados) {
      stockReservadoProducto += item.cantidad;
      if (item.variante_id) {
        stockReservadoVariantes[item.variante_id] =
          (stockReservadoVariantes[item.variante_id] || 0) + item.cantidad;
      }
    }
  }

  // Productos relacionados (misma categoría)
  let relacionados: any[] = [];
  if (producto.categoria_id) {
    const { data } = await supabase
      .from("productos")
      .select("*, producto_imagenes(url, es_principal, focal_point)")
      .eq("activo", true)
      .eq("categoria_id", producto.categoria_id)
      .neq("id", producto.id)
      .limit(4);
    relacionados = (data as any[]) ?? [];
  }

  const BASE_URL =
    process.env.NEXT_PUBLIC_APP_URL || "https://clubseminario.com.uy";
  const imagenPrincipal =
    producto.producto_imagenes?.find((i: any) => i.es_principal)?.url ||
    producto.producto_imagenes?.[0]?.url;
  const stockDisponible =
    (producto.stock_actual ?? 0) - stockReservadoProducto > 0;

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: producto.nombre,
    description: producto.descripcion_corta || producto.descripcion || undefined,
    image: imagenPrincipal ? [imagenPrincipal] : undefined,
    sku: producto.sku || undefined,
    brand: { "@type": "Brand", name: "Club Seminario" },
    category: producto.categorias_producto?.nombre || undefined,
    offers: {
      "@type": "Offer",
      url: `${BASE_URL}/tienda/${producto.slug}`,
      priceCurrency: producto.moneda || "UYU",
      price: Number(producto.precio).toFixed(2),
      availability: stockDisponible
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: "Club Seminario" },
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <ProductoDetalleClient
        producto={producto}
        relacionados={relacionados}
        stockReservado={{
          producto: stockReservadoProducto,
          variantes: stockReservadoVariantes,
        }}
        esSocio={esSocio}
      />
    </>
  );
}
