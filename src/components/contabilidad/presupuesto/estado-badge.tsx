"use client";

import { motion } from "framer-motion";
import { CheckCircle2, History, PencilLine } from "lucide-react";
import { springBouncy } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { NOMBRE_ESTADO_PRESUPUESTO, type EstadoPresupuesto } from "@/lib/contabilidad/presupuesto";

const ESTILO: Record<EstadoPresupuesto, string> = {
  borrador: "border-amber-200 bg-amber-50 text-amber-800",
  aprobado: "border-emerald-200 bg-emerald-50 text-emerald-800",
  reemplazado: "border-linea bg-superficie text-muted-foreground",
};

const ICONO: Record<EstadoPresupuesto, typeof CheckCircle2> = {
  borrador: PencilLine,
  aprobado: CheckCircle2,
  reemplazado: History,
};

/** Estado de una versión del presupuesto (el aprobado es el vigente). */
export function EstadoBadge({ estado, className }: { estado: EstadoPresupuesto; className?: string }) {
  const Icono = ICONO[estado];
  return (
    <motion.span
      key={estado}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={springBouncy}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-heading uppercase tracking-editorial",
        ESTILO[estado],
        className
      )}
    >
      <Icono className="size-3" />
      {NOMBRE_ESTADO_PRESUPUESTO[estado]}
      {estado === "aprobado" && <span className="normal-case tracking-normal">· vigente</span>}
    </motion.span>
  );
}
