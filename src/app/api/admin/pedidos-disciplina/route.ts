import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { round2 } from "@/lib/tienda/precios";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { z } from "zod";

const TIENDA_ROLES = ["super_admin", "tienda"];

const itemSchema = z.object({
  producto_id: z.number().positive(),
  variante_id: z.number().positive().optional().nullable(),
  cantidad: z.number().int().positive(),
  // Ignorado: el precio sale de la lista asignada a la disciplina.
  precio_unitario: z.number().min(0).optional(),
});

const pedidoSchema = z.object({
  disciplina_id: z.number().positive(),
  items: z.array(itemSchema).min(1, "Debe incluir al menos un item"),
  notas: z.string().optional().nullable(),
});

// GET /api/admin/pedidos-disciplina — listar pedidos de disciplinas
export async function GET(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = await createServerClient();

    const { searchParams } = new URL(request.url);
    const disciplinaId = searchParams.get("disciplina_id");

    let query = supabase
      .from("pedidos")
      .select(`
        *,
        disciplinas(id, nombre),
        perfiles!vendedor_id(nombre_completo),
        pedido_items(id, producto_id, cantidad, precio_unitario, subtotal, productos(id, nombre), producto_variantes(id, nombre))
      `)
      .eq("tipo", "disciplina" as any)
      .order("created_at", { ascending: false })
      .limit(50);

    if (disciplinaId) {
      query = query.eq("disciplina_id", parseInt(disciplinaId));
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/admin/pedidos-disciplina — crear pedido mayorista
export async function POST(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const user = await getCurrentUser();
    // Las RPC de stock solo las ejecuta service_role (mig 045).
    const db = createAdminClient() as any;

    const body = await request.json();
    const parsed = pedidoSchema.parse(body);

    // 1. Precio de cada ítem según las listas asignadas a la disciplina.
    const { data: links } = await db
      .from("lista_precio_disciplinas")
      .select("lista_precio_id")
      .eq("disciplina_id", parsed.disciplina_id);
    const listaIds = (links ?? []).map((l: any) => l.lista_precio_id);
    if (listaIds.length === 0) {
      return NextResponse.json(
        { error: "La disciplina no tiene una lista de precios asignada" },
        { status: 400 }
      );
    }

    const productoIds = [...new Set(parsed.items.map((i) => i.producto_id))];
    const { data: preciosLista } = await db
      .from("lista_precio_items")
      .select("producto_id, variante_id, precio")
      .in("lista_precio_id", listaIds)
      .in("producto_id", productoIds);

    // Si el producto figura en varias listas, gana el menor precio. Un precio
    // de variante tiene prioridad sobre el del producto.
    const precioDe = (productoId: number, varianteId: number | null) => {
      const filas = (preciosLista ?? []).filter(
        (f: any) => f.producto_id === productoId
      );
      const deVariante = varianteId
        ? filas.filter((f: any) => f.variante_id === varianteId)
        : [];
      const candidatas = deVariante.length > 0
        ? deVariante
        : filas.filter((f: any) => f.variante_id == null);
      if (candidatas.length === 0) return null;
      return Math.min(...candidatas.map((f: any) => Number(f.precio)));
    };

    const itemsPayload = [];
    for (const item of parsed.items) {
      const precio = precioDe(item.producto_id, item.variante_id ?? null);
      if (precio == null) {
        return NextResponse.json(
          { error: `El producto ${item.producto_id} no está en la lista de precios de la disciplina` },
          { status: 400 }
        );
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

    const subtotal = round2(
      itemsPayload.reduce((sum, i) => sum + i.subtotal, 0)
    );

    // 2. Crear pedido (numero_pedido lo asigna el trigger; el saldo de la
    // cuenta corriente lo suma trg_pedido_disciplina_saldo).
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
        vendedor_id: user!.id,
        notas: parsed.notas || null,
      })
      .select()
      .single();

    if (pedidoError) throw pedidoError;

    // 3. Validar stock + insertar items + descontar, atómico. Si falla se
    // borra el pedido (el trigger de borrado revierte el saldo).
    const { data: rpcResult, error: rpcError } = await db.rpc(
      "descontar_stock_pedido",
      {
        p_pedido_id: pedido.id,
        p_items: itemsPayload,
        p_registrado_por: user!.id,
      }
    );

    if (rpcError || rpcResult?.ok === false) {
      await db.from("pedidos").delete().eq("id", pedido.id);
      if (rpcError) {
        console.error("Error en descontar_stock_pedido:", rpcError);
        return NextResponse.json(
          { error: "Error al procesar el pedido" },
          { status: 500 }
        );
      }
      const primero = (rpcResult.faltantes ?? [])[0];
      return NextResponse.json(
        {
          error: primero
            ? `Stock insuficiente para ${primero.nombre}. Disponible: ${primero.disponible}`
            : "Stock insuficiente",
          faltantes: rpcResult.faltantes ?? [],
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ data: pedido }, { status: 201 });
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
