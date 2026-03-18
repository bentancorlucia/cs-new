import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";

const TIENDA_ROLES = ["super_admin", "tienda"];

// GET /api/admin/depositos/[id]/stock — stock en un depósito
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const supabase = await createServerClient();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";

    let query = supabase
      .from("stock_deposito")
      .select(
        `
        *,
        productos(id, nombre, sku, precio, activo),
        producto_variantes(id, nombre, sku, atributos)
      `
      )
      .eq("deposito_id", parseInt(id))
      .gt("cantidad", 0)
      .order("producto_id");

    const { data, error } = await query;
    if (error) throw error;

    // Filter by search if needed (product name or sku)
    let filtered = data || [];
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(
        (item: any) =>
          item.productos?.nombre?.toLowerCase().includes(s) ||
          item.productos?.sku?.toLowerCase().includes(s) ||
          item.producto_variantes?.nombre?.toLowerCase().includes(s)
      );
    }

    return NextResponse.json({ data: filtered });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
