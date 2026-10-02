"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ChevronRight, ClipboardCheck, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatImporte } from "@/lib/contabilidad/formato";
import { NOMBRE_ESTADO_RECUENTO, type EstadoRecuento } from "@/lib/comercial/stock";
import { easeSmooth, fadeInUp, springSmooth, staggerContainer } from "@/lib/motion";
import { TituloReporte } from "@/components/contabilidad/reportes/titulo-reporte";

export interface RecuentoResumen {
  id: number;
  numero: string;
  estado: EstadoRecuento;
  notas: string | null;
  creado: string;
  creadoPor: string | null;
  confirmado: string | null;
  confirmadoPor: string | null;
  asientoId: string | null;
  contados: number;
  faltante: number;
  sobrante: number;
  conDiferencia: number;
}

export const TONO_ESTADO: Record<EstadoRecuento, string> = {
  borrador: "bg-amber-50 text-amber-800 border-amber-200",
  confirmado: "bg-emerald-50 text-emerald-700 border-emerald-200",
  descartado: "bg-superficie text-muted-foreground border-linea",
};

export const fechaHora = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("es-UY", {
        timeZone: "America/Montevideo",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso))
    : "";

export function RecuentosLista({
  recuentos,
  puedeOperar,
  verCostos,
  error,
}: {
  recuentos: RecuentoResumen[];
  puedeOperar: boolean;
  verCostos: boolean;
  error: string | null;
}) {
  const [estado, setEstado] = useState<EstadoRecuento | "todos">("todos");
  const visibles = estado === "todos" ? recuentos : recuentos.filter((r) => r.estado === estado);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={easeSmooth}>
        <Link href="/admin/stock" className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
          Stock
        </Link>
      </motion.div>

      <TituloReporte
        etiqueta="Stock"
        titulo="Recuentos"
        descripcion="Conteo físico contra el sistema: al confirmar se registran faltantes y sobrantes con su asiento."
      >
        {puedeOperar && (
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
            <Link href="/admin/stock/recuentos/nuevo" className={cn(buttonVariants({ size: "lg" }), "rounded-full")}>
              <Plus className="size-4" />
              Nuevo recuento
            </Link>
          </motion.div>
        )}
      </TituloReporte>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {(["todos", "borrador", "confirmado", "descartado"] as const).map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setEstado(e)}
            className={cn(
              "relative rounded-full px-3 py-1 text-xs font-medium transition-colors",
              estado === e ? "text-white" : "bg-superficie/60 text-muted-foreground hover:text-foreground"
            )}
          >
            {estado === e && <motion.span layoutId="estado-recuento" className="absolute inset-0 rounded-full bg-bordo-800" transition={springSmooth} />}
            <span className="relative">
              {e === "todos" ? "Todos" : NOMBRE_ESTADO_RECUENTO[e]}
              {e !== "todos" && ` (${recuentos.filter((r) => r.estado === e).length})`}
            </span>
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={springSmooth}
          className="rounded-2xl border border-linea bg-white py-16 text-center text-muted-foreground"
        >
          <ClipboardCheck className="mx-auto mb-3 size-12 opacity-20" />
          <p className="text-sm">{recuentos.length === 0 ? "Todavía no hay recuentos" : "Ninguno en este estado"}</p>
          {puedeOperar && recuentos.length === 0 && (
            <p className="mt-1 text-xs">Empezá uno y andá cargando lo contado desde el celular; se guarda como borrador.</p>
          )}
        </motion.div>
      ) : (
        <motion.ul variants={staggerContainer} initial="hidden" animate="visible" className="space-y-2">
          <AnimatePresence initial={false}>
            {visibles.map((r) => (
              <motion.li key={r.id} layout variants={fadeInUp} transition={springSmooth} exit={{ opacity: 0 }}>
                <Link
                  href={`/admin/stock/recuentos/${r.id}`}
                  className="group flex items-center gap-3 rounded-2xl border border-linea bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-bordo-200 hover:shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-heading text-sm">{r.numero}</span>
                      <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", TONO_ESTADO[r.estado])}>
                        {NOMBRE_ESTADO_RECUENTO[r.estado]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.contados} ítem{r.contados === 1 ? "" : "s"} contado{r.contados === 1 ? "" : "s"} · {fechaHora(r.creado)}
                      {r.creadoPor && ` · ${r.creadoPor}`}
                    </p>
                    {r.estado === "confirmado" && (
                      <p className="mt-0.5 text-xs">
                        {r.conDiferencia === 0 ? (
                          <span className="text-emerald-700">Sin diferencias</span>
                        ) : (
                          <>
                            <span className="text-foreground">{r.conDiferencia} con diferencia</span>
                            {verCostos && r.faltante > 0 && <span className="text-red-600"> · faltante $ {formatImporte(r.faltante)}</span>}
                            {verCostos && r.sobrante > 0 && <span className="text-emerald-700"> · sobrante $ {formatImporte(r.sobrante)}</span>}
                          </>
                        )}
                      </p>
                    )}
                    {r.notas && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{r.notas}</p>}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}
    </div>
  );
}
