import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import { createComercialClient, permisosComercial } from "@/lib/comercial/server";
import { mensajeError } from "@/lib/contabilidad/formato";

const TIENDA_ROLES = ["super_admin", "tienda"];

// Sin stock_actual: el stock de las variantes lo mueve solo el motor de stock.
const varianteSchema = z.object({
  id: z.number().int().positive().optional(),
  nombre: z.string().trim().min(1, "Cada variante necesita nombre").max(100),
  sku: z.string().trim().max(50).optional().nullable(),
  precio_override: z.number().positive("El precio de la variante tiene que ser mayor que 0").optional().nullable(),
  atributos: z.record(z.string(), z.string()),
  activo: z.boolean().default(true),
});

const bulkSchema = z.object({ variantes: z.array(varianteSchema).max(300, "Máximo 300 variantes") });

type Existente = { id: number; nombre: string; sku: string | null; activo: boolean | null; stock_actual: number };

function conflicto(error: string, status = 409) {
  return NextResponse.json({ error }, { status });
}

/**
 * PUT /api/admin/productos/[id]/variantes — sincroniza las variantes.
 * Conserva las existentes por id (su stock y su kardex no se tocan), crea
 * las nuevas y, de las que dejan de existir, borra las que nunca se usaron
 * y desactiva las que tienen historial. Una variante con stock no puede
 * dejar de existir: primero se ajusta a 0.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const productoId = Number(id);
    if (!Number.isInteger(productoId) || productoId <= 0) return conflicto("Producto inválido", 400);

    const parsed = bulkSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
    }
    const variantes = parsed.data.variantes.map((v) => ({ ...v, sku: v.sku ? v.sku : null }));
    const db = await createServerClient();

    const [{ data: producto }, { data: existentesData, error: errExist }] = await Promise.all([
      db.from("productos").select("id, stock_actual").eq("id", productoId).maybeSingle(),
      db.from("producto_variantes").select("id, nombre, sku, activo, stock_actual").eq("producto_id", productoId),
    ]);
    if (!producto) return conflicto("Producto no encontrado", 404);
    if (errExist) throw errExist;
    const existentes = (existentesData ?? []) as Existente[];
    const porId = new Map(existentes.map((v) => [v.id, v]));

    // Ids ajenos
    const ajeno = variantes.find((v) => v.id !== undefined && !porId.has(v.id));
    if (ajeno) return conflicto(`La variante ${ajeno.id} no es de este producto`, 400);
    if (new Set(variantes.filter((v) => v.id).map((v) => v.id)).size !== variantes.filter((v) => v.id).length) {
      return conflicto("Hay variantes repetidas", 400);
    }

    // Combinaciones repetidas
    const claveAtr = (a: Record<string, string>) =>
      JSON.stringify(Object.keys(a).sort().map((k) => [k, a[k]]));
    const combos = new Set<string>();
    for (const v of variantes) {
      const k = claveAtr(v.atributos);
      if (combos.has(k)) return conflicto(`La combinación "${v.nombre}" está repetida`, 400);
      combos.add(k);
    }

    // SKUs únicos (en el envío, contra otras variantes y contra productos)
    const skus = variantes.map((v) => v.sku).filter((s): s is string => !!s);
    const repetido = skus.find((s, i) => skus.findIndex((t) => t.toLowerCase() === s.toLowerCase()) !== i);
    if (repetido) return conflicto(`El SKU ${repetido} está repetido entre las variantes`, 400);
    if (skus.length) {
      const [{ data: otrasVar }, { data: prods }] = await Promise.all([
        db.from("producto_variantes").select("id, sku, producto_id").in("sku", skus).neq("producto_id", productoId),
        db.from("productos").select("id, sku").in("sku", skus),
      ]);
      const choque = otrasVar?.[0]?.sku ?? prods?.[0]?.sku;
      if (choque) return conflicto(`El SKU ${choque} ya lo usa otro producto o variante`);
    }

    // Primeras variantes de un producto que tiene stock suelto
    if (existentes.length === 0 && variantes.length > 0) {
      let suelto = producto.stock_actual ?? 0;
      const { puedeVer } = await permisosComercial();
      if (puedeVer) {
        const com = await createComercialClient();
        const { data: item } = await com
          .from("items")
          .select("stock")
          .eq("producto_id", productoId)
          .is("variante_id", null)
          .maybeSingle();
        if (item) suelto = item.stock;
      }
      if (suelto > 0) {
        return conflicto(
          `El producto tiene ${suelto} unidades sin variante. Antes de crear variantes dejá ese stock en 0 con un ajuste (y después cargalo en cada variante).`
        );
      }
    }

    // Las que dejan de existir
    const enviados = new Set(variantes.filter((v) => v.id).map((v) => v.id as number));
    const retiradas = existentes.filter((v) => !enviados.has(v.id));
    const conStock = retiradas.find((v) => v.stock_actual > 0);
    if (conStock) {
      return conflicto(
        `La variante "${conStock.nombre}" tiene ${conStock.stock_actual} unidades: no puede dejar de existir. Ajustá su stock a 0 o mantené esa combinación.`
      );
    }
    // Activar/desactivar cambia el stock del producto (suma de variantes activas): con stock no se permite.
    const toggleConStock = variantes.find((v) => {
      const e = v.id ? porId.get(v.id) : undefined;
      return e && (e.activo !== false) !== v.activo && e.stock_actual > 0;
    });
    if (toggleConStock) {
      return conflicto(
        `La variante "${toggleConStock.nombre}" tiene stock: para ${toggleConStock.activo ? "activarla" : "desactivarla"} primero ajustá su stock a 0.`
      );
    }

    const avisos: string[] = [];

    for (const v of retiradas) {
      const { error } = await db.from("producto_variantes").delete().eq("id", v.id).eq("producto_id", productoId);
      if (!error) {
        avisos.push(`Se eliminó "${v.nombre}"`);
        continue;
      }
      if (error.code !== "23503") throw error;
      // Tiene historial (ventas, kardex, listas): se desactiva y se le libera el SKU
      if (v.activo !== false || v.sku) {
        const { error: e2 } = await db
          .from("producto_variantes")
          .update({ activo: false })
          .eq("id", v.id)
          .eq("producto_id", productoId);
        if (e2) throw e2;
      }
      avisos.push(`"${v.nombre}" tiene historial: quedó desactivada`);
    }

    for (const v of variantes.filter((x) => x.id)) {
      const e = porId.get(v.id as number)!;
      const cambios: {
        nombre: string;
        sku: string | null;
        precio_override: number | null;
        atributos: Record<string, string>;
        activo?: boolean;
      } = { nombre: v.nombre, sku: v.sku, precio_override: v.precio_override ?? null, atributos: v.atributos };
      if ((e.activo !== false) !== v.activo) cambios.activo = v.activo;
      const { error } = await db.from("producto_variantes").update(cambios).eq("id", v.id as number).eq("producto_id", productoId);
      if (error) return conflicto(`No se pudo guardar "${v.nombre}": ${mensajeError(error)}`);
    }

    const nuevas = variantes.filter((x) => !x.id);
    if (nuevas.length) {
      const { error } = await db.from("producto_variantes").insert(
        nuevas.map((v) => ({
          producto_id: productoId,
          nombre: v.nombre,
          sku: v.sku,
          precio_override: v.precio_override ?? null,
          atributos: v.atributos,
          activo: v.activo,
        }))
      );
      if (error) return conflicto(`No se pudieron crear las variantes nuevas: ${mensajeError(error)}`);
    }

    // Método de costeo: las variantes nuevas heredan el del producto.
    if (nuevas.length) {
      const { puedeOperar } = await permisosComercial();
      if (puedeOperar) {
        const com = await createComercialClient();
        const { data: items } = await com.from("items").select("metodo_costeo").eq("producto_id", productoId);
        if ((items ?? []).some((i) => i.metodo_costeo === "fifo")) {
          const { error } = await com.rpc("cambiar_metodo_costeo", { p_producto: productoId, p_metodo: "fifo" });
          if (error) avisos.push(`Las variantes nuevas quedaron con costeo promedio: ${mensajeError(error)}`);
        }
      }
    }

    const { data: finales, error: errFin } = await db
      .from("producto_variantes")
      .select("id, nombre, sku, precio_override, atributos, activo")
      .eq("producto_id", productoId)
      .order("id");
    if (errFin) throw errFin;

    return NextResponse.json({ data: finales ?? [], avisos });
  } catch (error) {
    const e = error as { message?: string; code?: string };
    if (e?.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: mensajeError(e) }, { status: 500 });
  }
}
