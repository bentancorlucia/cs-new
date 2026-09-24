import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { uruguayNowParts, uruguayDayStartUTC } from "@/lib/timezone";

/**
 * Foto del día de la tienda: ventas hoy/semana/mes, pedidos pendientes,
 * pedidos recientes, top productos y alertas de stock.
 * Compartido por /api/admin/dashboard y el servidor MCP.
 * El caller debe haber verificado el rol y pasar un cliente admin.
 */
export async function obtenerDashboardTienda(supabase: SupabaseClient<Database>) {
  const { year, month, day } = uruguayNowParts();
  const todayStart = uruguayDayStartUTC(year, month, day).toISOString();
  const weekStart = uruguayDayStartUTC(year, month, day - 6).toISOString();
  const monthStart = uruguayDayStartUTC(year, month, 1).toISOString();

  // Run all queries in parallel
  const [
    ventasHoyRes,
    ventasSemanaRes,
    ventasMesRes,
    pedidosPendientesRes,
    productosActivosRes,
    productosStockRes,
    pedidosRecientesRes,
    topProductosRes,
  ] = await Promise.all([
    // Ventas hoy por fecha de cobro (pagados/encargado/preparando/listo/retirado) — sin donaciones
    supabase
      .from("pedidos")
      .select("total, donaciones(monto, estado)")
      .gte("fecha_venta", todayStart)
      .in("estado", ["pagado", "encargado", "preparando", "listo_retiro", "retirado"]),

    // Ventas últimos 7 días — sin donaciones
    supabase
      .from("pedidos")
      .select("total, donaciones(monto, estado)")
      .gte("fecha_venta", weekStart)
      .in("estado", ["pagado", "encargado", "preparando", "listo_retiro", "retirado"]),

    // Ventas del mes — sin donaciones
    supabase
      .from("pedidos")
      .select("total, donaciones(monto, estado)")
      .gte("fecha_venta", monthStart)
      .in("estado", ["pagado", "encargado", "preparando", "listo_retiro", "retirado"]),

    // Pedidos pendientes (pagado + encargado + preparando + listo_retiro + pendiente_verificacion)
    supabase
      .from("pedidos")
      .select("id", { count: "exact", head: true })
      .in("estado", ["pagado", "encargado", "preparando", "listo_retiro", "pendiente_verificacion"]),

    // Productos activos
    supabase
      .from("productos")
      .select("id", { count: "exact", head: true })
      .eq("activo", true),

    // Productos activos con datos de stock (filtramos en JS porque
    // PostgREST no compara dos columnas de la misma fila).
    supabase
      .from("productos")
      .select("id, nombre, stock_actual, stock_minimo, sku")
      .eq("activo", true),

    // Pedidos recientes (últimos 10)
    supabase
      .from("pedidos")
      .select(`
        id, numero_pedido, tipo, estado, total, moneda, nombre_cliente, created_at,
        perfiles!perfil_id(nombre, apellido)
      `)
      .order("created_at", { ascending: false })
      .limit(10),

    // Top 5 productos más vendidos (mes en curso)
    supabase
      .from("pedido_items")
      .select(`
        producto_id, cantidad, subtotal,
        productos(nombre, stock_actual),
        pedidos!inner(estado, fecha_venta)
      `)
      .gte("pedidos.fecha_venta", monthStart)
      .in("pedidos.estado", ["pagado", "encargado", "preparando", "listo_retiro", "retirado"]),
  ]);

  // Stock bajo: filtrado en JS
  const productosBajoStock = (productosStockRes.data || []).filter(
    (p: any) => p.stock_actual <= p.stock_minimo
  );
  const stockBajoCount = productosBajoStock.length;
  const alertasStock = [...productosBajoStock]
    .sort((a, b) => a.stock_actual - b.stock_actual)
    .slice(0, 8);

  // Aggregate ventas — restar la donación (objeto u array por PostgREST)
  const sumVentas = (rows: any[] | null) =>
    rows?.reduce((s, r) => {
      const d = Array.isArray(r.donaciones)
        ? r.donaciones[0] ?? null
        : r.donaciones ?? null;
      const donacionActiva =
        d && d.estado !== "cancelada" ? Number(d.monto) || 0 : 0;
      return s + ((r.total || 0) - donacionActiva);
    }, 0) || 0;

  const ventasHoy = sumVentas(ventasHoyRes.data);
  const ventasSemana = sumVentas(ventasSemanaRes.data);
  const ventasMes = sumVentas(ventasMesRes.data);

  // Aggregate top productos
  const productoMap = new Map<number, { nombre: string; cantidad: number; total: number; stock: number }>();
  topProductosRes.data?.forEach((item: any) => {
    const id = item.producto_id;
    const existing = productoMap.get(id);
    if (existing) {
      existing.cantidad += item.cantidad;
      existing.total += item.subtotal;
    } else {
      productoMap.set(id, {
        nombre: item.productos?.nombre || "Producto eliminado",
        cantidad: item.cantidad,
        total: item.subtotal,
        stock: item.productos?.stock_actual || 0,
      });
    }
  });
  const topProductos = Array.from(productoMap.values())
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 5);

  return {
    stats: {
      ventasHoy,
      ventasSemana,
      ventasMes,
      pedidosPendientes: pedidosPendientesRes.count || 0,
      productosActivos: productosActivosRes.count || 0,
      stockBajo: stockBajoCount,
      pedidosHoy: ventasHoyRes.data?.length || 0,
    },
    pedidosRecientes: pedidosRecientesRes.data || [],
    topProductos,
    alertasStock,
  };
}
