"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion, useSpring } from "framer-motion";
import { Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatImporte,
  NOMBRE_TIPO_ASIENTO,
  type EstadoAsiento,
  type TipoAsiento,
} from "@/lib/contabilidad/formato";

const ESTILO_TIPO: Record<TipoAsiento, string> = {
  manual: "bg-superficie text-foreground/80 border-linea",
  automatico: "bg-bordo-50 text-bordo-800 border-bordo-100",
  apertura: "bg-emerald-50 text-emerald-800 border-emerald-200",
  cierre: "bg-slate-100 text-slate-700 border-slate-200",
  refundicion: "bg-slate-100 text-slate-700 border-slate-200",
  revaluacion: "bg-sky-50 text-sky-800 border-sky-200",
  reversion: "bg-rose-50 text-rose-700 border-rose-200",
};

const pill =
  "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap";

export function BadgeTipo({ tipo, className }: { tipo: TipoAsiento; className?: string }) {
  return <span className={cn(pill, ESTILO_TIPO[tipo], className)}>{NOMBRE_TIPO_ASIENTO[tipo]}</span>;
}

export function BadgeEstado({ estado, className }: { estado: EstadoAsiento; className?: string }) {
  if (estado === "borrador") {
    return (
      <span className={cn(pill, "border-dorado-300 bg-dorado-100 text-dorado-800", className)}>
        <span className="size-1.5 rounded-full bg-dorado-500" />
        Borrador
      </span>
    );
  }
  return (
    <span className={cn(pill, "border-emerald-200 bg-emerald-50 text-emerald-700", className)}>
      <span className="size-1.5 rounded-full bg-emerald-500" />
      Confirmado
    </span>
  );
}

export function MarcaRevertido({ className }: { className?: string }) {
  return (
    <span className={cn(pill, "border-rose-200 bg-white text-rose-700", className)}>
      <Undo2 className="size-3" />
      Revertido
    </span>
  );
}

export function BadgeUsd({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-4 shrink-0 items-center rounded-sm bg-sky-100 px-1 text-[10px] font-semibold tracking-wide text-sky-800",
        className
      )}
    >
      USD
    </span>
  );
}

/** Importe que anima al cambiar (count-up suave). */
export function ImporteAnimado({
  valor,
  moneda,
  className,
}: {
  valor: number;
  moneda?: string;
  className?: string;
}) {
  const reducir = useReducedMotion();
  const spring = useSpring(valor, { stiffness: 260, damping: 32, mass: 0.6 });
  const [mostrado, setMostrado] = useState(valor);

  useEffect(() => {
    if (reducir) spring.jump(valor);
    else spring.set(valor);
  }, [valor, reducir, spring]);

  useEffect(() => spring.on("change", (v) => setMostrado(v)), [spring]);

  // Al llegar al destino mostramos el valor exacto (evita ±0,01 por redondeo del resorte).
  const texto = Math.abs(mostrado - valor) < 0.005 ? formatImporte(valor, moneda) : formatImporte(mostrado, moneda);
  return <span className={cn("tabular-nums", className)}>{texto}</span>;
}

/** Encabezado de página con entrada animada. */
export function EncabezadoPagina({
  eyebrow,
  titulo,
  descripcion,
  children,
}: {
  eyebrow?: string;
  titulo: React.ReactNode;
  descripcion?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
    >
      <div className="min-w-0">
        {eyebrow && (
          <div className="font-heading text-[11px] uppercase tracking-editorial text-bordo-800/70">{eyebrow}</div>
        )}
        <h1 className="font-display text-2xl uppercase tracking-tightest text-foreground sm:text-3xl">{titulo}</h1>
        {descripcion && <div className="mt-1 font-body text-sm text-muted-foreground">{descripcion}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </motion.div>
  );
}
