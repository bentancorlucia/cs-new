"use client";

import { useMemo, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Loader2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha } from "@/lib/contabilidad/formato";
import type { LineaLibros, ParReversion } from "@/lib/contabilidad/conciliacion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { conciliarReversiones } from "@/app/(dashboard)/contabilidad/conciliacion/actions";
import { ImporteSigno } from "./ui-conciliacion";
import { Marca } from "./marca";

/** Pares asiento / reversión de la cuenta: se concilian entre sí, sin movimiento del banco. */
export function ReversionesDialog({
  open,
  onOpenChange,
  extractoId,
  pares: paresIds,
  lineas,
  moneda,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extractoId: string;
  pares: ParReversion[];
  lineas: Map<number, LineaLibros>;
  moneda: string | null;
}) {
  const pares = useMemo(
    () =>
      paresIds
        .map((p) => ({ ...p, original: lineas.get(p.lineaId), reversion: lineas.get(p.reversionId) }))
        .filter((p): p is ParReversion & { original: LineaLibros; reversion: LineaLibros } => !!p.original && !!p.reversion),
    [paresIds, lineas]
  );
  const [descartados, setDescartados] = useState<Set<number>>(new Set());
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const elegidos = pares.filter((p) => !descartados.has(p.lineaId));

  function alternar(id: number) {
    setDescartados((d) => {
      const n = new Set(d);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function cambiar(abierto: boolean) {
    if (pendiente) return;
    if (abierto) {
      setDescartados(new Set());
      setError(null);
    }
    onOpenChange(abierto);
  }

  function aplicar() {
    setError(null);
    startTransition(async () => {
      const r = await conciliarReversiones({
        extractoId,
        pares: elegidos.map((p) => ({ lineaId: p.lineaId, reversionId: p.reversionId })),
      });
      if (!r.ok) {
        setError(r.error);
        toast.error(r.error);
        return;
      }
      const { aplicadas, fallidas, primerError } = r.data;
      toast.success(`${aplicadas} ${aplicadas === 1 ? "reversión conciliada" : "reversiones conciliadas"}`);
      if (fallidas > 0) toast.error(`${fallidas} no se pudieron conciliar: ${primerError}`);
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={cambiar}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-lg text-bordo-950">
            <Undo2 className="size-4 text-rose-600" />
            Conciliar reversiones
          </DialogTitle>
          <DialogDescription>
            Asientos revertidos y su reversión en esta cuenta: se anulan entre sí y nunca pasaron por el banco. Al
            conciliarlos dejan de figurar como partidas pendientes.
          </DialogDescription>
        </DialogHeader>

        <ul className="-mx-1 min-h-0 space-y-2 overflow-y-auto px-1">
          {pares.map((p, i) => {
            const activo = !descartados.has(p.lineaId);
            return (
              <motion.li
                key={p.lineaId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.03, 0.3) }}
              >
                <button
                  type="button"
                  onClick={() => alternar(p.lineaId)}
                  aria-pressed={activo}
                  className={cn(
                    "grid w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-xl border p-3 text-left transition-all",
                    activo ? "border-bordo-200 bg-bordo-50/40" : "border-linea bg-white opacity-60 hover:opacity-90"
                  )}
                >
                  <Marca activa={activo} className="mt-0.5" />
                  <div className="min-w-0 space-y-1.5">
                    {[p.original, p.reversion].map((l) => (
                      <div key={l.id} className="flex items-baseline gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {formatFecha(l.fecha)} · asiento {l.numero ?? "—"}
                          </div>
                          <div className="truncate text-sm">{l.descripcion}</div>
                        </div>
                        <ImporteSigno valor={l.importe} moneda={moneda} className="text-sm font-medium" />
                      </div>
                    ))}
                  </div>
                </button>
              </motion.li>
            );
          })}
          {pares.length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">No hay reversiones pendientes.</li>
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
          <Button className="rounded-full" onClick={aplicar} disabled={pendiente || elegidos.length === 0}>
            {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />}
            {pendiente ? "Conciliando…" : `Conciliar ${elegidos.length} de ${pares.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
