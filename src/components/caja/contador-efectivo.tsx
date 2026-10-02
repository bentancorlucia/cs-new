"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Calculator, Coins, Minus, Plus } from "lucide-react";
import { CampoMonto } from "@/components/pos/campo-monto";
import { PrecioAnimado } from "@/components/pos/precio-animado";
import { parseMonto, pesos } from "@/components/pos/formato";
import { springSmooth } from "@/lib/motion";

// Billetes y monedas en pesos uruguayos.
const DENOMINACIONES = [2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

export type Conteo = {
  total: number;
  /** "3 × $1.000 · 2 × $500" cuando se contó por billete. */
  detalle: string | null;
  /** Hay algo cargado (un total escrito o algún billete). */
  cargado: boolean;
};

/**
 * Conteo del efectivo: escribiendo el total o billete por billete.
 * Avisa cada cambio con `onCambio`.
 */
export function ContadorEfectivo({ onCambio }: { onCambio: (c: Conteo) => void }) {
  const [modo, setModo] = useState<"total" | "billetes">("total");
  const [totalTxt, setTotalTxt] = useState("");
  const [cantidades, setCantidades] = useState<Record<number, number>>({});

  const avisarTotal = (txt: string) => {
    setTotalTxt(txt);
    onCambio({ total: parseMonto(txt), detalle: null, cargado: txt.trim() !== "" });
  };

  const avisarBilletes = (c: Record<number, number>) => {
    setCantidades(c);
    const total = DENOMINACIONES.reduce((s, d) => s + d * (c[d] ?? 0), 0);
    const detalle = DENOMINACIONES.filter((d) => (c[d] ?? 0) > 0)
      .map((d) => `${c[d]} × ${pesos(d)}`)
      .join(" · ");
    onCambio({ total, detalle: detalle || null, cargado: detalle !== "" });
  };

  const cambiarModo = (m: "total" | "billetes") => {
    setModo(m);
    if (m === "total") avisarTotal(totalTxt);
    else avisarBilletes(cantidades);
  };

  const setCantidad = (d: number, n: number) => avisarBilletes({ ...cantidades, [d]: Math.max(0, Math.min(9999, n)) });
  const totalBilletes = DENOMINACIONES.reduce((s, d) => s + d * (cantidades[d] ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-superficie p-1">
        {(
          [
            ["total", "Total", Calculator],
            ["billetes", "Por billete", Coins],
          ] as const
        ).map(([m, texto, Icono]) => (
          <button
            key={m}
            type="button"
            onClick={() => cambiarModo(m)}
            className="relative h-10 rounded-lg text-sm font-heading font-semibold"
          >
            {modo === m && (
              <motion.span
                layoutId="contador-modo"
                transition={springSmooth}
                className="absolute inset-0 rounded-lg bg-white shadow-sm"
              />
            )}
            <span className={`relative flex items-center justify-center gap-1.5 ${modo === m ? "text-bordo-800" : "text-muted-foreground"}`}>
              <Icono className="size-4" />
              {texto}
            </span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {modo === "total" ? (
          <motion.div
            key="total"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.18 }}
          >
            <CampoMonto etiqueta="Efectivo contado" valor={totalTxt} onChange={avisarTotal} decimales />
          </motion.div>
        ) : (
          <motion.div
            key="billetes"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
            className="space-y-2"
          >
            <div className="max-h-[46vh] overflow-y-auto rounded-xl border border-linea divide-y divide-linea">
              {DENOMINACIONES.map((d) => {
                const n = cantidades[d] ?? 0;
                return (
                  <div key={d} className={`flex items-center gap-2 px-3 py-1.5 transition-colors ${n > 0 ? "bg-green-50/50" : ""}`}>
                    <span className="w-20 font-heading font-semibold tabular-nums">{pesos(d)}</span>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.85 }}
                      onClick={() => setCantidad(d, n - 1)}
                      disabled={n === 0}
                      aria-label={`Restar ${d}`}
                      className="size-10 rounded-lg bg-superficie flex items-center justify-center disabled:opacity-40"
                    >
                      <Minus className="size-4" />
                    </motion.button>
                    <input
                      value={n === 0 ? "" : String(n)}
                      onChange={(e) => setCantidad(d, Number(e.target.value.replace(/\D/g, "")) || 0)}
                      inputMode="numeric"
                      placeholder="0"
                      aria-label={`Cantidad de ${d}`}
                      className="w-14 h-10 rounded-lg border border-linea text-center font-heading font-semibold tabular-nums outline-none focus:border-bordo-500"
                    />
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.85 }}
                      onClick={() => setCantidad(d, n + 1)}
                      aria-label={`Sumar ${d}`}
                      className="size-10 rounded-lg bg-superficie flex items-center justify-center"
                    >
                      <Plus className="size-4" />
                    </motion.button>
                    <span className="ml-auto text-sm tabular-nums text-muted-foreground">{n > 0 ? pesos(d * n) : ""}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-baseline justify-between rounded-xl bg-superficie px-4 py-2">
              <span className="text-xs font-heading uppercase tracking-editorial text-muted-foreground">Total contado</span>
              <PrecioAnimado valor={totalBilletes} className="text-2xl font-heading font-bold" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
