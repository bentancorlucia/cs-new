"use client";

import { motion } from "framer-motion";
import { Delete } from "lucide-react";

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "borrar"] as const;

/**
 * Teclado numérico grande para tablet/celular. Edita un texto con dígitos
 * (y una coma decimal opcional); el padre lo convierte con `parseMonto`.
 */
export function TecladoNumerico({
  valor,
  onChange,
  decimales = false,
  maxDigitos = 9,
  className,
}: {
  valor: string;
  onChange: (v: string) => void;
  decimales?: boolean;
  maxDigitos?: number;
  className?: string;
}) {
  const pulsar = (t: (typeof TECLAS)[number] | ",") => {
    if (t === "borrar") return onChange(valor.slice(0, -1));
    if (t === ",") {
      if (!decimales || valor.includes(",")) return;
      return onChange((valor || "0") + ",");
    }
    const [entero, dec] = valor.split(",");
    if (dec !== undefined) {
      if (dec.length + t.length > 2) return;
      return onChange(valor + t);
    }
    if ((entero + t).replace(/^0+/, "").length > maxDigitos) return;
    const nuevo = (entero + t).replace(/^0+(?=\d)/, "");
    onChange(nuevo === "" ? "" : nuevo);
  };

  return (
    <div className={`grid grid-cols-3 gap-2 select-none ${className ?? ""}`}>
      {TECLAS.map((t) => (
        <motion.button
          key={t}
          type="button"
          whileTap={{ scale: 0.92 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          onClick={() => pulsar(t)}
          onContextMenu={(e) => {
            if (t === "borrar") {
              e.preventDefault();
              onChange("");
            }
          }}
          aria-label={t === "borrar" ? "Borrar" : t}
          className={`h-14 rounded-xl text-xl font-heading font-semibold tabular-nums transition-colors
            ${t === "borrar"
              ? "bg-bordo-50 text-bordo-800 hover:bg-bordo-100 flex items-center justify-center"
              : "bg-superficie text-foreground hover:bg-gray-200 active:bg-gray-300"}`}
        >
          {t === "borrar" ? <Delete className="size-6" /> : t}
        </motion.button>
      ))}
      {decimales && (
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          onClick={() => pulsar(",")}
          className="col-span-3 h-10 rounded-xl bg-superficie text-sm font-heading text-muted-foreground hover:bg-gray-200"
        >
          , (centésimos)
        </motion.button>
      )}
    </div>
  );
}
