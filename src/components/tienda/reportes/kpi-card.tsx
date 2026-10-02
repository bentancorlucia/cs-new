"use client";

import { useEffect } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { fadeInUp, springSmooth } from "@/lib/motion";
import { formatImporte } from "@/lib/contabilidad/formato";
import { formatPct } from "@/lib/reportes/etiquetas";
import type { KpiComparado, KpiPctComparado } from "@/types/reportes";

type Formato = "importe" | "entero" | "pct";

function texto(v: number, formato: Formato) {
  if (formato === "importe") return formatImporte(Math.round(v * 100) / 100, "UYU");
  if (formato === "pct") return formatPct(v);
  return Math.round(v).toLocaleString("es-UY");
}

/** Número con count-up desde 0 (o desde el valor anterior al cambiar). */
export function NumeroAnimado({ valor, formato }: { valor: number | null; formato: Formato }) {
  const reducir = useReducedMotion();
  const mv = useMotionValue(reducir ? (valor ?? 0) : 0);
  const t = useTransform(mv, (v) => texto(v, formato));
  useEffect(() => {
    if (valor == null) return;
    if (reducir) {
      mv.set(valor);
      return;
    }
    const c = animate(mv, valor, { duration: 1, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [valor, reducir, mv]);
  if (valor == null) return <span>—</span>;
  return <motion.span className="tabular-nums">{t}</motion.span>;
}

interface Props {
  label: string;
  valor: number | null;
  formato?: Formato;
  delta?: KpiComparado | KpiPctComparado | null;
  hint?: React.ReactNode;
  /** "inverso": que suba es malo (costo). "neutro": sin color. */
  sentido?: "normal" | "inverso" | "neutro";
  tono?: "default" | "positivo" | "negativo" | "aviso" | "bordo";
  className?: string;
}

export function KpiCard({ label, valor, formato = "importe", delta, hint, sentido = "normal", tono = "default", className }: Props) {
  const cambio = delta == null ? null : "variacionPct" in delta ? delta.variacionPct : delta.diferenciaPp;
  const dir = cambio == null ? null : cambio > 0.5 ? "up" : cambio < -0.5 ? "down" : "flat";
  const bueno = sentido === "neutro" || dir === "flat" || dir === null ? null : (dir === "up") === (sentido === "normal");
  const etiquetaCambio =
    cambio == null
      ? null
      : delta && "variacionPct" in delta
        ? `${cambio > 0 ? "+" : ""}${cambio.toFixed(1)} %`
        : `${cambio > 0 ? "+" : ""}${cambio.toFixed(1)} pp`;

  return (
    <motion.div
      variants={fadeInUp}
      transition={springSmooth}
      whileHover={{ y: -2 }}
      className={cn(
        "reporte-tarjeta flex flex-col gap-1 rounded-2xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md",
        tono === "positivo" && "border-emerald-200",
        tono === "negativo" && "border-red-200",
        tono === "aviso" && "border-amber-300",
        tono === "bordo" && "border-bordo-200",
        tono === "default" && "border-linea",
        className
      )}
    >
      <p className="text-[11px] text-muted-foreground font-body">{label}</p>
      <p
        className={cn(
          "whitespace-nowrap font-display text-xl tracking-tightest sm:text-2xl",
          tono === "bordo" ? "text-bordo-800" : tono === "negativo" ? "text-red-700" : "text-foreground"
        )}
      >
        <NumeroAnimado valor={valor} formato={formato} />
      </p>
      {(delta || hint) && (
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] font-body">
          {delta && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5",
                bueno === true && "bg-emerald-50 text-emerald-700",
                bueno === false && "bg-red-50 text-red-700",
                bueno === null && "bg-superficie text-muted-foreground"
              )}
              title="Contra el período anterior de igual largo (sin ventas en ese período, no hay variación)"
            >
              {dir === "up" ? <TrendingUp className="size-3" /> : dir === "down" ? <TrendingDown className="size-3" /> : <Minus className="size-3" />}
              {etiquetaCambio ?? "sin período anterior"}
            </span>
          )}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      )}
    </motion.div>
  );
}
