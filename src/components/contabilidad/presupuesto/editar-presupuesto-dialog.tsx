"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, PencilLine } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { actualizarPresupuesto } from "@/app/(dashboard)/contabilidad/presupuesto/actions";

/** Renombrar un borrador y editar sus notas. */
export function EditarPresupuestoDialog({
  open,
  onOpenChange,
  presupuesto,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presupuesto: { id: string; version: number; nombre: string; notas: string | null } | null;
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const [abiertoAntes, setAbiertoAntes] = useState(false);

  // Lo abre el padre: al abrir se cargan los valores actuales.
  if (open !== abiertoAntes) {
    setAbiertoAntes(open);
    if (open && presupuesto) {
      setNombre(presupuesto.nombre);
      setNotas(presupuesto.notas ?? "");
      setError(null);
    }
  }

  const valido = nombre.trim().length > 0;
  const sinCambios = !!presupuesto && nombre.trim() === presupuesto.nombre && notas.trim() === (presupuesto.notas ?? "");

  function cambiar(abierto: boolean) {
    if (pendiente) return;
    onOpenChange(abierto);
  }

  function guardar() {
    if (!presupuesto) return;
    setError(null);
    startTransition(async () => {
      const r = await actualizarPresupuesto({
        presupuestoId: presupuesto.id,
        nombre: nombre.trim(),
        notas: notas.trim() || undefined,
      });
      if (r.ok) {
        toast.success("Presupuesto actualizado");
        onOpenChange(false);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={cambiar}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-full bg-bordo-50 text-bordo-800">
            <PencilLine className="size-5" />
          </div>
          <DialogTitle className="font-heading text-lg text-bordo-950">
            Nombre y notas{presupuesto ? ` · versión ${presupuesto.version}` : ""}
          </DialogTitle>
          <DialogDescription>Se pueden cambiar mientras el presupuesto está en borrador.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valido && !sinCambios) guardar();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="editar-nombre" className="font-heading text-sm">
              Nombre
            </Label>
            <Input
              id="editar-nombre"
              value={nombre}
              maxLength={120}
              onChange={(e) => setNombre(e.target.value)}
              aria-invalid={!valido}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="editar-notas" className="font-heading text-sm">
              Notas <span className="font-body text-xs text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="editar-notas"
              value={notas}
              maxLength={2000}
              rows={4}
              placeholder="Supuestos, criterios, qué cambió respecto de la versión anterior…"
              onChange={(e) => setNotas(e.target.value)}
            />
          </div>
          <AnimatePresence>
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
            <Button type="button" variant="outline" className="rounded-full" onClick={() => cambiar(false)} disabled={pendiente}>
              Cancelar
            </Button>
            <Button type="submit" className="rounded-full" disabled={!valido || sinCambios || pendiente}>
              {pendiente && <Loader2 className="size-3.5 animate-spin" />}
              {pendiente ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
