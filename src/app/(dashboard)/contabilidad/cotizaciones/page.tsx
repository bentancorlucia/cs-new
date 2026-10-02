import { createContabilidadClient } from "@/lib/contabilidad/server";
import { permisosContabilidad } from "@/lib/contabilidad/permisos";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import {
  CotizacionesCliente,
  type CotizacionVista,
} from "@/components/contabilidad/cotizaciones/cotizaciones-cliente";

export const dynamic = "force-dynamic";

const DIAS = 60;

function restarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - dias)).toISOString().slice(0, 10);
}

export default async function CotizacionesPage() {
  const [{ puedeEscribir }, db] = await Promise.all([
    permisosContabilidad(),
    createContabilidadClient(),
  ]);
  const hoy = hoyUruguay();

  const { data, error } = await db
    .from("cotizaciones")
    .select("fecha, tasa, fuente")
    .eq("moneda", "USD")
    .gte("fecha", restarDias(hoy, DIAS))
    .order("fecha", { ascending: false });

  const cotizaciones: CotizacionVista[] = (data ?? []).map((c) => ({
    fecha: c.fecha,
    tasa: Number(c.tasa),
    fuente: c.fuente === "bcu" ? "bcu" : "manual",
  }));

  return (
    <CotizacionesCliente
      cotizaciones={cotizaciones}
      puedeEscribir={puedeEscribir}
      hoy={hoy}
      dias={DIAS}
      error={error ? error.message : null}
    />
  );
}
