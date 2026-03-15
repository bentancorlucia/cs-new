import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// GET /api/productos — catálogo público (filtros, paginación)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const categoria = searchParams.get("categoria") || "";
    const orden = searchParams.get("orden") || "nuevos";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "12");
    const offset = (page - 1) * limit;

    let query = supabase
      .from("productos")
      .select(
        `
        *,
        categorias_producto(id, nombre, slug),
        producto_imagenes(id, url, alt_text, orden, es_principal)
      `,
        { count: "exact" }
      )
      .eq("activo", true);

    if (search) {
      query = query.or(`nombre.ilike.%${search}%,descripcion_corta.ilike.%${search}%`);
    }

    if (categoria) {
      query = query.eq("categorias_producto.slug", categoria);
    }

    switch (orden) {
      case "precio-asc":
        query = query.order("precio", { ascending: true });
        break;
      case "precio-desc":
        query = query.order("precio", { ascending: false });
        break;
      default:
        query = query.order("created_at", { ascending: false });
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Error al obtener productos" },
      { status: 500 }
    );
  }
}
