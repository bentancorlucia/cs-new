"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Scale } from "lucide-react";
import { formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth } from "@/lib/motion";

export interface ControlMercaderiaVista {
  valor_stock: number;
  saldo_contable: number;
  diferencia: number;
  movimientos_sin_asiento: number;
}

/**
 * Control kardex = mayor: valor del stock vs saldo de "Mercadería" en el
 * ejercicio. Solo aparece si hay diferencia o movimientos sin asiento.
 */
export function ControlMercaderiaAlerta({ control }: { control: ControlMercaderiaVista | null }) {
  if (!control) return null;
  const hayDiferencia = Math.abs(control.diferencia) >= 0.01;
  if (!hayDiferencia && control.movimientos_sin_asiento === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={easeSmooth}
      className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-950"
      role="status"
    >
      <div className="flex gap-3">
        <motion.div
          initial={{ rotate: -12, scale: 0.8 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.15 }}
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-100"
        >
          <Scale className="size-4.5 text-amber-700" />
        </motion.div>
        <div className="min-w-0 space-y-1.5">
          <p className="font-heading">
            {hayDiferencia
              ? `El stock valorizado no coincide con la contabilidad: diferencia de $ ${formatImporte(control.diferencia)}`
              : "Hay movimientos de stock sin asiento"}
          </p>
          {hayDiferencia && (
            <p className="text-xs text-amber-900/80">
              Kardex: $ {formatImporte(control.valor_stock)} · Cuenta Mercadería: $ {formatImporte(control.saldo_contable)}.
              Si cargaste inventario inicial, la diferencia es ese valor todavía no incluido en el asiento de apertura del
              ejercicio: se resuelve en contabilidad con la apertura (Mercadería contra Patrimonio), no con bajas ni recuentos.
            </p>
          )}
          {control.movimientos_sin_asiento > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-amber-900/80">
              <AlertTriangle className="size-3.5" />
              {control.movimientos_sin_asiento} movimiento{control.movimientos_sin_asiento === 1 ? "" : "s"} del kardex sin asiento
              (fuera del inventario inicial).
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
