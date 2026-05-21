import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/supabase/roles";
import { parseRango, rangoToTimestamps } from "@/lib/reportes/rango";
import {
  ESTADOS_VENTA_EFECTIVA,
  type PromocodeEstado,
  type PromocodeRanking,
  type ReportePromocodes,
} from "@/types/reportes";

export const dynamic = "force-dynamic";

const TIENDA_ROLES = ["super_admin", "tienda"];

type PedidoConCodigo = {
  id: number;
  total: number;
  subtotal: number;
  descuento: number | null;
  promocode_id: number | null;
  promocode_codigo: string | null;
  aplico_precio_socio: boolean | null;
  estado: string;
  created_at: string;
};

type ItemConCosto = {
  pedido_id: number;
  cantidad: number;
  subtotal: number;
  costo_unitario_venta: number | null;
};

type PromocodeRow = {
  id: number;
  codigo: string;
  descripcion: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  usos_actuales: number;
  usos_max: number | null;
  activo: boolean;
  acumulable_con_precio_socio: boolean;
};

export async function GET(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const db = createAdminClient();

    const { searchParams } = new URL(request.url);
    const rango = parseRango(searchParams);
    const { desdeIso, hastaIso } = rangoToTimestamps(rango);

    const [pedRes, codesRes] = await Promise.all([
      db
        .from("pedidos")
        .select(
          "id, total, subtotal, descuento, promocode_id, promocode_codigo, aplico_precio_socio, estado, created_at"
        )
        .gte("created_at", desdeIso)
        .lte("created_at", hastaIso)
        .in("estado", ESTADOS_VENTA_EFECTIVA as unknown as string[]),
      db
        .from("promocodes")
        .select(
          "id, codigo, descripcion, fecha_inicio, fecha_fin, usos_actuales, usos_max, activo, acumulable_con_precio_socio"
        ),
    ]);

    if (pedRes.error) throw pedRes.error;
    if (codesRes.error) throw codesRes.error;

    const pedidos = (pedRes.data || []) as PedidoConCodigo[];
    const promocodes = (codesRes.data || []) as PromocodeRow[];

    // Descontar donaciones: pedidos.total las incluye, pero la donación se
    // transfiere a la Olla del Hogar — no es venta de la tienda.
    const pedidoIds = pedidos.map((p) => p.id);
    if (pedidoIds.length > 0) {
      const { data: donRows, error: errD } = await db
        .from("donaciones")
        .select("pedido_id, monto")
        .in("pedido_id", pedidoIds);
      if (errD) throw errD;
      const donacionPorPedido = new Map<number, number>();
      (donRows || []).forEach((d: { pedido_id: number; monto: number }) => {
        donacionPorPedido.set(d.pedido_id, Number(d.monto || 0));
      });
      pedidos.forEach((p) => {
        const don = donacionPorPedido.get(p.id);
        if (don) p.total = Number(p.total || 0) - don;
      });
    }

    const pedidosConCodigo = pedidos.filter((p) => p.promocode_id != null);
    const pedidosSinCodigo = pedidos.filter((p) => p.promocode_id == null);

    // Items para pedidos con código (para calcular COGS y margen)
    let items: ItemConCosto[] = [];
    const idsConCodigo = pedidosConCodigo.map((p) => p.id);
    if (idsConCodigo.length > 0) {
      const { data, error } = await db
        .from("pedido_items")
        .select("pedido_id, cantidad, subtotal, costo_unitario_venta")
        .in("pedido_id", idsConCodigo);
      if (error) throw error;
      items = (data || []) as ItemConCosto[];
    }

    const cogsPorPedido = new Map<number, number>();
    items.forEach((i) => {
      const costo = i.costo_unitario_venta == null ? 0 : Number(i.costo_unitario_venta);
      cogsPorPedido.set(
        i.pedido_id,
        (cogsPorPedido.get(i.pedido_id) || 0) + Number(i.cantidad) * costo
      );
    });

    // KPIs globales
    const ventasTotales = pedidos.reduce((a, p) => a + Number(p.total || 0), 0);
    const totalDescontado = pedidosConCodigo.reduce(
      (a, p) => a + Number(p.descuento || 0),
      0
    );
    const cantidadUsos = pedidosConCodigo.length;
    const descuentoSobreVentasPct =
      ventasTotales > 0 ? (totalDescontado / ventasTotales) * 100 : null;

    const ventasConCodigo = pedidosConCodigo.reduce(
      (a, p) => a + Number(p.total || 0),
      0
    );
    const cogsConCodigo = pedidosConCodigo.reduce(
      (a, p) => a + (cogsPorPedido.get(p.id) || 0),
      0
    );
    const margenRestante = ventasConCodigo - cogsConCodigo;
    const margenRestantePct =
      ventasConCodigo > 0 ? (margenRestante / ventasConCodigo) * 100 : null;

    const ticketConCodigo =
      cantidadUsos > 0 ? ventasConCodigo / cantidadUsos : 0;
    const ticketSinCodigo =
      pedidosSinCodigo.length > 0
        ? pedidosSinCodigo.reduce((a, p) => a + Number(p.total || 0), 0) /
          pedidosSinCodigo.length
        : 0;

    // Ranking de códigos
    const rankingMap = new Map<
      number,
      {
        codigo: string;
        descripcion: string | null;
        usos: number;
        descontado: number;
        facturacion: number;
        cogs: number;
      }
    >();
    pedidosConCodigo.forEach((p) => {
      const cod = promocodes.find((c) => c.id === p.promocode_id);
      const prev = rankingMap.get(p.promocode_id!) || {
        codigo: cod?.codigo || p.promocode_codigo || `#${p.promocode_id}`,
        descripcion: cod?.descripcion || null,
        usos: 0,
        descontado: 0,
        facturacion: 0,
        cogs: 0,
      };
      rankingMap.set(p.promocode_id!, {
        ...prev,
        usos: prev.usos + 1,
        descontado: prev.descontado + Number(p.descuento || 0),
        facturacion: prev.facturacion + Number(p.total || 0),
        cogs: prev.cogs + (cogsPorPedido.get(p.id) || 0),
      });
    });

    const ranking: PromocodeRanking[] = Array.from(rankingMap.entries())
      .map(([promocode_id, v]) => {
        const margen = v.facturacion - v.cogs;
        return {
          promocode_id,
          codigo: v.codigo,
          descripcion: v.descripcion,
          usos: v.usos,
          descontado: v.descontado,
          facturacion: v.facturacion,
          cogs: v.cogs,
          margen,
          margenPct: v.facturacion > 0 ? (margen / v.facturacion) * 100 : null,
        };
      })
      .sort((a, b) => b.usos - a.usos);

    // Acumulación con precio socio
    const conPrecioSocio = pedidosConCodigo.filter((p) => p.aplico_precio_socio).length;
    const soloDescuento = cantidadUsos - conPrecioSocio;

    // Estados de códigos
    const ahora = Date.now();
    const detalleEstados: PromocodeEstado[] = promocodes.map((c) => {
      const inicioMs = new Date(c.fecha_inicio).getTime();
      const finMs = new Date(c.fecha_fin).getTime();
      const agotado = c.usos_max != null && c.usos_actuales >= c.usos_max;
      const vigente =
        c.activo && inicioMs <= ahora && finMs >= ahora && !agotado;
      const sinUso = c.usos_actuales === 0;
      return {
        promocode_id: c.id,
        codigo: c.codigo,
        descripcion: c.descripcion,
        activo: c.activo,
        vigente,
        agotado,
        sinUso,
        fecha_inicio: c.fecha_inicio,
        fecha_fin: c.fecha_fin,
        usos_actuales: c.usos_actuales,
        usos_max: c.usos_max,
      };
    });

    const contadoresEstado = {
      vigentes: detalleEstados.filter((e) => e.vigente).length,
      vencidos: detalleEstados.filter(
        (e) => new Date(e.fecha_fin).getTime() < ahora
      ).length,
      agotados: detalleEstados.filter((e) => e.agotado).length,
      sinUso: detalleEstados.filter((e) => e.sinUso).length,
    };

    const reporte: ReportePromocodes = {
      rango,
      totalDescontado,
      cantidadUsos,
      descuentoSobreVentasPct,
      margenRestante,
      margenRestantePct,
      ticketConCodigo,
      ticketSinCodigo,
      ranking,
      acumulacionPrecioSocio: { conPrecioSocio, soloDescuento },
      contadoresEstado,
      detalleEstados,
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
