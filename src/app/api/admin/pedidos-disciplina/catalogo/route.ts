import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigir, respuestaError } from "@/lib/comercial/pedidos";
import { preciosDisciplina } from "../precios";
import type { ItemCatalogoDisciplina } from "@/components/pedidos/tipos";


// GET /api/admin/pedidos-disciplina/catalogo?disciplina_id= — catálogo mayorista
// (listas activas, un renglón por producto/variante al precio que se va a cobrar)
export async function GET(request: NextRequest) {
  try {
    await exigir((p) => p.puedeOperarComercial);
    const disciplinaId = z.coerce
      .number()
      .int()
      .positive()
      .parse(request.nextUrl.searchParams.get("disciplina_id"));
    const db = createAdminClient();

    const precios = await preciosDisciplina(db, disciplinaId);
    const productoIds = [...new Set(precios.filas.map((f) => f.producto_id))];
    if (productoIds.length === 0) {
      return NextResponse.json({ data: [], listas: precios.listas });
    }

    const { data: prods, error } = await db
      .from("productos")
      .select("id, nombre, sku, precio, activo, activo_pos, stock_actual, producto_variantes(id, nombre, sku, precio_override, stock_actual, activo)")
      .in("id", productoIds)
      .order("nombre");
    if (error) throw error;

    const data: ItemCatalogoDisciplina[] = [];
    for (const p of prods ?? []) {
      if (!p.activo && !p.activo_pos) continue;
      const variantes = p.producto_variantes ?? [];
      if (variantes.length === 0) {
        const precio = precios.precio(p.id, null);
        if (precio == null) continue;
        data.push({
          producto_id: p.id,
          variante_id: null,
          nombre: p.nombre,
          variante_nombre: null,
          sku: p.sku,
          precio_mayorista: precio,
          precio_base: Number(p.precio),
          stock: p.stock_actual ?? 0,
        });
        continue;
      }
      for (const v of variantes.filter((x) => x.activo !== false).sort((a, b) => a.id - b.id)) {
        const precio = precios.precio(p.id, v.id);
        if (precio == null) continue;
        data.push({
          producto_id: p.id,
          variante_id: v.id,
          nombre: p.nombre,
          variante_nombre: v.nombre,
          sku: v.sku ?? p.sku,
          precio_mayorista: precio,
          precio_base: Number(v.precio_override ?? p.precio),
          stock: v.stock_actual ?? 0,
        });
      }
    }

    return NextResponse.json({ data, listas: precios.listas });
  } catch (error) {
    return respuestaError(error);
  }
}
