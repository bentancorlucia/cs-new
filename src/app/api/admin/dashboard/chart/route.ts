import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/supabase/roles";
import { uruguayNowParts, uruguayDayStartUTC, uruguayDateKey } from "@/lib/timezone";

const TIENDA_ROLES = ["super_admin", "tienda"];

type Period = "7d" | "1m" | "3m" | "6m" | "1y";
type Bucket = "day" | "week" | "month";

const PERIOD_CONFIG: Record<Period, { days: number; bucket: Bucket }> = {
  "7d": { days: 7, bucket: "day" },
  "1m": { days: 30, bucket: "day" },
  "3m": { days: 90, bucket: "week" },
  "6m": { days: 180, bucket: "week" },
  "1y": { days: 365, bucket: "month" },
};

function bucketKey(dateKey: string, bucket: Bucket): string {
  if (bucket === "day") return dateKey;
  if (bucket === "month") return dateKey.substring(0, 7);
  // Week: shift to Monday of that week (UTC math is safe — Uruguay has no DST)
  const d = new Date(dateKey + "T12:00:00Z");
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return uruguayDateKey(d);
}

export async function GET(req: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const periodParam = req.nextUrl.searchParams.get("period") as Period | null;
    const period: Period = periodParam && PERIOD_CONFIG[periodParam] ? periodParam : "7d";
    const config = PERIOD_CONFIG[period];

    const supabase = createAdminClient();
    const { year, month, day } = uruguayNowParts();
    const startISO = uruguayDayStartUTC(year, month, day - (config.days - 1)).toISOString();

    const { data, error } = await supabase
      .from("pedidos")
      .select("total, created_at, tipo, donaciones(monto, estado)")
      .gte("created_at", startISO)
      .in("estado", ["pagado", "encargado", "preparando", "listo_retiro", "retirado"])
      .order("created_at", { ascending: true });

    if (error) throw error;

    const buckets: Record<string, { online: number; pos: number; total: number }> = {};

    for (let i = config.days - 1; i >= 0; i--) {
      const dayKey = uruguayDateKey(uruguayDayStartUTC(year, month, day - i));
      const key = bucketKey(dayKey, config.bucket);
      if (!buckets[key]) buckets[key] = { online: 0, pos: 0, total: 0 };
    }

    data?.forEach((p: any) => {
      if (!p.created_at) return;
      const dayKey = uruguayDateKey(p.created_at);
      const key = bucketKey(dayKey, config.bucket);
      if (!buckets[key]) return;

      // Restar donación (objeto u array por PostgREST)
      const d = Array.isArray(p.donaciones)
        ? p.donaciones[0] ?? null
        : p.donaciones ?? null;
      const donacionActiva =
        d && d.estado !== "cancelada" ? Number(d.monto) || 0 : 0;
      const venta = (p.total || 0) - donacionActiva;

      buckets[key].total += venta;
      if (p.tipo === "online") buckets[key].online += venta;
      else buckets[key].pos += venta;
    });

    const chartData = Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, vals]) => ({ fecha, ...vals }));

    return NextResponse.json({ data: chartData, bucket: config.bucket, period });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
