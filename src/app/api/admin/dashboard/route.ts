import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/supabase/roles";

const TIENDA_ROLES = ["super_admin", "tienda"];

export async function GET() {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = createAdminClient();

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Run all queries in parallel
    const [
      ventasHoyRes,
      ventasSemanaRes,
      ventasMesRes,
      pedidosPendientesRes,
      productosActivosRes,
      stockBajoRes,
      pedidosRecientesRes,
      ventasDiariasRes,
      topProductosRes,
      alertasStockRes,
    ] = await Promise.all([
      // Ventas hoy (solo pagados/preparando/listo/retirado)
      supabase
        .from("pedidos")
        .select("total")
        .gte("created_at", todayStart)
        .in("estado", ["pagado", "preparando", "listo_retiro", "retirado"]),

      // Ventas últimos 7 días
      supabase
        .from("pedidos")
        .select("total")
        .gte("created_at", weekStart)
        .in("estado", ["pagado", "preparando", "listo_retiro", "retirado"]),

      // Ventas del mes
      supabase
        .from("pedidos")
        .select("total")
        .gte("created_at", monthStart)
        .in("estado", ["pagado", "preparando", "listo_retiro", "retirado"]),

      // Pedidos pendientes (pagado + preparando + listo_retiro + pendiente_verificacion)
      supabase
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .in("estado", ["pagado", "preparando", "listo_retiro", "pendiente_verificacion"]),

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

      // Ventas diarias últimos 7 días
      supabase
        .from("pedidos")
        .select("total, created_at, tipo")
        .gte("created_at", weekStart)
        .in("estado", ["pagado", "preparando", "listo_retiro", "retirado"])
        .order("created_at", { ascending: true }),

      // Top 5 productos más vendidos (últimos 30 días)
      supabase
        .from("pedido_items")
        .select(`
          producto_id, cantidad, subtotal,
          productos(nombre, stock_actual),
          pedidos!inner(estado, created_at)
        `)
        .gte("pedidos.created_at", monthStart)
        .in("pedidos.estado", ["pagado", "preparando", "listo_retiro", "retirado"]),

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

    // Aggregate ventas diarias for chart
    const ventasPorDia: Record<string, { online: number; pos: number; total: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = d.toISOString().split("T")[0];
      ventasPorDia[key] = { online: 0, pos: 0, total: 0 };
    }
    ventasDiariasRes.data?.forEach((p: { total: number; created_at: string; tipo: string }) => {
      const key = p.created_at.split("T")[0];
      if (ventasPorDia[key]) {
        ventasPorDia[key].total += p.total || 0;
        if (p.tipo === "online") ventasPorDia[key].online += p.total || 0;
        else ventasPorDia[key].pos += p.total || 0;
      }
    });

    const chartData = Object.entries(ventasPorDia).map(([fecha, vals]) => ({
      fecha,
      ...vals,
    }));

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
      chartData,
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
