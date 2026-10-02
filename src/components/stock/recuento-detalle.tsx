"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, CheckCircle2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatImporte } from "@/lib/contabilidad/formato";
import { NOMBRE_ESTADO_RECUENTO, type EstadoRecuento } from "@/lib/comercial/stock";
import { easeSmooth, fadeInUp, springSmooth, staggerContainer, staggerContainerFast } from "@/lib/motion";
import { EnteroAnimado, ImporteAnimado } from "@/components/contabilidad/reportes/importe-animado";
import { TONO_ESTADO, fechaHora } from "./recuentos-lista";

export interface CabeceraRecuento {
  id: number;
  numero: string;
  estado: EstadoRecuento;
  notas: string | null;
  creado: string;
  creadoPor: string | null;
  confirmado: string | null;
  confirmadoPor: string | null;
  asientoId: string | null;
}

export interface FilaDetalleRecuento {
  id: number;
  productoId: number | null;
  varianteId: number | null;
  producto: string;
  variante: string | null;
  sku: string | null;
  contado: number;
  stockSistema: number | null;
  diferencia: number | null;
  valor: number | null;
}

/** Recuento confirmado (faltantes y sobrantes valorizados) o descartado. */
export function RecuentoDetalle({
  recuento,
  filas,
  verCostos,
}: {
  recuento: CabeceraRecuento;
  filas: FilaDetalleRecuento[];
  verCostos: boolean;
}) {
  const [soloDif, setSoloDif] = useState(recuento.estado === "confirmado");
  const confirmado = recuento.estado === "confirmado";
  const faltantes = filas.filter((f) => (f.diferencia ?? 0) < 0);
  const sobrantes = filas.filter((f) => (f.diferencia ?? 0) > 0);
  const valorFaltante = faltantes.reduce((s, f) => s - (f.valor ?? 0), 0);
  const valorSobrante = sobrantes.reduce((s, f) => s + (f.valor ?? 0), 0);
  const visibles = soloDif ? filas.filter((f) => f.diferencia) : filas;

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={easeSmooth}>
        <Link href="/admin/stock/recuentos" className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
          Recuentos
        </Link>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={easeSmooth} className="space-y-2">
        <div className="text-[11px] uppercase tracking-editorial text-bordo-700 font-heading">Recuento físico</div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl uppercase tracking-tightest sm:text-3xl">{recuento.numero}</h1>
          <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", TONO_ESTADO[recuento.estado])}>
            {NOMBRE_ESTADO_RECUENTO[recuento.estado]}
          </span>
        </div>
        <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:gap-4">
          <span className="flex items-center gap-1">
            <User className="size-3" /> Empezado {fechaHora(recuento.creado)}
            {recuento.creadoPor && ` por ${recuento.creadoPor}`}
          </span>
          {confirmado && (
            <span className="flex items-center gap-1">
              <CheckCircle2 className="size-3 text-emerald-600" /> Confirmado {fechaHora(recuento.confirmado)}
              {recuento.confirmadoPor && ` por ${recuento.confirmadoPor}`}
            </span>
          )}
        </div>
        {recuento.notas && <p className="text-sm">{recuento.notas}</p>}
      </motion.div>

      {confirmado && (
        <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Productos contados", valor: <EnteroAnimado valor={filas.length} />, tono: "text-bordo-900" },
            { label: "Con diferencia", valor: <EnteroAnimado valor={faltantes.length + sobrantes.length} />, tono: "text-bordo-900" },
            ...(verCostos
              ? [
                  { label: "Faltante", valor: <ImporteAnimado valor={valorFaltante} moneda="UYU" />, tono: "text-red-600" },
                  { label: "Sobrante", valor: <ImporteAnimado valor={valorSobrante} moneda="UYU" />, tono: "text-emerald-700" },
                ]
              : []),
          ].map((t) => (
            <motion.div key={t.label} variants={fadeInUp} transition={springSmooth} className="rounded-2xl border border-linea bg-white p-4 shadow-sm">
              <p className="text-[11px] text-muted-foreground">{t.label}</p>
              <p className={cn("mt-1 font-display text-xl tracking-tightest", t.tono)}>{t.valor}</p>
            </motion.div>
          ))}
        </motion.div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {confirmado ? (
          <button
            type="button"
            onClick={() => setSoloDif((v) => !v)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              soloDif ? "border-bordo-300 bg-bordo-50 text-bordo-800" : "border-linea text-muted-foreground"
            )}
          >
            {soloDif ? "Mostrando solo diferencias" : "Mostrando todo lo contado"}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">Descartado: no movió stock.</span>
        )}
        {recuento.asientoId ? (
          <Link
            href={`/contabilidad/asientos/${recuento.asientoId}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-linea px-3 py-1.5 text-xs font-medium text-bordo-800 hover:border-bordo-300"
          >
            <BookOpen className="size-3.5" />
            Ver asiento
          </Link>
        ) : (
          confirmado && <span className="text-xs text-muted-foreground">Sin diferencias: no hubo asiento</span>
        )}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...easeSmooth, delay: 0.1 }}
        className="overflow-hidden rounded-2xl border border-linea bg-white"
      >
        <div className="hidden grid-cols-[minmax(0,1fr)_80px_80px_90px_120px] gap-2 border-b border-linea bg-superficie/40 px-4 py-2.5 text-[11px] font-heading uppercase tracking-editorial text-muted-foreground sm:grid">
          <span>Producto</span>
          <span className="text-right">Sistema</span>
          <span className="text-right">Contado</span>
          <span className="text-right">Diferencia</span>
          <span className="text-right">{verCostos ? "Valor" : ""}</span>
        </div>
        {visibles.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Lo contado coincidió con el sistema</p>
        ) : (
          <motion.ul variants={staggerContainerFast} initial="hidden" animate="visible" className="divide-y divide-linea/70">
            {visibles.map((f) => (
              <motion.li
                key={f.id}
                variants={fadeInUp}
                transition={springSmooth}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-4 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_80px_80px_90px_120px]"
              >
                <div className="min-w-0">
                  {f.productoId ? (
                    <Link
                      href={`/admin/stock/kardex/${f.productoId}${f.varianteId ? `?variante=${f.varianteId}` : ""}`}
                      className="block truncate hover:text-bordo-700"
                    >
                      {f.producto}
                      {f.variante && <span className="text-muted-foreground"> — {f.variante}</span>}
                    </Link>
                  ) : (
                    <span className="block truncate">{f.producto}</span>
                  )}
                  <p className="text-[11px] text-muted-foreground sm:hidden">
                    Sistema {f.stockSistema ?? "—"} · contado {f.contado}
                    {verCostos && f.valor ? ` · $ ${formatImporte(f.valor)}` : ""}
                  </p>
                </div>
                <span className="hidden text-right tabular-nums text-muted-foreground sm:block">{f.stockSistema ?? "—"}</span>
                <span className="hidden text-right tabular-nums sm:block">{f.contado}</span>
                <span
                  className={cn(
                    "text-right font-heading tabular-nums",
                    (f.diferencia ?? 0) < 0 ? "text-red-600" : (f.diferencia ?? 0) > 0 ? "text-emerald-700" : "text-muted-foreground"
                  )}
                >
                  {f.diferencia === null ? "—" : f.diferencia === 0 ? "OK" : `${f.diferencia > 0 ? "+" : ""}${f.diferencia}`}
                </span>
                <span className="hidden text-right tabular-nums sm:block">{verCostos && f.valor !== null ? formatImporte(f.valor) : ""}</span>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </motion.div>
    </div>
  );
}
