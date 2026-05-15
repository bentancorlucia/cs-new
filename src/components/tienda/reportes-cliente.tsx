"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileDown, FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { springSmooth } from "@/lib/motion";
import { DateRangePicker } from "./reportes/date-range-picker";
import { TabGeneral } from "./reportes/tab-general";
import { TabDonaciones } from "./reportes/tab-donaciones";
import { TabPromocodes } from "./reportes/tab-promocodes";
import { exportarReporteExcel } from "@/lib/excel/reporte-excel";
import type {
  RangoFechas,
  ReporteScope,
  ReporteTienda,
  ReporteDonaciones,
  ReportePromocodes,
} from "@/types/reportes";

const TABS: { id: ReporteScope; label: string }[] = [
  { id: "tienda", label: "General" },
  { id: "donaciones", label: "Donaciones" },
  { id: "promocodes", label: "Promocodes" },
];

function rangoInicial(): RangoFechas {
  const hoy = new Date();
  const desde = new Date(hoy);
  desde.setDate(desde.getDate() - 29);
  const toYmd = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  return { desde: toYmd(desde), hasta: toYmd(hoy) };
}

type Estado<T> =
  | { loading: true; data: null; error: null }
  | { loading: false; data: T; error: null }
  | { loading: false; data: null; error: string };

const inicial = <T,>(): Estado<T> => ({ loading: true, data: null, error: null });

export function ReportesCliente() {
  const [tab, setTab] = useState<ReporteScope>("tienda");
  const [rango, setRango] = useState<RangoFechas>(rangoInicial());
  const [tienda, setTienda] = useState<Estado<ReporteTienda>>(inicial());
  const [donaciones, setDonaciones] = useState<Estado<ReporteDonaciones>>(inicial());
  const [promocodes, setPromocodes] = useState<Estado<ReportePromocodes>>(inicial());
  const [exportando, setExportando] = useState<"pdf" | "excel" | null>(null);

  const fetchScope = useCallback(
    async (scope: ReporteScope, signal?: AbortSignal) => {
      const setLoading = () => {
        if (scope === "tienda") setTienda({ loading: true, data: null, error: null });
        if (scope === "donaciones") setDonaciones({ loading: true, data: null, error: null });
        if (scope === "promocodes") setPromocodes({ loading: true, data: null, error: null });
      };
      const setError = (msg: string) => {
        if (scope === "tienda") setTienda({ loading: false, data: null, error: msg });
        if (scope === "donaciones") setDonaciones({ loading: false, data: null, error: msg });
        if (scope === "promocodes") setPromocodes({ loading: false, data: null, error: msg });
      };
      setLoading();
      try {
        const res = await fetch(
          `/api/admin/reportes/${scope}?desde=${rango.desde}&hasta=${rango.hasta}`,
          { signal }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Error");
        if (scope === "tienda")
          setTienda({ loading: false, data: json.data as ReporteTienda, error: null });
        if (scope === "donaciones")
          setDonaciones({ loading: false, data: json.data as ReporteDonaciones, error: null });
        if (scope === "promocodes")
          setPromocodes({ loading: false, data: json.data as ReportePromocodes, error: null });
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Error desconocido");
      }
    },
    [rango]
  );

  useEffect(() => {
    const ctrl = new AbortController();
    fetchScope("tienda", ctrl.signal);
    fetchScope("donaciones", ctrl.signal);
    fetchScope("promocodes", ctrl.signal);
    return () => ctrl.abort();
  }, [fetchScope]);

  const getActiveData = () =>
    tab === "tienda" ? tienda.data : tab === "donaciones" ? donaciones.data : promocodes.data;

  const handleDownloadExcel = async () => {
    setExportando("excel");
    try {
      const data = getActiveData();
      if (!data) throw new Error("Sin datos");
      await exportarReporteExcel(tab, data, rango);
    } catch (e) {
      console.error(e);
      alert(`Error al generar Excel: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setExportando(null);
    }
  };

  const handleDownloadPdf = async () => {
    setExportando("pdf");
    try {
      const data = getActiveData();
      if (!data) throw new Error("Sin datos");

      const res = await fetch(`/api/admin/reportes/${tab}/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rango, data }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Error generando PDF");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte-${tab}-${rango.desde}_${rango.hasta}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert(`Error al generar PDF: ${e instanceof Error ? e.message : "error"}`);
    } finally {
      setExportando(null);
    }
  };

  const activeEstado =
    tab === "tienda" ? tienda : tab === "donaciones" ? donaciones : promocodes;

  return (
    <div className="space-y-5">
      {/* Controles sticky */}
      <div className="sticky top-0 z-20 -mx-4 sm:mx-0 px-4 sm:px-0 py-2 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 border-b border-border/60 sm:border-0 sm:bg-transparent sm:backdrop-blur-0 sm:py-0">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="inline-flex rounded-full border border-border bg-card p-1 text-xs">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative px-4 py-1.5 rounded-full font-heading transition-colors ${
                  tab === t.id
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === t.id && (
                  <motion.span
                    layoutId="reportesTab"
                    className="absolute inset-0 rounded-full bg-primary"
                    transition={springSmooth}
                  />
                )}
                <span className="relative z-10">{t.label}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker value={rango} onChange={setRango} />
            <Button
              size="sm"
              variant="outline"
              className="gap-2 h-9"
              onClick={handleDownloadExcel}
              disabled={activeEstado.loading || !activeEstado.data || exportando !== null}
            >
              {exportando === "excel" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Excel</span>
            </Button>
            <Button
              size="sm"
              className="gap-2 h-9 bg-primary text-primary-foreground"
              onClick={handleDownloadPdf}
              disabled={activeEstado.loading || !activeEstado.data || exportando !== null}
            >
              {exportando === "pdf" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">PDF</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Contenido del tab */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={springSmooth}
        >
          {activeEstado.loading ? (
            <ReportesSkeleton />
          ) : activeEstado.error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900/40 p-4 text-sm text-rose-900 dark:text-rose-200">
              {activeEstado.error}
            </div>
          ) : tab === "tienda" && tienda.data ? (
            <TabGeneral data={tienda.data} />
          ) : tab === "donaciones" && donaciones.data ? (
            <TabDonaciones data={donaciones.data} />
          ) : tab === "promocodes" && promocodes.data ? (
            <TabPromocodes data={promocodes.data} />
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ReportesSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}
