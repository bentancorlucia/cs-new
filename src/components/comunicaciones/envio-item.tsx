"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { easeSmooth } from "@/lib/motion";
import { formatCorta } from "@/lib/comunicaciones/esquemas";
import { BadgeCategoria, BadgeEstadoEnvio, BadgeOrigen, BarraProgreso, conteoDe } from "./ui";
import type { EnvioResumen } from "./tipos";

/** Fila de un envío con su progreso. */
export function EnvioItem({ envio, indice = 0, destacado }: { envio: EnvioResumen; indice?: number; destacado?: boolean }) {
  const c = conteoDe(envio);
  const [ahora] = useState(() => Date.now());
  const programado = envio.estado === "aprobado" && new Date(envio.programado_para).getTime() > ahora;
  const hechos = c.enviados + c.fallidos + c.omitidos + c.cancelados;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0, transition: { ...easeSmooth, delay: Math.min(indice, 12) * 0.035 } }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
    >
      <motion.div whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 400, damping: 30 }}>
        <Link
          href={`/comunicaciones/envios/${envio.id}`}
          className={cn(
            "group grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 rounded-2xl border bg-white px-4 py-3 transition-shadow hover:shadow-card-hover sm:grid-cols-[minmax(0,1fr)_13rem_auto] sm:items-center",
            destacado ? "border-dorado-300 bg-dorado-50/40" : "border-linea",
            envio.estado === "cancelado" && "opacity-70"
          )}
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">{envio.nombre}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <BadgeCategoria categoria={envio.categoria} />
              <BadgeOrigen origen={envio.origen} />
              <span className="tabular-nums">{formatCorta(envio.created_at)}</span>
              {programado && (
                <span className="inline-flex items-center gap-1 text-violet-700">
                  <CalendarClock className="size-3" />
                  {formatCorta(envio.programado_para)}
                </span>
              )}
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {c.enviados.toLocaleString("es-UY")} enviados
                {c.fallidos > 0 && <span className="text-rose-700"> · {c.fallidos} fallidos</span>}
              </span>
              <span className="tabular-nums">
                {hechos}/{c.total}
              </span>
            </div>
            <div className="mt-1">
              <BarraProgreso conteo={c} />
            </div>
          </div>
          <div className="col-start-2 row-start-1 flex items-center justify-end gap-2 sm:col-start-auto sm:row-start-auto">
            <BadgeEstadoEnvio estado={envio.estado} programado={programado} />
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-bordo-800" />
          </div>
        </Link>
      </motion.div>
    </motion.li>
  );
}
