import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/supabase/roles";
import {
  parseRango,
  rangoAnterior,
  rangoToTimestamps,
  variacionPct,
  debeAgruparPorSemana,
} from "@/lib/reportes/rango";
import {
  ESTADOS_VENTA_EFECTIVA,
  type KpiComparado,
  type ReporteTienda,
  type SerieDiaria,
  type ConteoPorClave,
  type ProductoTop,
  type MargenCategoria,
} from "@/types/reportes";

export const dynamic = "force-dynamic";

const TIENDA_ROLES = ["super_admin", "tienda"];

type PedidoRow = {
  id: number;
  estado: string;
  tipo: string;
  metodo_pago: string | null;
  total: number;
  subtotal: number;
  descuento: number | null;
  aplico_precio_socio: boolean | null;
  created_at: string;
};

type ItemRow = {
  pedido_id: number;
  producto_id: number;
  variante_id: number | null;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  costo_unitario_venta: number | null;
};

type ProductoLite = {
  id: number;
  nombre: string;
  sku: string | null;
  categoria_id: number | null;
};

type CategoriaLite = { id: number; nombre: string };

export async function GET(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const db = createAdminClient();

    const { searchParams } = new URL(request.url);
    const rango = parseRango(searchParams);
    const previo = rangoAnterior(rango);

    const [actual, anterior] = await Promise.all([
      fetchPeriodo(db, rango),
      fetchPeriodo(db, previo),
    ]);

    // KPIs (solo venta efectiva para facturación, COGS, margen)
    const k = computeKpis(actual.pedidosEfectivos, actual.items);
    const kPrev = computeKpis(anterior.pedidosEfectivos, anterior.items);

    const kpiComparado = (a: number, b: number): KpiComparado => ({
      valor: a,
      valorAnterior: b,
      variacionPct: variacionPct(a, b),
    });

    const itemsSinCosto = actual.items.filter(
      (i) => i.costo_unitario_venta == null || Number(i.costo_unitario_venta) === 0
    ).length;

    // Serie temporal
    const porSemana = debeAgruparPorSemana(rango);
    const serie = computeSerie(actual.pedidosEfectivos, actual.items, porSemana);

    // Mix por método de pago, canal y estado
    const porMetodoPago = agruparPor(
      actual.pedidosEfectivos,
      (p) => p.metodo_pago || "sin_metodo"
    );
    const onlineVsPos = computeOnlineVsPos(actual.pedidosEfectivos);
    const porEstado = agruparPor(actual.pedidosTodos, (p) => p.estado);

    // Top productos
    const productosMap = new Map<number, ProductoLite>();
    actual.productos.forEach((p) => productosMap.set(p.id, p));
    const topProductos = computeTopProductos(actual.items, productosMap);

    // Margen por categoría
    const categoriasMap = new Map<number, CategoriaLite>();
    actual.categorias.forEach((c) => categoriasMap.set(c.id, c));
    const margenPorCategoria = computeMargenPorCategoria(
      actual.items,
      productosMap,
      categoriasMap
    );

    const reporte: ReporteTienda = {
      rango,
      rangoAnterior: previo,
      ventas: kpiComparado(k.ventas, kPrev.ventas),
      cogs: kpiComparado(k.cogs, kPrev.cogs),
      margen: kpiComparado(k.margen, kPrev.margen),
      margenPct: kpiComparado(k.margenPct ?? 0, kPrev.margenPct ?? 0),
      pedidos: kpiComparado(k.cantidadPedidos, kPrev.cantidadPedidos),
      ticketPromedio: kpiComparado(k.ticketPromedio, kPrev.ticketPromedio),
      ventasSocioPct: kpiComparado(k.ventasSocioPct, kPrev.ventasSocioPct),
      itemsSinCosto,
      serie,
      porMetodoPago,
      onlineVsPos,
      topProductos,
      margenPorCategoria,
      porEstado,
    };

    return NextResponse.json({ data: reporte });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error";
    if (msg === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type AdminDb = ReturnType<typeof createAdminClient>;

async function fetchPeriodo(
  db: AdminDb,
  rango: { desde: string; hasta: string }
): Promise<{
  pedidosTodos: PedidoRow[];
  pedidosEfectivos: PedidoRow[];
  items: ItemRow[];
  productos: ProductoLite[];
  categorias: CategoriaLite[];
}> {
  const { desdeIso, hastaIso } = rangoToTimestamps(rango);

  const { data: pedidos, error: errP } = await db
    .from("pedidos")
    .select(
      "id, estado, tipo, metodo_pago, total, subtotal, descuento, aplico_precio_socio, created_at"
    )
    .gte("created_at", desdeIso)
    .lte("created_at", hastaIso);
  if (errP) throw errP;

  const pedidosTodos = (pedidos || []) as PedidoRow[];
  const pedidosEfectivos = pedidosTodos.filter((p) =>
    (ESTADOS_VENTA_EFECTIVA as readonly string[]).includes(p.estado)
  );

  const idsEfectivos = pedidosEfectivos.map((p) => p.id);
  let items: ItemRow[] = [];
  if (idsEfectivos.length > 0) {
    const { data: rows, error: errI } = await db
      .from("pedido_items")
      .select(
        "pedido_id, producto_id, variante_id, cantidad, precio_unitario, subtotal, costo_unitario_venta"
      )
      .in("pedido_id", idsEfectivos);
    if (errI) throw errI;
    items = (rows || []) as ItemRow[];
  }

  const productoIds = Array.from(new Set(items.map((i) => i.producto_id)));
  let productos: ProductoLite[] = [];
  if (productoIds.length > 0) {
    const { data: rows, error } = await db
      .from("productos")
      .select("id, nombre, sku, categoria_id")
      .in("id", productoIds);
    if (error) throw error;
    productos = (rows || []) as ProductoLite[];
  }

  const categoriaIds = Array.from(
    new Set(
      productos.map((p) => p.categoria_id).filter((c): c is number => c != null)
    )
  );
  let categorias: CategoriaLite[] = [];
  if (categoriaIds.length > 0) {
    const { data: rows, error } = await db
      .from("categorias_producto")
      .select("id, nombre")
      .in("id", categoriaIds);
    if (error) throw error;
    categorias = (rows || []) as CategoriaLite[];
  }

  return { pedidosTodos, pedidosEfectivos, items, productos, categorias };
}

function computeKpis(pedidos: PedidoRow[], items: ItemRow[]) {
  const ventas = pedidos.reduce((acc, p) => acc + Number(p.total || 0), 0);
  const cogs = items.reduce((acc, i) => {
    const costo = i.costo_unitario_venta == null ? 0 : Number(i.costo_unitario_venta);
    return acc + Number(i.cantidad) * costo;
  }, 0);
  const margen = ventas - cogs;
  const margenPct = ventas > 0 ? (margen / ventas) * 100 : null;
  const cantidadPedidos = pedidos.length;
  const ticketPromedio = cantidadPedidos > 0 ? ventas / cantidadPedidos : 0;
  const pedidosSocio = pedidos.filter((p) => p.aplico_precio_socio).length;
  const ventasSocioPct =
    cantidadPedidos > 0 ? (pedidosSocio / cantidadPedidos) * 100 : 0;
  return { ventas, cogs, margen, margenPct, cantidadPedidos, ticketPromedio, ventasSocioPct };
}

function computeSerie(
  pedidos: PedidoRow[],
  items: ItemRow[],
  porSemana: boolean
): SerieDiaria[] {
  const ventasPorPedido = new Map<number, number>();
  pedidos.forEach((p) => ventasPorPedido.set(p.id, Number(p.total || 0)));

  const cogsPorPedido = new Map<number, number>();
  items.forEach((i) => {
    const costo = i.costo_unitario_venta == null ? 0 : Number(i.costo_unitario_venta);
    cogsPorPedido.set(
      i.pedido_id,
      (cogsPorPedido.get(i.pedido_id) || 0) + Number(i.cantidad) * costo
    );
  });

  const acc = new Map<string, { ventas: number; cogs: number }>();
  pedidos.forEach((p) => {
    const fecha = new Date(p.created_at);
    const clave = porSemana ? toClaveSemana(fecha) : toYmd(fecha);
    const v = ventasPorPedido.get(p.id) || 0;
    const c = cogsPorPedido.get(p.id) || 0;
    const prev = acc.get(clave) || { ventas: 0, cogs: 0 };
    acc.set(clave, { ventas: prev.ventas + v, cogs: prev.cogs + c });
  });

  return Array.from(acc.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, v]) => ({
      fecha,
      ventas: v.ventas,
      cogs: v.cogs,
      margen: v.ventas - v.cogs,
    }));
}

