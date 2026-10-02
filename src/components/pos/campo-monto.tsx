"use client";

import { useId } from "react";
import { motion } from "framer-motion";
import { TecladoNumerico } from "./teclado-numerico";

/**
 * Importe grande editable con el teclado del dispositivo o con el teclado
 * numérico en pantalla. `valor` es el texto que se está tipeando.
 */
export function CampoMonto({
  etiqueta,
  valor,
  onChange,
  teclado = true,
  decimales = false,
  autoFocus,
  invalido,
  ayuda,
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  teclado?: boolean;
  decimales?: boolean;
  autoFocus?: boolean;
  invalido?: boolean;
  ayuda?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-xs font-heading uppercase tracking-editorial text-muted-foreground">
        {etiqueta}
      </label>
      <motion.div
        animate={invalido ? { x: [0, -4, 4, -2, 2, 0] } : { x: 0 }}
        transition={{ duration: 0.3 }}
        className={`flex items-center gap-2 rounded-xl border-2 bg-white px-4 h-16 transition-colors focus-within:border-bordo-500
          ${invalido ? "border-red-300" : "border-linea"}`}
      >
        <span className="text-2xl font-heading text-muted-foreground">$</span>
        <input
          id={id}
          value={valor}
          onChange={(e) => onChange(e.target.value.replace(/[^\d,.]/g, ""))}
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder="0"
          className="w-full bg-transparent text-3xl font-heading font-bold tabular-nums outline-none placeholder:text-gray-300"
        />
      </motion.div>
      {ayuda}
      {teclado && <TecladoNumerico valor={valor} onChange={onChange} decimales={decimales} />}
    </div>
  );
}
