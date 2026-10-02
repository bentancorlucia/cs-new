"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  Landmark,
  Lock,
  LockOpen,
  Receipt,
} from "lucide-react";
import type { EstadoCaja, TipoMovimientoCaja } from "@/lib/comercial/caja";
import { PrecioAnimado } from "@/components/pos/precio-animado";
import { fechaHora, hora } from "@/components/pos/formato";
import { springSmooth } from "@/lib/motion";

export const ACCIONES_CAJA: { tipo: TipoMovimientoCaja; texto: string; icono: typeof Landmark }[] = [
  { tipo: "deposito_banco", texto: "Depositar", icono: Landmark },
  { tipo: "retiro", texto: "Retiro", icono: ArrowUpFromLine },
  { tipo: "ingreso", texto: "Ingreso", icono: ArrowDownToLine },
  { tipo: "gasto", texto: "Gasto", icono: Receipt },
];

/** Estado de la caja arriba del POS: quién la abrió, desde cuándo y el efectivo esperado. */
export function BarraCaja({
  estado,
  onMovimiento,
  onCerrar,
  onAbrir,
}: {
  estado: EstadoCaja;
  onMovimiento: (t: TipoMovimientoCaja) => void;
  onCerrar: () => void;
  onAbrir: () => void;
}) {
  const s = estado.sesion;
  // Ambas fechas en hora de Uruguay: igual en el servidor y en el navegador.
  const hoy = fechaHora(new Date().toISOString()).slice(0, 10);
  const desde = s
    ? fechaHora(s.abierta_at).slice(0, 10) === hoy
      ? hora(s.abierta_at)
      : fechaHora(s.abierta_at)
    : "";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springSmooth}
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border px-4 py-2.5 shadow-card print:hidden
        ${s ? "bg-white border-linea" : "bg-amber-50 border-amber-200"}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {s ? (
          <motion.div
            key="abierta"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <span className="relative flex size-2.5 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-400 opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-green-500" />
            </span>
            <div className="min-w-0">
              <p className="font-heading text-sm font-semibold leading-tight">
                Caja abierta
                <span className="font-normal text-muted-foreground">
                  {" "}· {s.abierta_por_nombre ?? "—"} · desde {desde}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                Efectivo esperado{" "}
                <PrecioAnimado valor={estado.esperado ?? 0} className="font-heading font-bold text-foreground text-sm" />
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="cerrada"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <Lock className="size-4 shrink-0 text-amber-700" />
            <p className="text-sm text-amber-900">
              <span className="font-heading font-semibold">Caja cerrada</span> · solo se cobra por transferencia
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="-mx-1 flex max-w-full items-center gap-1.5 overflow-x-auto px-1 scrollbar-hide">
        {s ? (
          <>
            {ACCIONES_CAJA.map(({ tipo, texto, icono: Icono }) => (
              <motion.button
                key={tipo}
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={() => onMovimiento(tipo)}
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-superficie px-3 text-sm font-heading font-medium hover:bg-bordo-50 hover:text-bordo-800 transition-colors"
              >
                <Icono className="size-4" />
                {texto}
              </motion.button>
            ))}
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={onCerrar}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-bordo-800 px-3 text-sm font-heading font-semibold text-white hover:bg-bordo-900 transition-colors"
            >
              <Lock className="size-4" />
              Cerrar caja
            </motion.button>
          </>
        ) : (
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={onAbrir}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-bordo-800 px-3 text-sm font-heading font-semibold text-white hover:bg-bordo-900"
          >
            <LockOpen className="size-4" />
            Abrir caja
          </motion.button>
        )}
        <Link
          href="/admin/pos/caja"
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-heading text-muted-foreground hover:bg-superficie hover:text-foreground transition-colors"
          title="Historial de caja"
        >
          <History className="size-4" />
          <span className="hidden sm:inline">Historial</span>
        </Link>
      </div>
    </motion.div>
  );
}