function agruparPor(
  pedidos: PedidoRow[],
  keyFn: (p: PedidoRow) => string
): ConteoPorClave[] {
  const map = new Map<string, { cantidad: number; total: number }>();
  pedidos.forEach((p) => {
    const k = keyFn(p);
    const prev = map.get(k) || { cantidad: 0, total: 0 };
    map.set(k, {
      cantidad: prev.cantidad + 1,
      total: prev.total + Number(p.total || 0),
    });
  });
  return Array.from(map.entries())
    .map(([clave, v]) => ({ clave, cantidad: v.cantidad, total: v.total }))
    .sort((a, b) => b.total - a.total);
}

function computeOnlineVsPos(pedidos: PedidoRow[]) {
  let online = 0;
  let pos = 0;
  let pedidosOnline = 0;
  let pedidosPos = 0;
  pedidos.forEach((p) => {
    const total = Number(p.total || 0);
    if (p.tipo === "pos") {
      pos += total;
      pedidosPos += 1;
    } else {
      online += total;
      pedidosOnline += 1;
    }
  });
  return { online, pos, pedidosOnline, pedidosPos };
}

function computeTopProductos(
  items: ItemRow[],
  productosMap: Map<number, ProductoLite>
): ProductoTop[] {
  const acc = new Map<
    number,
    { cantidad: number; facturacion: number; cogs: number }
  >();
  items.forEach((i) => {
    const costo = i.costo_unitario_venta == null ? 0 : Number(i.costo_unitario_venta);
    const prev = acc.get(i.producto_id) || { cantidad: 0, facturacion: 0, cogs: 0 };
    acc.set(i.producto_id, {
      cantidad: prev.cantidad + Number(i.cantidad),
      facturacion: prev.facturacion + Number(i.subtotal || 0),
      cogs: prev.cogs + Number(i.cantidad) * costo,
    });
  });

  return Array.from(acc.entries())
    .map(([producto_id, v]) => {
      const meta = productosMap.get(producto_id);
      const margen = v.facturacion - v.cogs;
      return {
        producto_id,
        nombre: meta?.nombre || `#${producto_id}`,
        sku: meta?.sku ?? null,
        cantidad: v.cantidad,
        facturacion: v.facturacion,
        cogs: v.cogs,
        margen,
        margenPct: v.facturacion > 0 ? (margen / v.facturacion) * 100 : null,
      };
    })
    .sort((a, b) => b.facturacion - a.facturacion)
    .slice(0, 10);
}

