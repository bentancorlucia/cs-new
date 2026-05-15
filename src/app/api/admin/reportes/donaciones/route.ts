import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/supabase/roles";
import {
  parseRango,
  rangoToTimestamps,
  debeAgruparPorSemana,
} from "@/lib/reportes/rango";
import { ESTADOS_VENTA_EFECTIVA, type ReporteDonaciones } from "@/types/reportes";

export const dynamic = "force-dynamic";

const TIENDA_ROLES = ["super_admin", "tienda"];

// Fecha desde la cual existe el prompt de donación en checkout.
// Pedidos previos a esta fecha no podían donar, así que no cuentan en el
// denominador de la tasa de conversión.
const FECHA_INICIO_DONACIONES = "2026-05-13";

export async function GET(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const db = createAdminClient();

    const { searchParams } = new URL(request.url);
    const rango = parseRango(searchParams);
    const { desdeIso, hastaIso } = rangoToTimestamps(rango);

    // Denominador de conversión: solo cuentan pedidos desde que el prompt existe.
    const desdeConversion =
      rango.desde >= FECHA_INICIO_DONACIONES ? rango.desde : FECHA_INICIO_DONACIONES;
    const desdeConversionIso = `${desdeConversion}T00:00:00`;
    const rangoIncluyeDonaciones = rango.hasta >= FECHA_INICIO_DONACIONES;

    // Donaciones solo se cobran en checkout online, así que para todos los
    // cálculos (numerador y denominador) filtramos pedidos.tipo = 'online'.
    const pedidosQuery = rangoIncluyeDonaciones
      ? db
          .from("pedidos")
          .select("id", { count: "exact", head: true })
          .gte("created_at", desdeConversionIso)
          .lte("created_at", hastaIso)
          .eq("tipo", "online")
          .in("estado", ESTADOS_VENTA_EFECTIVA as unknown as string[])
      : Promise.resolve({ count: 0, error: null });

    const [donRes, pedRes, configRes] = await Promise.all([
      db
        .from("donaciones")
        .select(
          "id, pedido_id, monto, estado, created_at, pedidos!inner(numero_pedido, tipo)"
        )
        .gte("created_at", desdeIso)
        .lte("created_at", hastaIso)
        .eq("pedidos.tipo", "online"),
      pedidosQuery,
      db
        .from("donaciones_config")
        .select("activo")
        .eq("id", 1)
        .maybeSingle(),
    ]);

    if (donRes.error) throw donRes.error;
    if ("error" in pedRes && pedRes.error) throw pedRes.error;

    const donaciones = (donRes.data || []) as Array<{
      id: number;
      pedido_id: number;
      monto: number;
      estado: string;
      created_at: string;
      pedidos: { numero_pedido: string | null; tipo: string } | null;
    }>;

    const totalDonado = donaciones.reduce((acc, d) => acc + Number(d.monto), 0);
    const cantidad = donaciones.length;
    const promedio = cantidad > 0 ? totalDonado / cantidad : 0;
    const pedidosPagados = pedRes.count || 0;
    const tasaConversionPct =
      pedidosPagados > 0 ? (cantidad / pedidosPagados) * 100 : null;
    const conversionRecortada = rango.desde < FECHA_INICIO_DONACIONES;

    // Desglose por estado
    const estadoMap = new Map<string, { cantidad: number; total: number }>();
    donaciones.forEach((d) => {
      const prev = estadoMap.get(d.estado) || { cantidad: 0, total: 0 };
      estadoMap.set(d.estado, {
        cantidad: prev.cantidad + 1,
        total: prev.total + Number(d.monto),
      });
    });
    const porEstado = Array.from(estadoMap.entries()).map(([clave, v]) => ({
      clave,
      cantidad: v.cantidad,
      total: v.total,
    }));

    // Serie temporal
    const porSemana = debeAgruparPorSemana(rango);
    const serieMap = new Map<string, { monto: number; cantidad: number }>();
    donaciones.forEach((d) => {
      const fecha = new Date(d.created_at);
      const clave = porSemana ? toClaveSemana(fecha) : toYmd(fecha);
      const prev = serieMap.get(clave) || { monto: 0, cantidad: 0 };
      serieMap.set(clave, {
        monto: prev.monto + Number(d.monto),
        cantidad: prev.cantidad + 1,
      });
    });
    const serie = Array.from(serieMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, v]) => ({ fecha, monto: v.monto, cantidad: v.cantidad }));

    const detalle = donaciones
      .map((d) => ({
        id: d.id,
        pedido_id: d.pedido_id,
        monto: Number(d.monto),
        estado: d.estado,
        created_at: d.created_at,
        numero_pedido: d.pedidos?.numero_pedido ?? null,
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    const reporte: ReporteDonaciones = {
      rango,
      totalDonado,
      cantidad,
      promedio,
      pedidosPagados,
      tasaConversionPct,
      conversionDesde: rangoIncluyeDonaciones ? desdeConversion : null,
      conversionRecortada,
      porEstado,
      serie,
      detalle,
      configActiva: Boolean(configRes.data?.activo),
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

function toYmd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toClaveSemana(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}
