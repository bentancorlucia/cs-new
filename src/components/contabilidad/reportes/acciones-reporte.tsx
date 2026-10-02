"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { FileSpreadsheet, Loader2, Printer } from "lucide-react";
import { springBouncy } from "@/lib/motion";

// ------------------------------------------------------------
// Excel
// ------------------------------------------------------------

export type CeldaExcel = string | number | null;

export interface ColumnaExcel {
  titulo: string;
  /** Ancho en caracteres. */
  ancho?: number;
  /** "importe" aplica formato #.##0,00 (y TC con 4 decimales si es "tc"). */
  tipo?: "texto" | "importe" | "tc" | "entero";
}

export interface HojaExcel {
  nombre: string;
  titulo: string;
  subtitulo: string;
  columnas: ColumnaExcel[];
  filas: CeldaExcel[][];
}

const FORMATO: Record<NonNullable<ColumnaExcel["tipo"]>, string | null> = {
  texto: null,
  importe: "#,##0.00;-#,##0.00",
  tc: "0.0000",
  entero: "0",
};

/** Genera y descarga un .xlsx (xlsx se carga recién al exportar). */
export async function exportarExcel(archivo: string, hojas: HojaExcel[]): Promise<void> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const h of hojas) {
    const encabezado = 5; // filas antes de los datos
    const aoa: CeldaExcel[][] = [
      ["Club Seminario"],
      [h.titulo],
      [h.subtitulo],
      [],
      h.columnas.map((c) => c.titulo),
      ...h.filas,
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = h.columnas.map((c) => ({ wch: c.ancho ?? (c.tipo === "texto" || !c.tipo ? 30 : 16) }));
    h.columnas.forEach((c, ci) => {
      const z = FORMATO[c.tipo ?? "texto"];
      if (!z) return;
      for (let r = 0; r < h.filas.length; r++) {
        const ref = XLSX.utils.encode_cell({ r: r + encabezado, c: ci });
        const celda = ws[ref];
        if (celda && celda.t === "n") celda.z = z;
      }
    });
    XLSX.utils.book_append_sheet(wb, ws, h.nombre.slice(0, 31));
  }
  XLSX.writeFile(wb, archivo.endsWith(".xlsx") ? archivo : `${archivo}.xlsx`);
}

// ------------------------------------------------------------
// Botones
// ------------------------------------------------------------

export function AccionesReporte({
  onExcel,
  deshabilitado,
}: {
  onExcel: () => Promise<void> | void;
  deshabilitado?: boolean;
}) {
  const [exportando, setExportando] = useState(false);

  const excel = async () => {
    setExportando(true);
    try {
      await onExcel();
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="flex items-center gap-2 print:hidden">
      <motion.button
        type="button"
        onClick={excel}
        disabled={deshabilitado || exportando}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.96 }}
        transition={springBouncy}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-linea bg-white px-3.5 text-xs font-heading text-foreground hover:border-bordo-200 hover:text-bordo-800 disabled:opacity-50 transition-colors"
      >
        {exportando ? <Loader2 className="size-3.5 animate-spin" /> : <FileSpreadsheet className="size-3.5" />}
        Excel
      </motion.button>
      <motion.button
        type="button"
        onClick={() => window.print()}
        disabled={deshabilitado}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.96 }}
        transition={springBouncy}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-linea bg-white px-3.5 text-xs font-heading text-foreground hover:border-bordo-200 hover:text-bordo-800 disabled:opacity-50 transition-colors"
      >
        <Printer className="size-3.5" />
        Imprimir
      </motion.button>
    </div>
  );
}

// ------------------------------------------------------------
// Impresión
// ------------------------------------------------------------

/**
 * Estilos de impresión: oculta la navegación del dashboard y los controles,
 * y deja las tablas sin scroll. Se monta dentro de cada reporte.
 */
const CSS_IMPRESION = `
@media print {
  @page { size: A4; margin: 12mm 10mm; }
  html, body { background: #fff !important; }
  aside, .lg\\:hidden.fixed, .lg\\:hidden.h-14, [data-sonner-toaster] { display: none !important; }
  main { padding: 0 !important; min-height: 0 !important; }
  .min-h-screen { min-height: 0 !important; background: #fff !important; }
  .reporte-scroll { overflow: visible !important; }
  .reporte-scroll table { min-width: 0 !important; width: 100% !important; }
  .reporte-tabla { font-size: 9pt !important; }
  .reporte-tabla td, .reporte-tabla th { padding-top: 2px !important; padding-bottom: 2px !important; }
  .reporte-tabla tr { break-inside: avoid; }
  .reporte-tarjeta { box-shadow: none !important; border-color: #ddd !important; break-inside: avoid; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

export function EncabezadoImpresion({ reporte, detalle }: { reporte: string; detalle: string }) {
  return (
    <>
      <style>{CSS_IMPRESION}</style>
      <div className="hidden print:block mb-4 border-b border-neutral-300 pb-2">
        <div className="font-heading text-[13pt] text-black">
          Club Seminario — {reporte} — {detalle}
        </div>
        <div className="text-[8pt] text-neutral-500">
          Asociación civil · Importes en pesos uruguayos salvo indicación
        </div>
      </div>
    </>
  );
}
