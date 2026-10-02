"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { easeSmooth, springSmooth } from "@/lib/motion";
import { formatImporte } from "@/lib/contabilidad/formato";
import type { ControlContable } from "@/types/reportes";

const fmt = (v: number) => formatImporte(v, "UYU");

/**
 * "Cuadra con la contabilidad": el total del reporte contra el saldo de las
 * cuentas en el mayor, con las partidas que lo explican.
 */
export function ControlContableCard({ controles, descripcion }: { controles: ControlContable[]; descripcion: string }) {
  const cuadra = controles.every((c) => c.cuadra);
  const [abierto, setAbierto] = useState(!cuadra);

  return (
    <motion.section
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={easeSmooth}
      className={cn(
        "reporte-tarjeta overflow-hidden rounded-2xl border",
        cuadra ? "border-emerald-200 bg-emerald-50/60" : "border-amber-300 bg-amber-50"
      )}
    >
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-start gap-3 p-4 text-left"
        aria-expanded={abierto}
      >
        <motion.span
          initial={{ scale: 0.6, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 18, delay: 0.15 }}
          className={cn("mt-0.5 rounded-full p-1.5", cuadra ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800")}
        >
          {cuadra ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
        </motion.span>
        <span className="min-w-0 flex-1">
          <span className={cn("block font-heading text-sm", cuadra ? "text-emerald-900" : "text-amber-900")}>
            {cuadra ? "Cuadra con la contabilidad" : "No cuadra con la contabilidad"}
          </span>
          <span className="block text-xs text-muted-foreground">
            {controles.map((c, i) => (
              <span key={c.concepto}>
                {i > 0 && " · "}
                {c.concepto}: {fmt(c.reporte)}
                {!c.cuadra && <strong className="text-amber-900"> (diferencia {fmt(c.diferencia)})</strong>}
              </span>
            ))}
          </span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">{descripcion}</span>
        </span>
        <motion.span animate={{ rotate: abierto ? 180 : 0 }} transition={springSmooth} className="mt-1 text-muted-foreground print:hidden">
          <ChevronDown className="size-4" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {abierto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={easeSmooth}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-black/5 bg-white/70 p-4">
              {controles.map((c) => (
                <div key={c.concepto} className="reporte-scroll overflow-x-auto">
                  <table className="reporte-tabla w-full min-w-[520px] text-xs">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="py-1.5 pr-2 font-heading">{c.concepto}</th>
                        <th className="py-1.5 px-2 text-right font-heading">Reporte</th>
                        <th className="py-1.5 px-2 text-right font-heading">Contabilidad</th>
                        <th className="py-1.5 pl-2 text-right font-heading">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-linea">
                      {c.porCuenta.map((f) => {
                        const dif = Math.round((f.contabilidad - f.reporte) * 100) / 100;
                        return (
                          <tr key={f.codigo}>
                            <td className="py-1.5 pr-2">
                              <span className="font-mono text-[11px] text-muted-foreground">{f.codigo}</span> {f.nombre}
                            </td>
                            <td className="py-1.5 px-2 text-right tabular-nums">{fmt(f.reporte)}</td>
                            <td className="py-1.5 px-2 text-right tabular-nums">{fmt(f.contabilidad)}</td>
                            <td className={cn("py-1.5 pl-2 text-right tabular-nums", dif !== 0 && "font-semibold text-amber-800")}>
                              {dif === 0 ? "—" : fmt(dif)}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="text-muted-foreground">
                        <td className="py-1.5 pr-2">Saldo de las cuentas en el período</td>
                        <td />
                        <td className="py-1.5 px-2 text-right tabular-nums">{fmt(c.saldoCuentas)}</td>
                        <td />
                      </tr>
                      {c.anulacionesCruzadas !== 0 && (
                        <tr className="text-muted-foreground">
                          <td className="py-1.5 pr-2">− Ventas anuladas en otro período (asiento y reversión en meses distintos)</td>
                          <td />
                          <td className="py-1.5 px-2 text-right tabular-nums">{fmt(c.anulacionesCruzadas)}</td>
                          <td />
                        </tr>
                      )}
                      {c.otrosAsientos !== 0 && (
                        <tr className="text-muted-foreground">
                          <td className="py-1.5 pr-2">− Asientos de otro origen (manuales, compras, transferencias)</td>
                          <td />
                          <td className="py-1.5 px-2 text-right tabular-nums">{fmt(c.otrosAsientos)}</td>
                          <td />
                        </tr>
                      )}
                      <tr className="font-heading">
                        <td className="py-1.5 pr-2">{c.cuadra ? "Cuadra" : "Diferencia sin explicar"}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{fmt(c.reporte)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">
                          {fmt(c.saldoCuentas - c.anulacionesCruzadas - c.otrosAsientos)}
                        </td>
                        <td className={cn("py-1.5 pl-2 text-right tabular-nums", !c.cuadra && "text-amber-800")}>
                          {c.diferencia === 0 ? "—" : fmt(c.diferencia)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
