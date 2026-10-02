"use client";

import { motion } from "framer-motion";
import { Lock, LockOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatImporte, NOMBRE_MES } from "@/lib/contabilidad/formato";
import { easeDramatic } from "@/lib/motion";
import type { EstadoExtracto, EstadoMes } from "@/lib/contabilidad/conciliacion";

const pill =
  "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap";

export function BadgeExtracto({ estado, className }: { estado: EstadoExtracto; className?: string }) {
  if (estado === "cerrado") {
    return (
      <span className={cn(pill, "border-emerald-200 bg-emerald-50 text-emerald-700", className)}>
        <Lock className="size-3" />
        Cerrado
      </span>
    );
  }
  return (
    <span className={cn(pill, "border-dorado-300 bg-dorado-100 text-dorado-800", className)}>
      <LockOpen className="size-3" />
      Abierto
    </span>
  );
}

/** Importe con signo: verde si entra, rojo si sale. */
export function ImporteSigno({
  valor,
  moneda,
  className,
}: {
  valor: number;
  moneda?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "whitespace-nowrap tabular-nums",
        valor > 0 ? "text-emerald-700" : valor < 0 ? "text-rose-700" : "text-muted-foreground",
        className
      )}
    >
      {valor > 0 ? "+" : valor < 0 ? "−" : ""}
      {formatImporte(Math.abs(valor), moneda === "USD" ? "USD" : undefined)}
    </span>
  );
}

/** Barra de avance animada (0..1). */
export function BarraAvance({ valor, className }: { valor: number; className?: string }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(valor) ? valor : 0));
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-superficie", className)}>
      <motion.div
        className={cn(
          "h-full origin-left rounded-full",
          v >= 1 ? "bg-emerald-500" : "bg-gradient-to-r from-bordo-800 to-bordo-600"
        )}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: v }}
        transition={easeDramatic}
      />
    </div>
  );
}

const ESTILO_MES: Record<EstadoMes, string> = {
  conciliado: "bg-emerald-500",
  en_curso: "bg-dorado-400",
  sin_extracto: "bg-superficie border border-linea",
};

const TEXTO_MES: Record<EstadoMes, string> = {
  conciliado: "conciliado",
  en_curso: "en curso",
  sin_extracto: "sin extracto",
};

/** Doce marcas, una por mes del año, con su estado de conciliación. */
export function MesesConciliados({ anio, meses }: { anio: number; meses: EstadoMes[] }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
        <span className="font-heading uppercase tracking-editorial">Meses {anio}</span>
        <span className="tabular-nums">
          {meses.filter((m) => m === "conciliado").length}/12 conciliados
        </span>
      </div>
      <div className="mt-1.5 grid grid-cols-12 gap-1">
        {meses.map((m, i) => (
          <motion.span
            key={i}
            title={`${NOMBRE_MES[i]}: ${TEXTO_MES[m]}`}
            initial={{ opacity: 0, scaleY: 0.3 }}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{ delay: 0.15 + i * 0.03, duration: 0.3 }}
            className={cn("h-2 origin-bottom rounded-sm", ESTILO_MES[m])}
          />
        ))}
      </div>
      <div className="mt-1 grid grid-cols-12 gap-1 text-center text-[9px] uppercase text-muted-foreground">
        {NOMBRE_MES.map((n) => (
          <span key={n}>{n.slice(0, 1)}</span>
        ))}
      </div>
    </div>
  );
}
