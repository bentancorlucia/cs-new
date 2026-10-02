"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { FileDown, FileSpreadsheet, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { springBouncy, springSmooth } from "@/lib/motion";
import { formatFecha } from "@/lib/contabilidad/formato";
import { NOMBRE_SCOPE } from "@/lib/reportes/etiquetas";
import { EncabezadoImpresion } from "@/components/contabilidad/reportes/acciones-reporte";
import { DateRangePicker } from "./reportes/date-range-picker";
import { TabGeneral } from "./reportes/tab-general";
import { TabDonaciones } from "./reportes/tab-donaciones";
import { TabPromocodes } from "./reportes/tab-promocodes";
import type {
  FormatoExport,
  RangoFechas,
  ReporteDonaciones,
  ReportePromocodes,
  ReporteScope,
  ReporteTienda,
} from "@/types/reportes";

const TABS: ReporteScope[] = ["tienda", "donaciones", "promocodes"];

export type ReporteActivo =
  | { scope: "tienda"; data: ReporteTienda }
  | { scope: "donaciones"; data: ReporteDonaciones }
  | { scope: "promocodes"; data: ReportePromocodes };

/**
 * Los reportes se calculan en el servidor (page.tsx) con el rango y la
 * pestaña de la URL; acá solo se navega. Excel y PDF los arma el servidor
 * con el mismo cálculo.
 */
export function ReportesCliente({
  scope,
  rango,
  reporte,
  error,
}: {
  scope: ReporteScope;
  rango: RangoFechas;
  reporte: ReporteActivo | null;
  error: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [cargando, startTransition] = useTransition();
  const [destino, setDestino] = useState<ReporteScope>(scope);
  const [exportando, setExportando] = useState<FormatoExport | null>(null);

  const ir = (s: ReporteScope, r: RangoFechas) => {
    setDestino(s);
    const q = new URLSearchParams({ tab: s, desde: r.desde, hasta: r.hasta });
    startTransition(() => router.push(`${pathname}?${q}`, { scroll: false }));
  };

  const exportar = async (formato: FormatoExport) => {
    setExportando(formato);
    try {
      const q = new URLSearchParams({ desde: rango.desde, hasta: rango.hasta });
      const res = await fetch(`/api/admin/reportes/${scope}/${formato}?${q}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "No se pudo generar el archivo");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-${scope}-${rango.desde}_${rango.hasta}.${formato === "pdf" ? "pdf" : "xlsx"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar el archivo");
    } finally {
      setExportando(null);
    }
  };

  const tabVisible = cargando ? destino : scope;

  return (
    <div className="space-y-5">
      <EncabezadoImpresion
        reporte={`Tienda — ${NOMBRE_SCOPE[scope]}`}
        detalle={`del ${formatFecha(rango.desde)} al ${formatFecha(rango.hasta)}`}
      />

      {/* Controles */}
      <div className="sticky top-14 z-20 -mx-4 border-b border-linea bg-fondo/85 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-fondo/70 sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-0 lg:top-0 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-full border border-linea bg-white p-1 text-xs shadow-sm">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => t !== tabVisible && ir(t, rango)}
                className={`relative rounded-full px-4 py-1.5 font-heading transition-colors ${
                  tabVisible === t ? "text-white" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tabVisible === t && (
                  <motion.span layoutId="reportes-tab" className="absolute inset-0 rounded-full bg-bordo-800" transition={springSmooth} />
                )}
                <span className="relative z-10">{NOMBRE_SCOPE[t]}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker value={rango} onChange={(r) => ir(scope, r)} />
            {(["excel", "pdf"] as const).map((f) => (
              <motion.div key={f} whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }} transition={springBouncy}>
                <Button
                  size="sm"
                  variant={f === "pdf" ? "default" : "outline"}
                  className="h-9 gap-2 rounded-full"
                  onClick={() => exportar(f)}
                  disabled={!reporte || cargando || exportando !== null}
                >
                  {exportando === f ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : f === "pdf" ? (
                    <FileDown className="size-4" />
                  ) : (
                    <FileSpreadsheet className="size-4" />
                  )}
                  <span className="hidden sm:inline">{f === "pdf" ? "PDF" : "Excel"}</span>
                </Button>
              </motion.div>
            ))}
            <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }} transition={springBouncy}>
              <Button size="sm" variant="ghost" className="h-9 rounded-full" onClick={() => window.print()} disabled={!reporte} aria-label="Imprimir">
                <Printer className="size-4" />
              </Button>
            </motion.div>
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Del {formatFecha(rango.desde)} al {formatFecha(rango.hasta)}
          {reporte?.scope === "tienda" && ` · comparado con ${formatFecha(reporte.data.rangoAnterior.desde)} al ${formatFecha(reporte.data.rangoAnterior.hasta)}`}
        </p>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={cargando ? "cargando" : `${scope}-${rango.desde}-${rango.hasta}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={springSmooth}
        >
          {cargando ? (
            <ReportesSkeleton />
          ) : error || !reporte ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
              {error ?? "No se pudo calcular el reporte"}
            </div>
          ) : reporte.scope === "tienda" ? (
            <TabGeneral data={reporte.data} />
          ) : reporte.scope === "donaciones" ? (
            <TabDonaciones data={reporte.data} />
          ) : (
            <TabPromocodes data={reporte.data} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ReportesSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-16 rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}
