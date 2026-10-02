"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { easeSmooth, fadeInUp, springBouncy, springSmooth } from "@/lib/motion";
import { ImporteAnimado } from "@/components/contabilidad/reportes/importe-animado";

export function TarjetaKpi({
  titulo,
  valor,
  icono: Icono,
  sub,
  tono = "neutro",
}: {
  titulo: string;
  valor: number;
  icono: LucideIcon;
  sub?: React.ReactNode;
  tono?: "neutro" | "ingreso" | "egreso" | "saldo" | "alerta";
}) {
  const estilos = {
    neutro: "border-linea bg-white",
    ingreso: "border-linea bg-white",
    egreso: "border-linea bg-white",
    saldo: "border-bordo-200 bg-bordo-50/50",
    alerta: "border-rose-200 bg-rose-50/60",
  }[tono];
  const colorIcono = {
    neutro: "bg-bordo-50 text-bordo-700",
    ingreso: "bg-emerald-50 text-emerald-700",
    egreso: "bg-rose-50 text-rose-700",
    saldo: "bg-bordo-800 text-white",
    alerta: "bg-rose-600 text-white",
  }[tono];
  return (
    <motion.div
      variants={fadeInUp}
      transition={easeSmooth}
      whileHover={{ y: -2 }}
      className={`reporte-tarjeta rounded-2xl border p-4 shadow-card transition-shadow hover:shadow-card-hover ${estilos}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-editorial text-muted-foreground font-heading">{titulo}</span>
        <motion.span
          whileHover={{ rotate: -8, scale: 1.1 }}
          transition={springBouncy}
          className={`flex size-7 shrink-0 items-center justify-center rounded-full ${colorIcono}`}
        >
          <Icono className="size-3.5" strokeWidth={1.75} />
        </motion.span>
      </div>
      <div
        className={`mt-1.5 font-heading text-lg sm:text-xl ${
          valor < 0 || tono === "alerta" ? "text-rose-700" : tono === "saldo" ? "text-bordo-900" : "text-foreground"
        }`}
      >
        <ImporteAnimado valor={valor} moneda="UYU" />
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </motion.div>
  );
}

/** Segmentado con píldora animada. */
export function Segmentos<T extends string>({
  id,
  valor,
  opciones,
  onChange,
  ariaLabel,
}: {
  id: string;
  valor: T;
  opciones: { valor: T; etiqueta: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex w-fit gap-1 rounded-full bg-superficie p-1 text-xs">
      {opciones.map((o) => {
        const activo = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => !activo && onChange(o.valor)}
            className={`relative shrink-0 rounded-full px-3 py-1.5 font-heading transition-colors ${
              activo ? "text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {activo && (
              <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-full bg-bordo-800" transition={springSmooth} />
            )}
            <span className="relative">{o.etiqueta}</span>
          </button>
        );
      })}
    </div>
  );
}

export const CLASE_SELECT =
  "h-9 w-full min-w-0 rounded-lg border border-linea bg-white px-2.5 text-xs font-body text-foreground transition-shadow hover:border-bordo-200 focus:border-bordo-400 focus:outline-none focus:ring-2 focus:ring-bordo-100 sm:w-auto";
