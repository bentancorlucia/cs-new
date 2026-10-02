"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Building2, History, Loader2, LockOpen, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { pesos } from "@/components/pos/formato";
import { easeSmooth, springBouncy, springSmooth } from "@/lib/motion";
import { ContadorEfectivo, type Conteo } from "./contador-efectivo";
import { DiferenciaArqueo } from "./diferencia-arqueo";

type Resultado = { ok: boolean; error?: string; diferencia?: number };

/**
 * Pantalla de apertura: se cuenta el efectivo y la base lo compara con el
 * saldo contable de la caja (si difiere, asienta sobrante o faltante).
 */
export function AbrirCaja({
  nombreCaja,
  saldoContable,
  onAbrir,
  onListo,
  onSoloTransferencia,
}: {
  nombreCaja: string;
  saldoContable: number | null;
  onAbrir: (contado: number, notas: string | null) => Promise<Resultado>;
  /** Después de abrir (y de ver la diferencia, si hubo). */
  onListo: () => void;
  onSoloTransferencia: () => void;
}) {
  const [conteo, setConteo] = useState<Conteo>({ total: 0, detalle: null, cargado: false });
  const [notas, setNotas] = useState("");
  const [pendiente, iniciar] = useTransition();
  const [diferencia, setDiferencia] = useState<number | null>(null);

  const abrir = () => {
    if (!conteo.cargado || pendiente) return;
    iniciar(async () => {
      const texto = [notas.trim(), conteo.detalle ? `Apertura: ${conteo.detalle}` : ""].filter(Boolean).join("\n");
      const r = await onAbrir(conteo.total, texto || null);
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo abrir la caja");
        return;
      }
      const d = r.diferencia ?? 0;
      if (Math.abs(d) < 0.005) {
        toast.success(`Caja abierta con ${pesos(conteo.total)}`);
        onListo();
      } else {
        setDiferencia(d);
      }
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={easeSmooth}
      className="mx-auto w-full max-w-3xl"
    >
      <div className="rounded-2xl border border-linea bg-white shadow-card overflow-hidden">
        <div className="relative bg-bordo-900 px-6 py-6 text-white overflow-hidden">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 0.12 }}
            transition={{ ...springSmooth, delay: 0.1 }}
            className="absolute -right-8 -top-10"
          >
            <Wallet className="size-48" strokeWidth={1} />
          </motion.div>
          <p className="text-[11px] uppercase tracking-editorial text-dorado-300 font-heading">Punto de venta</p>
          <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest">Abrir caja</h1>
          <p className="mt-1 text-sm text-white/80 max-w-md">
            Contá el efectivo que hay en la {nombreCaja} antes de empezar a vender.
          </p>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {diferencia === null ? (
            <motion.div
              key="contar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -8 }}
              className="grid gap-6 p-5 sm:p-6 md:grid-cols-[1fr_1.1fr]"
            >
              <div className="space-y-4">
                <div className="rounded-xl bg-superficie p-4">
                  <p className="text-xs font-heading uppercase tracking-editorial text-muted-foreground">Según la contabilidad</p>
                  <p className="mt-1 text-2xl font-heading font-bold tabular-nums">
                    {saldoContable == null ? "—" : pesos(saldoContable)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Es lo que quedó al último cierre. Si contás otra cosa, la diferencia se registra como sobrante o faltante.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="notas-apertura" className="text-xs font-heading uppercase tracking-editorial text-muted-foreground">
                    Notas (opcional)
                  </label>
                  <Textarea
                    id="notas-apertura"
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    placeholder="Ej.: fondo de cambio traído de tesorería"
                    rows={2}
                  />
                </div>
                <motion.div whileTap={{ scale: 0.97 }}>
                  <Button
                    onClick={abrir}
                    disabled={!conteo.cargado || pendiente}
                    className="h-14 w-full gap-2 text-base font-heading"
                  >
                    {pendiente ? <Loader2 className="size-5 animate-spin" /> : <LockOpen className="size-5" />}
                    {conteo.cargado ? `Abrir caja con ${pesos(conteo.total)}` : "Contá el efectivo para abrir"}
                  </Button>
                </motion.div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button variant="outline" onClick={onSoloTransferencia} className="h-11 flex-1 gap-2">
                    <Building2 className="size-4" />
                    Vender solo por transferencia
                  </Button>
                  <Link href="/admin/pos/caja" className={buttonVariants({ variant: "ghost", className: "h-11 gap-2" })}>
                    <History className="size-4" />
                    Historial
                  </Link>
                </div>
              </div>
              <ContadorEfectivo onCambio={setConteo} />
            </motion.div>
          ) : (
            <motion.div
              key="resultado"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={springBouncy}
              className="space-y-4 p-6"
            >
              <h2 className="font-heading text-xl font-bold">Caja abierta con {pesos(conteo.total)}</h2>
              <DiferenciaArqueo diferencia={diferencia} grande registrada />
              <p className="text-sm text-muted-foreground">
                La contabilidad esperaba {pesos(conteo.total - diferencia)}. La diferencia ya quedó asentada; si fue un error de
                conteo, avisale a tesorería.
              </p>
              <motion.div whileTap={{ scale: 0.97 }}>
                <Button onClick={onListo} className="h-12 w-full gap-2 font-heading">
                  Empezar a vender
                  <ArrowRight className="size-5" />
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
