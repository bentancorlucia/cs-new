"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, RotateCcw } from "lucide-react";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { cn } from "@/lib/utils";
import type { AsientoRef } from "./tipos";

const NOMBRE_ORIGEN: Record<string, string> = {
  pedido_venta: "Venta",
  pedido_efectivo: "Efectivo a cuenta (pago mixto)",
  pedido_entrega: "Entrega del encargue",
  devolucion_venta: "Devolución / cambio",
  donaciones_transferencia: "Transferencia a la Olla",
};

export function nombreOrigen(origen: string | null, tipo?: string): string {
  if (tipo === "reversion") return "Reversión";
  return (origen && NOMBRE_ORIGEN[origen]) || "Asiento";
}

/**
 * Número de asiento con link a /contabilidad/asientos/[id] si el usuario
 * puede abrir contabilidad (si no, solo el número).
 */
export function NumeroAsiento({
  asiento,
  conLink,
  className,
}: {
  asiento: Pick<AsientoRef, "id" | "numero">;
  conLink: boolean;
  className?: string;
}) {
  const texto = asiento.numero != null ? `N° ${asiento.numero}` : "Sin número";
  if (!conLink) {
    return <span className={cn("font-mono text-xs tabular-nums", className)}>{texto}</span>;
  }
  return (
    <Link
      href={`/contabilidad/asientos/${asiento.id}`}
      className={cn(
        "group inline-flex items-center gap-0.5 font-mono text-xs tabular-nums text-bordo-800 hover:text-bordo-950",
        className
      )}
    >
      <span className="underline decoration-bordo-800/30 underline-offset-2 group-hover:decoration-bordo-800">
        {texto}
      </span>
      <ArrowUpRight className="size-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </Link>
  );
}

/** Fila de un asiento del pedido, con su reversión debajo si la tiene. */
export function FilaAsiento({
  asiento,
  conLink,
  etiqueta,
  indice = 0,
}: {
  asiento: AsientoRef;
  conLink: boolean;
  etiqueta?: string;
  indice?: number;
}) {
  const revertido = !!asiento.revertido_por;
  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.05 * indice, type: "spring", stiffness: 300, damping: 30 }}
      className="py-2.5 first:pt-0 last:pb-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("text-sm font-medium", revertido && "text-muted-foreground line-through")}>
              {etiqueta ?? nombreOrigen(asiento.origen_tipo, asiento.tipo)}
            </span>
            <NumeroAsiento asiento={asiento} conLink={conLink} />
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {formatFecha(asiento.fecha)} · {asiento.descripcion}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 text-sm tabular-nums",
            revertido ? "text-muted-foreground line-through" : "font-medium"
          )}
        >
          {formatImporte(asiento.importe, "UYU")}
        </span>
      </div>
      {asiento.revertido_por && (
        <div className="mt-1.5 flex items-start gap-2 rounded-md bg-red-50/70 px-2.5 py-1.5 text-[11px] text-red-700">
          <RotateCcw className="mt-0.5 size-3 shrink-0" />
          <div className="min-w-0 flex-1">
            <span className="font-medium">Revertido</span> por el asiento{" "}
            <NumeroAsiento asiento={asiento.revertido_por} conLink={conLink} className="text-red-700" /> del{" "}
            {formatFecha(asiento.revertido_por.fecha)}
            {asiento.revertido_por.motivo && <span className="block truncate">Motivo: {asiento.revertido_por.motivo}</span>}
          </div>
        </div>
      )}
    </motion.li>
  );
}
