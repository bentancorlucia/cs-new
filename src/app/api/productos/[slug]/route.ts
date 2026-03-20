import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// GET /api/productos/[slug] — detalle producto público
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("productos")
      .select(
        `
        *,
        categorias_producto(id, nombre, slug),
        producto_imagenes(id, url, alt_text, orden, es_principal, focal_point),
        producto_variantes(id, nombre, sku, precio_override, stock_actual, atributos, activo)
      `
      )
      .eq("slug", slug)
      .eq("activo", true)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Producto no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Error al obtener producto" },
      { status: 500 }
    );
  }
}
