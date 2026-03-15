import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";

const TIENDA_ROLES = ["super_admin", "tienda"];

// GET /api/admin/pedidos — listar pedidos
export async function GET(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = await createServerClient();

    const { searchParams } = new URL(request.url);
    const estado = searchParams.get("estado") || "";
    const tipo = searchParams.get("tipo") || "";
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    let query = supabase
      .from("pedidos")
      .select(
        `
        *,
        perfiles(nombre, apellido, telefono)
      `,
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (estado) query = query.eq("estado", estado);
    if (tipo) query = query.eq("tipo", tipo);
    if (search) {
      query = query.or(
        `numero_pedido.ilike.%${search}%,nombre_cliente.ilike.%${search}%`
      );
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
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
