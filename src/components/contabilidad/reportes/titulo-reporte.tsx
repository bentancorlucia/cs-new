"use client";

import { motion } from "framer-motion";
import { easeSmooth } from "@/lib/motion";

/** Título de página de los reportes contables, con entrada animada. */
export function TituloReporte({
  titulo,
  descripcion,
  etiqueta = "Contabilidad",
  children,
}: {
  titulo: string;
  descripcion?: string;
  etiqueta?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between print:hidden">
      <div>
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={easeSmooth}
          className="text-[11px] uppercase tracking-editorial text-bordo-700 font-heading"
        >
          {etiqueta}
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...easeSmooth, delay: 0.05 }}
          className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground"
        >
          {titulo}
        </motion.h1>
        {descripcion && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ ...easeSmooth, delay: 0.12 }}
            className="mt-1 text-sm text-muted-foreground font-body"
          >
            {descripcion}
          </motion.p>
        )}
      </div>
      {children && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...easeSmooth, delay: 0.15 }}
        >
          {children}
        </motion.div>
      )}
    </div>
  );
}
