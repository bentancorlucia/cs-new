"use client";

import { motion } from "framer-motion";
import { CheckCircle2, TrendingDown, TrendingUp } from "lucide-react";
import { PrecioAnimado } from "@/components/pos/precio-animado";
import { springSmooth } from "@/lib/motion";

/** Diferencia de un arqueo: 0 cuadra, > 0 sobrante, < 0 faltante. */
export function DiferenciaArqueo({
  diferencia,
  grande = false,
  registrada = false,
}: {
  diferencia: number;
  grande?: boolean;
  /** true: ya se asentó (texto en pasado). */
  registrada?: boolean;
}) {
  const d = Math.round(diferencia * 100) / 100;
  const cuadra = d === 0;
  const sobra = d > 0;
  const Icono = cuadra ? CheckCircle2 : sobra ? TrendingUp : TrendingDown;
  const color = cuadra
    ? "bg-green-50 text-green-800 border-green-200"
    : sobra
      ? "bg-sky-50 text-sky-800 border-sky-200"
      : "bg-red-50 text-red-700 border-red-200";
  const texto = cuadra
    ? "La caja cuadra"
    : sobra
      ? registrada ? "Sobrante registrado" : "Sobrante"
      : registrada ? "Faltante registrado" : "Faltante";

  return (
    <motion.div
      layout
      transition={springSmooth}
      className={`flex items-center gap-3 rounded-xl border px-4 ${grande ? "py-4" : "py-2.5"} ${color}`}
    >
      <motion.span key={cuadra ? "ok" : sobra ? "mas" : "menos"} initial={{ scale: 0.5, rotate: -30 }} animate={{ scale: 1, rotate: 0 }}>
        <Icono className={grande ? "size-8" : "size-5"} />
      </motion.span>
      <div className="flex-1">
        <p className={`font-heading font-semibold ${grande ? "text-base" : "text-sm"}`}>{texto}</p>
        {!cuadra && registrada && (
          <p className="text-xs opacity-80">
            Se asentó contra {sobra ? "Sobrantes de caja (4.7.02)" : "Faltantes de caja (5.9.02)"}.
          </p>
        )}
      </div>
      {!cuadra && <PrecioAnimado valor={Math.abs(d)} className={`font-heading font-bold ${grande ? "text-3xl" : "text-lg"}`} />}
    </motion.div>
  );
}
