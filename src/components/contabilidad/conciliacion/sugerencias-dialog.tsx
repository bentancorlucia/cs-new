"use client";

import { useMemo, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeftRight, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha } from "@/lib/contabilidad/formato";
import type { LineaLibros, MovimientoBanco, Sugerencia } from "@/lib/contabilidad/conciliacion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { aplicarSugerencias } from "@/app/(dashboard)/contabilidad/conciliacion/actions";
import { ImporteSigno } from "./ui-conciliacion";
import { Marca } from "./marca";

export function SugerenciasDialog({
  open,
  onOpenChange,
  extractoId,
  sugerencias,
  movimientos,
  lineas,
  moneda,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extractoId: string;
  sugerencias: Sugerencia[];
  movimientos: Map<number, MovimientoBanco>;
  lineas: Map<number, LineaLibros>;
  moneda: string | null;
}) {
  const pares = useMemo(
    () =>
      sugerencias
        .map((s) => ({ ...s, mov: movimientos.get(s.movimientoId), lin: lineas.get(s.lineaId) }))
        .filter((p): p is Sugerencia & { mov: MovimientoBanco; lin: LineaLibros } => !!p.mov && !!p.lin),
    [sugerencias, movimientos, lineas]
  );
  const [descartadas, setDescartadas] = useState<Set<number>>(new Set());
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const elegidas = pares.filter((p) => !descartadas.has(p.movimientoId));

  function alternar(id: number) {
    setDescartadas((d) => {
      const n = new Set(d);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function cambiar(abierto: boolean) {
    if (pendiente) return;
    if (abierto) {
      setDescartadas(new Set());
      setError(null);
    }
    onOpenChange(abierto);
  }

  function aplicar() {
    setError(null);
    startTransition(async () => {
      const r = await aplicarSugerencias({
        extractoId,
        pares: elegidas.map((p) => ({ movimientoId: p.movimientoId, lineaId: p.lineaId })),
      });
      if (!r.ok) {
        setError(r.error);
        toast.error(r.error);
        return;
      }
      const { aplicadas, fallidas, primerError } = r.data;
      toast.success(`${aplicadas} ${aplicadas === 1 ? "coincidencia conciliada" : "coincidencias conciliadas"}`);
      if (fallidas > 0) toast.error(`${fallidas} no se pudieron conciliar: ${primerError}`);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={cambiar}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-lg text-bordo-950">
            <Sparkles className="size-4 text-dorado-500" />
            Sugerencias de conciliación
          </DialogTitle>
          <DialogDescription>
            Movimientos del banco y líneas de los libros con el mismo importe y fecha cercana (hasta 7 días). Destildá las que no correspondan.
          </DialogDescription>
        </DialogHeader>

        <ul className="-mx-1 min-h-0 space-y-2 overflow-y-auto px-1">
          {pares.map((p, i) => {
            const activa = !descartadas.has(p.movimientoId);
            return (
              <motion.li
                key={p.movimientoId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
              >
                <button
                  type="button"
                  onClick={() => alternar(p.movimientoId)}
                  aria-pressed={activa}
                  className={cn(
                    "grid w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-xl border p-3 text-left transition-all",
                    activa ? "border-bordo-200 bg-bordo-50/40" : "border-linea bg-white opacity-60 hover:opacity-90"
                  )}
                >
                  <Marca activa={activa} className="mt-0.5" />
                  <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Banco · {formatFecha(p.mov.fecha)}</div>
                      <div className="truncate text-sm">{p.mov.concepto}</div>
                    </div>
                    <div className="flex items-center gap-2 sm:flex-col sm:gap-0.5">
                      <ImporteSigno valor={p.mov.importe} moneda={moneda} className="text-sm font-semibold" />
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                        <ArrowLeftRight className="size-3" />
                        {p.dias === 0 ? "mismo día" : `${p.dias} ${p.dias === 1 ? "día" : "días"}`}
                      </span>
                    </div>
                    <div className="min-w-0 sm:text-right">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Libros · {formatFecha(p.lin.fecha)} · asiento {p.lin.numero ?? "—"}
                      </div>
                      <div className="truncate text-sm">{p.lin.descripcion}</div>
                    </div>
                  </div>
                </button>
              </motion.li>
            );
          })}
          {pares.length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">No hay coincidencias para sugerir.</li>
          )}
        </ul>

        {error && (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => cambiar(false)} disabled={pendiente}>
            Cancelar
          </Button>
          <Button className="rounded-full" onClick={aplicar} disabled={pendiente || elegidas.length === 0}>
            {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {pendiente ? "Conciliando…" : `Conciliar ${elegidas.length} de ${pares.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
