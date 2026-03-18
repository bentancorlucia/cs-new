import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import { z } from "zod";

const TIENDA_ROLES = ["super_admin", "tienda"];

const productoSchema = z.object({
  nombre: z.string().min(1, "Nombre requerido").max(200),
  slug: z.string().min(1).max(200),
  descripcion: z.string().optional().nullable(),
  descripcion_corta: z.string().max(300).optional().nullable(),
  categoria_id: z.number().positive().optional().nullable(),
  precio: z.number().positive("Precio debe ser mayor a 0"),
  precio_socio: z.number().positive().optional().nullable(),
  sku: z.string().max(50).optional().nullable(),
  stock_actual: z.number().int().min(0).default(0),
  stock_minimo: z.number().int().min(0).default(5),
  activo: z.boolean().default(true),
  destacado: z.boolean().default(false),
  unidad: z.enum(["un", "kg", "lt", "mt", "par", "docena"]).default("un"),
});

// GET /api/admin/productos — listar todos los productos para admin
export async function GET(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = await createServerClient();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const categoria = searchParams.get("categoria") || "";
    const estado = searchParams.get("estado") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
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
      .order("created_at", { ascending: false });

    if (search) {
      query = query.or(`nombre.ilike.%${search}%,sku.ilike.%${search}%`);
    }

    if (categoria) {
      query = query.eq("categoria_id", parseInt(categoria));
    }

    if (estado === "activo") query = query.eq("activo", true);
    if (estado === "inactivo") query = query.eq("activo", false);
    if (estado === "agotado") query = query.eq("stock_actual", 0);
    if (estado === "stock_bajo") query = query.lt("stock_actual", 5);

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
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json(
      { error: error.message || "Error" },
      { status: 500 }
    );
  }
}

// POST /api/admin/productos — crear producto
export async function POST(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = await createServerClient();
    const body = await request.json();
    const parsed = productoSchema.parse(body);

    const { data, error } = await supabase
      .from("productos")
      .insert(parsed as any)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message || "Error al crear producto" },
      { status: 500 }
    );
  }
}
