"use client";

import { motion } from "framer-motion";
import type { FilaResumenCaja } from "@/lib/comercial/caja";
import { pesos } from "@/components/pos/formato";
import { fadeInUp, staggerContainerFast } from "@/lib/motion";

/** Resumen de una sesión de caja (resumen_caja): qué entró y salió, por concepto. */
export function TablaResumen({ filas }: { filas: FilaResumenCaja[] }) {
  if (filas.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-linea px-4 py-3 text-sm text-muted-foreground">
        Sin movimientos de efectivo en esta sesión.
      </p>
    );
  }
  const entradas = filas.reduce((s, f) => s + f.entradas, 0);
  const salidas = filas.reduce((s, f) => s + f.salidas, 0);
  return (
    <div className="overflow-hidden rounded-xl border border-linea">
      <table className="w-full text-sm">
        <thead className="bg-superficie text-[11px] uppercase tracking-editorial text-muted-foreground font-heading">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Concepto</th>
            <th className="px-3 py-2 text-right font-medium">Entró</th>
            <th className="px-3 py-2 text-right font-medium">Salió</th>
          </tr>
        </thead>
        <motion.tbody variants={staggerContainerFast} initial="hidden" animate="visible">
          {filas.map((f) => (
            <motion.tr key={f.concepto} variants={fadeInUp} className="border-t border-linea">
              <td className="px-3 py-2">
                {f.concepto}
                <span className="ml-1 text-xs text-muted-foreground">({f.cantidad})</span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-green-700">{f.entradas > 0 ? pesos(f.entradas) : ""}</td>
              <td className="px-3 py-2 text-right tabular-nums text-red-700">{f.salidas > 0 ? pesos(f.salidas) : ""}</td>
            </motion.tr>
          ))}
          <motion.tr variants={fadeInUp} className="border-t border-linea bg-superficie/60 font-heading font-semibold">
            <td className="px-3 py-2">Neto de la sesión</td>
            <td className="px-3 py-2 text-right tabular-nums" colSpan={2}>
              {pesos(entradas - salidas)}
            </td>
          </motion.tr>
        </motion.tbody>
      </table>
    </div>
  );
}
