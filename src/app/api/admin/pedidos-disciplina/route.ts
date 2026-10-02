import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { round2 } from "@/lib/tienda/precios";
import { mensajeError } from "@/lib/contabilidad/formato";
import { ErrorHttp, exigir, respuestaError } from "@/lib/comercial/pedidos";
import { preciosDisciplina } from "./precios";

const itemSchema = z.object({
  producto_id: z.number().int().positive(),
  variante_id: z.number().int().positive().optional().nullable(),
  cantidad: z.number().int().positive().max(10_000),
  // Ignorado: el precio sale de la lista activa asignada a la disciplina.
  precio_unitario: z.number().min(0).optional(),
});

const pedidoSchema = z.object({
  disciplina_id: z.number().int().positive(),
  items: z.array(itemSchema).min(1, "Agregá al menos un producto").max(200),
  notas: z.string().trim().max(1000).optional().nullable(),
});

const filtrosSchema = z.object({
  disciplina_id: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const uno = <T,>(v: T | T[] | null | undefined): T | null =>
  v == null ? null : Array.isArray(v) ? v[0] ?? null : v;

// GET /api/admin/pedidos-disciplina — listado paginado de pedidos de disciplinas
export async function GET(request: NextRequest) {
  try {
    await exigir((p) => p.puedeOperarComercial);
    const db = createAdminClient();
    const sp = request.nextUrl.searchParams;
    const f = filtrosSchema.parse({
      disciplina_id: sp.get("disciplina_id") || undefined,
      page: sp.get("page") || undefined,
      limit: sp.get("limit") || undefined,
    });
    const offset = (f.page - 1) * f.limit;

    let query = db
      .from("pedidos")
      .select(
        `id, numero_pedido, total, estado, created_at, notas, disciplina_id,
         disciplinas(id, nombre),
         vendedor:perfiles!vendedor_id(nombre, apellido),
         pedido_items(id, cantidad, productos(nombre), producto_variantes(nombre))`,
        { count: "exact" }
      )
      .eq("tipo", "disciplina")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (f.disciplina_id) query = query.eq("disciplina_id", f.disciplina_id);

    const { data, error, count } = await query.range(offset, offset + f.limit - 1);
    if (error) throw error;

    const total = count ?? 0;
    return NextResponse.json({
      data: (data ?? []).map((p) => {
        const d = uno(p.disciplinas);
        const v = uno(p.vendedor);
        return {
          id: p.id,
          numero_pedido: p.numero_pedido,
          total: Number(p.total),
          estado: p.estado,
          created_at: p.created_at,
          notas: p.notas,
          disciplina: d ? { id: d.id, nombre: d.nombre } : null,
          vendedor: v ? `${v.nombre} ${v.apellido}`.trim() : null,
          items: (p.pedido_items ?? []).map((i) => ({
            id: i.id,
            cantidad: i.cantidad,
            nombre: uno(i.productos)?.nombre ?? "",
            variante: uno(i.producto_variantes)?.nombre ?? null,
          })),
        };
      }),
      pagination: {
        page: f.page,
        limit: f.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / f.limit)),
      },
    });
  } catch (error) {
    return respuestaError(error);
  }
}

// POST /api/admin/pedidos-disciplina — pedido mayorista a cuenta corriente
//
// descontar_stock_pedido saca la mercadería por el motor de costos y asienta
// D Fondos en poder de disciplinas (auxiliar disciplina) / H Ventas a
// disciplinas (centro de costo de la disciplina) + costo, en una transacción.
export async function POST(request: NextRequest) {
  try {
    const permisos = await exigir((p) => p.puedeOperarComercial);
    const db = createAdminClient();
    const parsed = pedidoSchema.parse(await request.json());

    const { data: disc } = await db
      .from("disciplinas")
      .select("id, nombre, activa")
      .eq("id", parsed.disciplina_id)
      .maybeSingle();
    if (!disc || !disc.activa) throw new ErrorHttp(400, "La disciplina no existe o no está activa");

    const precios = await preciosDisciplina(db, parsed.disciplina_id);
    if (precios.listas === 0) {
      throw new ErrorHttp(400, "La disciplina no tiene una lista de precios activa asignada");
    }

    // Variantes: un producto con variantes se pide siempre por variante.
    const productoIds = [...new Set(parsed.items.map((i) => i.producto_id))];
    const { data: prods } = await db
      .from("productos")
      .select("id, nombre, producto_variantes(id)")
      .in("id", productoIds);

    const itemsPayload = [];
    for (const item of parsed.items) {
      const prod = (prods ?? []).find((p) => p.id === item.producto_id);
      if (!prod) throw new ErrorHttp(400, `El producto ${item.producto_id} no existe`);
      const variantes = (prod.producto_variantes ?? []).map((v) => v.id);
      if (variantes.length > 0 && !item.variante_id) {
        throw new ErrorHttp(400, `Elegí la variante de "${prod.nombre}"`);
      }
      if (item.variante_id && !variantes.includes(item.variante_id)) {
        throw new ErrorHttp(400, `La variante no corresponde a "${prod.nombre}"`);
      }
      const precio = precios.precio(item.producto_id, item.variante_id ?? null);
      if (precio == null) {
        throw new ErrorHttp(400, `"${prod.nombre}" no está en la lista de precios de la disciplina`);
      }
      itemsPayload.push({
        producto_id: item.producto_id,
        variante_id: item.variante_id ?? null,
        cantidad: item.cantidad,
        precio_unitario: precio,
        subtotal: round2(precio * item.cantidad),
        es_encargue: false,
        personalizacion: {},
        precio_extra_personalizacion: 0,
      });
    }

    const subtotal = round2(itemsPayload.reduce((s, i) => s + i.subtotal, 0));

    const { data: pedido, error: pedidoError } = await db
      .from("pedidos")
      .insert({
        tipo: "disciplina",
        estado: "pagado",
        subtotal,
        descuento: 0,
        total: subtotal,
        moneda: "UYU",
        metodo_pago: "cuenta_corriente",
        disciplina_id: parsed.disciplina_id,
        vendedor_id: permisos.userId,
        notas: parsed.notas || null,
      })
      .select("id, numero_pedido, total")
      .single();
    if (pedidoError) throw new ErrorHttp(400, mensajeError(pedidoError));

    // Stock + ítems + asiento, atómico. Si falla se borra el pedido.
    const { data: rpc, error: rpcError } = await db.rpc("descontar_stock_pedido", {
      p_pedido_id: pedido.id,
      p_items: itemsPayload,
      p_registrado_por: permisos.userId as string,
    });
    const resultado = rpc as { ok?: boolean; faltantes?: { nombre: string; disponible: number }[] } | null;

    if (rpcError || resultado?.ok === false) {
      await db.from("pedidos").delete().eq("id", pedido.id);
      if (rpcError) throw new ErrorHttp(400, mensajeError(rpcError));
      const primero = resultado?.faltantes?.[0];
      return NextResponse.json(
        {
          error: primero
            ? `Stock insuficiente para ${primero.nombre}. Disponible: ${primero.disponible}`
            : "Stock insuficiente",
          faltantes: resultado?.faltantes ?? [],
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ data: pedido }, { status: 201 });
  } catch (error) {
    return respuestaError(error);
  }
}
