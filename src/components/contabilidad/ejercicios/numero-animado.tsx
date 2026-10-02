"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion, useSpring } from "framer-motion";

/** Número que cuenta hasta su valor al entrar en pantalla y anima cada cambio. */
export function NumeroAnimado({
  valor,
  decimales = 0,
  className,
}: {
  valor: number;
  decimales?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const visible = useInView(ref, { once: true, margin: "-20px" });
  const reducido = useReducedMotion();
  const spring = useSpring(0, { stiffness: 90, damping: 26 });
  const [mostrado, setMostrado] = useState(0);

  useEffect(() => spring.on("change", setMostrado), [spring]);

  useEffect(() => {
    if (!visible) return;
    if (reducido) spring.jump(valor);
    else spring.set(valor);
  }, [visible, reducido, spring, valor]);

  const texto = new Intl.NumberFormat("es-UY", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(mostrado);

  return (
    <span ref={ref} className={className ? `tabular-nums ${className}` : "tabular-nums"}>
      {texto}
    </span>
  );
}
