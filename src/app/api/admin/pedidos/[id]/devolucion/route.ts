import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createComercialClient } from "@/lib/comercial/server";
import { mensajeError } from "@/lib/contabilidad/formato";
import { precioListaUnitario, precioSocioUnitario } from "@/lib/tienda/precios";
import {
  ErrorHttp,
  exigir,
  idNumerico,
  patronBusqueda,
  respuestaError,
} from "@/lib/comercial/pedidos";
import type { ProductoCambio } from "@/components/pedidos/tipos";


const devolucionSchema = z
  .object({
    medio: z.enum(["caja", "banco"]),
    motivo: z.string().trim().min(3, "Indicá el motivo").max(500),
    devueltos: z
      .array(z.object({ pedido_item_id: z.number().int().positive(), cantidad: z.number().int().positive() }))
      .max(50),
    nuevos: z
      .array(
        z.object({
          producto_id: z.number().int().positive(),
          variante_id: z.number().int().positive().nullable().optional(),
          cantidad: z.number().int().positive().max(1000),
        })
      )
      .max(50),
  })
  .refine((d) => d.devueltos.length > 0 || d.nuevos.length > 0, {
    message: "Elegí qué se devuelve o qué se entrega",
  });

async function pedidoDevolvible(db: ReturnType<typeof createAdminClient>, pedidoId: number) {
  const { data: pedido } = await db
    .from("pedidos")
    .select("id, tipo, estado, aplico_precio_socio")
    .eq("id", pedidoId)
    .maybeSingle();
  if (!pedido) throw new ErrorHttp(404, "Pedido no encontrado");
  if (pedido.tipo === "disciplina") {
    throw new ErrorHttp(
      400,
      "Los pedidos de disciplina no se devuelven por caja o banco: cancelá el pedido o ajustá la cuenta corriente en contabilidad"
    );
  }
  if (pedido.estado === "cancelado" || pedido.estado === "pendiente_verificacion" || pedido.estado === "pendiente") {
    throw new ErrorHttp(400, "Solo se devuelve o cambia una venta cobrada");
  }
  return pedido;
}

// GET /api/admin/pedidos/[id]/devolucion?q= — productos para un cambio, al precio de este pedido
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await exigir((p) => p.puedeOperarComercial);
    const pedidoId = idNumerico((await params).id);
    const db = createAdminClient();
    const pedido = await pedidoDevolvible(db, pedidoId);

    let q = db
      .from("productos")
      .select("id, nombre, sku, precio, precio_socio, stock_actual, producto_variantes(id, nombre, sku, precio_override, stock_actual, activo)")
      .eq("activo", true)
      .order("nombre")
      .limit(30);
    const patron = patronBusqueda(request.nextUrl.searchParams.get("q"));
    if (patron) q = q.or(`nombre.ilike.${patron},sku.ilike.${patron}`);
    const { data, error } = await q;
    if (error) throw error;

    const precio = (p: { precio: number; precio_socio: number | null }, override: number | null) => {
      const socio = pedido.aplico_precio_socio ? precioSocioUnitario(p, override) : null;
      return socio ?? precioListaUnitario(p, override);
    };

    const productos: ProductoCambio[] = [];
    for (const p of data ?? []) {
      const variantes = (p.producto_variantes ?? []).filter((v) => v.activo !== false);
      if ((p.producto_variantes ?? []).length > 0) {
        for (const v of variantes) {
          productos.push({
            producto_id: p.id,
            variante_id: v.id,
            nombre: p.nombre,
            variante: v.nombre,
            sku: v.sku ?? p.sku,
            precio: precio(p, v.precio_override),
            stock: v.stock_actual ?? 0,
          });
        }
      } else {
        productos.push({
          producto_id: p.id,
          variante_id: null,
          nombre: p.nombre,
          variante: null,
          sku: p.sku,
          precio: precio(p, null),
          stock: p.stock_actual ?? 0,
        });
      }
    }

    return NextResponse.json({ data: productos, precio_socio: pedido.aplico_precio_socio });
  } catch (error) {
    return respuestaError(error);
  }
}

// POST /api/admin/pedidos/[id]/devolucion — devolución y/o cambio
//
// comercial.registrar_devolucion devuelve la mercadería al costo con que
// salió, saca la nueva (si es cambio) y asienta la diferencia por caja o
// banco, todo en una transacción. El precio de lo nuevo se calcula acá
// (lista o socio, como el pedido original), nunca lo manda el navegador.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await exigir((p) => p.puedeOperarComercial);
    const pedidoId = idNumerico((await params).id);
    const body = devolucionSchema.parse(await request.json());
    const db = createAdminClient();
    const pedido = await pedidoDevolvible(db, pedidoId);

    const nuevos: { producto_id: number; variante_id: number | null; cantidad: number; precio_unitario: number }[] = [];
    if (body.nuevos.length > 0) {
      const ids = [...new Set(body.nuevos.map((n) => n.producto_id))];
      const { data: prods, error } = await db
        .from("productos")
        .select("id, nombre, precio, precio_socio, activo, producto_variantes(id, precio_override, activo)")
        .in("id", ids);
      if (error) throw error;
      for (const n of body.nuevos) {
        const p = (prods ?? []).find((x) => x.id === n.producto_id);
        if (!p || !p.activo) throw new ErrorHttp(400, "Uno de los productos del cambio no está activo");
        const v = n.variante_id ? (p.producto_variantes ?? []).find((x) => x.id === n.variante_id) : null;
        if (n.variante_id && (!v || v.activo === false)) {
          throw new ErrorHttp(400, `La variante elegida de "${p.nombre}" no está disponible`);
        }
        if (!n.variante_id && (p.producto_variantes ?? []).length > 0) {
          throw new ErrorHttp(400, `Elegí la variante de "${p.nombre}"`);
        }
        const override = v?.precio_override ?? null;
        const socio = pedido.aplico_precio_socio ? precioSocioUnitario(p, override) : null;
        nuevos.push({
          producto_id: n.producto_id,
          variante_id: n.variante_id ?? null,
          cantidad: n.cantidad,
          precio_unitario: socio ?? precioListaUnitario(p, override),
        });
      }
    }

    // Con la sesión del usuario: la función valida el rol y registra quién la hizo.
    const com = (await createComercialClient()) as unknown as SupabaseClient;
    const { data, error } = await com.rpc("registrar_devolucion", {
      p_pedido: pedidoId,
      p_devueltos: body.devueltos,
      p_medio: body.medio,
      p_motivo: body.motivo,
      p_nuevos: nuevos,
    });
    if (error) {
      const msg = mensajeError(error);
      if (/caja/i.test(msg) && /abr/i.test(msg)) {
        throw new ErrorHttp(
          409,
          "No hay una caja abierta. Abrí la caja en el POS para devolver en efectivo, o elegí devolver por banco."
        );
      }
      if (error.code === "PGRST202") {
        throw new ErrorHttp(500, "La base todavía no tiene devoluciones (falta aplicar la migración de caja y devoluciones)");
      }
      throw new ErrorHttp(400, msg);
    }

    return NextResponse.json({ data: { devolucion_id: data as number } }, { status: 201 });
  } catch (error) {
    return respuestaError(error);
  }
}
