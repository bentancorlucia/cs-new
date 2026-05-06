import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/supabase/roles";
import { uruguayNowParts, uruguayDayStartUTC } from "@/lib/timezone";

const TIENDA_ROLES = ["super_admin", "tienda"];

export async function GET() {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = createAdminClient();

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
      stockBajoRes,
      pedidosRecientesRes,
      topProductosRes,
      alertasStockRes,
    ] = await Promise.all([
      // Ventas hoy (pagados/encargado/preparando/listo/retirado)
      supabase
        .from("pedidos")
        .select("total")
        .gte("created_at", todayStart)
        .in("estado", ["pagado", "encargado", "preparando", "listo_retiro", "retirado"]),

      // Ventas últimos 7 días
      supabase
        .from("pedidos")
        .select("total")
        .gte("created_at", weekStart)
        .in("estado", ["pagado", "encargado", "preparando", "listo_retiro", "retirado"]),

      // Ventas del mes
      supabase
        .from("pedidos")
        .select("total")
        .gte("created_at", monthStart)
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

      // Productos con stock bajo
      supabase
        .from("productos")
        .select("id", { count: "exact", head: true })
        .eq("activo", true)
        .filter("stock_actual", "lte", "stock_minimo"),

      // Pedidos recientes (últimos 10)
      supabase
        .from("pedidos")
        .select(`
          id, numero_pedido, tipo, estado, total, moneda, nombre_cliente, created_at,
          perfiles!perfil_id(nombre, apellido)
        `)
        .order("created_at", { ascending: false })
        .limit(10),

      // Top 5 productos más vendidos (últimos 30 días)
      supabase
        .from("pedido_items")
        .select(`
          producto_id, cantidad, subtotal,
          productos(nombre, stock_actual),
          pedidos!inner(estado, created_at)
        `)
        .gte("pedidos.created_at", monthStart)
        .in("pedidos.estado", ["pagado", "encargado", "preparando", "listo_retiro", "retirado"]),

      // Alertas de stock bajo (top 8)
      supabase
        .from("productos")
        .select("id, nombre, stock_actual, stock_minimo, sku")
        .eq("activo", true)
        .filter("stock_actual", "lte", "stock_minimo")
        .order("stock_actual", { ascending: true })
        .limit(8),
    ]);

    // Aggregate ventas
    const sumTotal = (rows: { total: number }[] | null) =>
      rows?.reduce((s, r) => s + (r.total || 0), 0) || 0;

    const ventasHoy = sumTotal(ventasHoyRes.data);
    const ventasSemana = sumTotal(ventasSemanaRes.data);
    const ventasMes = sumTotal(ventasMesRes.data);

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

    return NextResponse.json({
      stats: {
        ventasHoy,
        ventasSemana,
        ventasMes,
        pedidosPendientes: pedidosPendientesRes.count || 0,
        productosActivos: productosActivosRes.count || 0,
        stockBajo: stockBajoRes.count || 0,
        pedidosHoy: ventasHoyRes.data?.length || 0,
      },
      pedidosRecientes: pedidosRecientesRes.data || [],
      topProductos,
      alertasStock: alertasStockRes.data || [],
    });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
