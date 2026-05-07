import { createAdminClient } from "@/lib/supabase/admin";

export type Cotizacion = {
  fecha: string; // YYYY-MM-DD
  moneda: "USD";
  compra: number;
  venta: number;
  fuente: string;
};

const BCU_TIMEOUT_MS = 5000;

/**
 * Fetch USD/UYU rate from BCU. Strategy: try BCU's SOAP web service first,
 * fall back to a public proxy. Both return BCU official rates.
 *
 * Public docs:
 *  - https://www.bcu.gub.uy/Estadisticas-e-Indicadores/Paginas/Cotizaciones.aspx
 *  - dolarapi.com mirrors BCU oficial.
 */
async function fetchBcuOficial(): Promise<Cotizacion | null> {
  try {
    const res = await fetch("https://uy.dolarapi.com/v1/cotizaciones/usd", {
      signal: AbortSignal.timeout(BCU_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      compra?: number;
      venta?: number;
      fechaActualizacion?: string;
    };
    if (typeof data.compra !== "number" || typeof data.venta !== "number") {
      return null;
    }
    const fecha = data.fechaActualizacion
      ? data.fechaActualizacion.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    return {
      fecha,
      moneda: "USD",
      compra: data.compra,
      venta: data.venta,
      fuente: "bcu_oficial",
    };
  } catch {
    return null;
  }
}

/**
 * Returns today's BCU rate. Reads from `cotizaciones_bcu` cache; if missing
 * or stale, fetches and persists a new snapshot.
 */
export async function getCotizacionVigente(): Promise<Cotizacion | null> {
  const supabase = createAdminClient();
  const hoy = new Date().toISOString().slice(0, 10);

  const { data: cached } = await supabase
    .from("cotizaciones_bcu")
    .select("fecha, moneda, compra, venta, fuente")
    .eq("fecha", hoy)
    .eq("moneda", "USD")
    .maybeSingle();

  if (cached) {
    return {
      fecha: cached.fecha,
      moneda: "USD",
      compra: Number(cached.compra),
      venta: Number(cached.venta),
      fuente: cached.fuente,
    };
  }

  const fresh = await fetchBcuOficial();
  if (!fresh) {
    // No live data — return last known snapshot if any.
    const { data: last } = await supabase
      .from("cotizaciones_bcu")
      .select("fecha, moneda, compra, venta, fuente")
      .eq("moneda", "USD")
      .order("fecha", { ascending: false })
      .limit(1)
      .maybeSingle();
    return last
      ? {
          fecha: last.fecha,
          moneda: "USD",
          compra: Number(last.compra),
          venta: Number(last.venta),
          fuente: last.fuente,
        }
      : null;
  }

  await supabase.from("cotizaciones_bcu").upsert(
    {
      fecha: fresh.fecha,
      moneda: fresh.moneda,
      compra: fresh.compra,
      venta: fresh.venta,
      fuente: fresh.fuente,
    },
    { onConflict: "fecha" }
  );

  return fresh;
}

/** Force-refresh the cache for today (used by manual refresh button). */
export async function refrescarCotizacion(): Promise<Cotizacion | null> {
  const fresh = await fetchBcuOficial();
  if (!fresh) return null;

  const supabase = createAdminClient();
  await supabase.from("cotizaciones_bcu").upsert(
    {
      fecha: fresh.fecha,
      moneda: fresh.moneda,
      compra: fresh.compra,
      venta: fresh.venta,
      fuente: fresh.fuente,
    },
    { onConflict: "fecha" }
  );
  return fresh;
}
