import type { Metadata } from "next";
import { esScope, puedeVerReportes } from "@/lib/reportes/acceso";
import { parseRango, RangoInvalidoError } from "@/lib/reportes/rango";
import { generarReporteDonaciones, generarReportePromocodes, generarReporteTienda } from "@/lib/reportes/tienda";
import { TituloReporte } from "@/components/contabilidad/reportes/titulo-reporte";
import { ReportesCliente, type ReporteActivo } from "@/components/tienda/reportes-cliente";
import type { RangoFechas, ReporteScope } from "@/types/reportes";

export const metadata: Metadata = { title: "Reportes de tienda" };
export const dynamic = "force-dynamic";

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; desde?: string; hasta?: string }>;
}) {
  const sp = await searchParams;
  const scope: ReporteScope = sp.tab && esScope(sp.tab) ? sp.tab : "tienda";

  let rango: RangoFechas;
  let error: string | null = null;
  try {
    rango = parseRango(new URLSearchParams({ ...(sp.desde ? { desde: sp.desde } : {}), ...(sp.hasta ? { hasta: sp.hasta } : {}) }));
  } catch (e) {
    error = e instanceof RangoInvalidoError ? e.message : "Rango inválido";
    rango = parseRango(new URLSearchParams());
  }

  let reporte: ReporteActivo | null = null;
  if (!(await puedeVerReportes())) {
    error = "No tenés permiso para ver los reportes de la tienda.";
  } else if (!error) {
    try {
      reporte =
        scope === "tienda"
          ? { scope, data: await generarReporteTienda(rango) }
          : scope === "donaciones"
            ? { scope, data: await generarReporteDonaciones(rango) }
            : { scope, data: await generarReportePromocodes(rango) };
    } catch (e) {
      console.error("[admin/reportes]", e);
      error = e instanceof Error ? e.message : "No se pudo calcular el reporte";
    }
  }

  return (
    <div className="space-y-5">
      <TituloReporte
        etiqueta="Tienda"
        titulo="Reportes"
        descripcion="Ventas a fecha contable, costo del kardex y control contra la contabilidad. Exportables a Excel y PDF."
      />
      <ReportesCliente scope={scope} rango={rango} reporte={reporte} error={error} />
    </div>
  );
}