function computeMargenPorCategoria(
  items: ItemRow[],
  productosMap: Map<number, ProductoLite>,
  categoriasMap: Map<number, CategoriaLite>
): MargenCategoria[] {
  const acc = new Map<
    string,
    { categoria_id: number | null; nombre: string; facturacion: number; cogs: number }
  >();
  items.forEach((i) => {
    const prod = productosMap.get(i.producto_id);
    const catId = prod?.categoria_id ?? null;
    const key = catId == null ? "sin_categoria" : String(catId);
    const nombre =
      catId == null ? "Sin categoría" : categoriasMap.get(catId)?.nombre || `#${catId}`;
    const costo = i.costo_unitario_venta == null ? 0 : Number(i.costo_unitario_venta);
    const prev = acc.get(key) || {
      categoria_id: catId,
      nombre,
      facturacion: 0,
      cogs: 0,
    };
    acc.set(key, {
      categoria_id: catId,
      nombre,
      facturacion: prev.facturacion + Number(i.subtotal || 0),
      cogs: prev.cogs + Number(i.cantidad) * costo,
    });
  });

  return Array.from(acc.values())
    .map((v) => {
      const margen = v.facturacion - v.cogs;
      return {
        categoria_id: v.categoria_id,
        nombre: v.nombre,
        facturacion: v.facturacion,
        cogs: v.cogs,
        margen,
        margenPct: v.facturacion > 0 ? (margen / v.facturacion) * 100 : null,
      };
    })
    .sort((a, b) => b.margen - a.margen);
}

function toYmd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toClaveSemana(d: Date): string {
  // ISO week: año-Wxx
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}
