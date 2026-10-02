"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Loader2, RefreshCcwDot } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatFecha } from "@/lib/contabilidad/formato";
import { springSmooth } from "@/lib/motion";
import { revaluarMonedaExtranjera } from "@/app/(dashboard)/contabilidad/ejercicios/actions";

type Resultado = { fecha: string; asientoId: string | null };

export function RevaluarDialog({
  open,
  onOpenChange,
  fechaSugerida,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fechaSugerida: string;
}) {
  const [fecha, setFecha] = useState(fechaSugerida);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [pendiente, startTransition] = useTransition();

  function cambiar(abierto: boolean) {
    if (pendiente) return;
    if (abierto) {
      setFecha(fechaSugerida);
      setError(null);
      setResultado(null);
    }
    onOpenChange(abierto);
  }

  function revaluar() {
    setError(null);
    setResultado(null);
    startTransition(async () => {
      const r = await revaluarMonedaExtranjera(fecha);
      if (r.ok) {
        setResultado({ fecha, asientoId: r.data.asientoId });
        toast.success(
          r.data.asientoId
            ? `Revaluación al ${formatFecha(fecha)} registrada`
            : `Sin diferencias al ${formatFecha(fecha)}`
        );
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={cambiar}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-full bg-dorado-100 text-dorado-800">
            <RefreshCcwDot className="size-5" />
          </div>
          <DialogTitle className="font-heading text-lg text-bordo-950">
            Revaluar dólares a fecha
          </DialogTitle>
          <DialogDescription>
            Lleva el saldo en pesos de las cuentas en dólares (cajas, bancos, proveedores en US$) a la
            cotización BCU de esa fecha. La diferencia va a diferencias de cambio ganadas o perdidas.
            Si ya se revaluó a esa cotización, no genera nada nuevo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="fecha-revaluacion" className="font-heading">
            Fecha
          </Label>
          <Input
            id="fecha-revaluacion"
            type="date"
            value={fecha}
            onChange={(e) => {
              setFecha(e.target.value);
              setResultado(null);
            }}
            className="h-10 max-w-48 text-base"
          />
          <p className="text-xs text-muted-foreground">
            Tiene que caer en un período abierto y con cotización cargada (la del día o la última
            anterior). Lo habitual es el último día del mes, antes de cerrarlo.
          </p>
        </div>

        <AnimatePresence mode="wait">
          {resultado && (
            <motion.div
              key={`${resultado.fecha}-${resultado.asientoId ?? "nada"}`}
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6 }}
              transition={springSmooth}
              className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
            >
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              {resultado.asientoId ? (
                <div className="space-y-1">
                  <p>Se generó el asiento de revaluación al {formatFecha(resultado.fecha)}.</p>
                  <Link
                    href={`/contabilidad/asientos/${resultado.asientoId}`}
                    className="group inline-flex items-center gap-1 font-medium text-bordo-800 underline-offset-2 hover:underline"
                  >
                    Ver asiento
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
              ) : (
                <p>
                  No había diferencias: los saldos en dólares ya estaban valuados a la cotización del{" "}
                  {formatFecha(resultado.fecha)}.
                </p>
              )}
            </motion.div>
          )}
          {error && (
            <motion.p
              key={error}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, x: [0, -6, 6, -4, 4, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
              role="alert"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => cambiar(false)} disabled={pendiente}>
            {resultado ? "Listo" : "Cancelar"}
          </Button>
          <Button className="rounded-full" onClick={revaluar} disabled={!fecha || pendiente}>
            {pendiente && <Loader2 className="size-3.5 animate-spin" />}
            {pendiente ? "Revaluando…" : "Revaluar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
