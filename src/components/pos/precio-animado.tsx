"use client";

import { useEffect, useRef } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { pesos } from "./formato";

/** Importe que cuenta hasta el nuevo valor cuando cambia. */
export function PrecioAnimado({ valor, className }: { valor: number; className?: string }) {
  const mv = useMotionValue(valor);
  const objetivo = useRef(valor);
  // Mientras cuenta muestra pesos enteros; al llegar, el valor exacto.
  const texto = useTransform(mv, (v) => pesos(Math.abs(v - objetivo.current) < 0.005 ? objetivo.current : Math.round(v)));

  useEffect(() => {
    objetivo.current = valor;
    const c = animate(mv, valor, { duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] });
    return c.stop;
  }, [valor, mv]);

  return <motion.span className={`tabular-nums ${className ?? ""}`}>{texto}</motion.span>;
}
