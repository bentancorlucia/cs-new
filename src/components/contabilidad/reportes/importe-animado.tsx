"use client";

import { useEffect } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { formatImporte } from "@/lib/contabilidad/formato";

/** Importe con count-up: anima desde el valor anterior (o 0) al nuevo. */
export function ImporteAnimado({
  valor,
  moneda,
  className,
  duracion = 1.1,
}: {
  valor: number;
  moneda?: string;
  className?: string;
  duracion?: number;
}) {
  const reducir = useReducedMotion();
  const mv = useMotionValue(reducir ? valor : 0);
  const texto = useTransform(mv, (v) => formatImporte(Math.round(v * 100) / 100, moneda));

  useEffect(() => {
    if (reducir) {
      mv.set(valor);
      return;
    }
    const control = animate(mv, valor, { duration: duracion, ease: [0.16, 1, 0.3, 1] });
    return () => control.stop();
  }, [valor, reducir, mv, duracion]);

  return <motion.span className={`tabular-nums ${className ?? ""}`}>{texto}</motion.span>;
}

/** Entero con count-up (cantidades). */
export function EnteroAnimado({ valor, className }: { valor: number; className?: string }) {
  const reducir = useReducedMotion();
  const mv = useMotionValue(reducir ? valor : 0);
  const texto = useTransform(mv, (v) => Math.round(v).toLocaleString("es-UY"));

  useEffect(() => {
    if (reducir) {
      mv.set(valor);
      return;
    }
    const control = animate(mv, valor, { duration: 0.9, ease: [0.16, 1, 0.3, 1] });
    return () => control.stop();
  }, [valor, reducir, mv]);

  return <motion.span className={`tabular-nums ${className ?? ""}`}>{texto}</motion.span>;
}
