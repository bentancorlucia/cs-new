"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarPlus, Loader2 } from "lucide-react";
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
import { crearEjercicio } from "@/app/(dashboard)/contabilidad/ejercicios/actions";

/**
 * Sin ejercicios: se elige el año del primero. Con ejercicios: los
 * ejercicios son consecutivos, así que solo se puede crear el siguiente.
 */
export function CrearEjercicioDialog({
  open,
  onOpenChange,
  primero,
  anioSugerido,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  primero: boolean;
  anioSugerido: number;
}) {
  const [anioTexto, setAnioTexto] = useState(String(anioSugerido));
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const anio = primero ? Number(anioTexto) : anioSugerido;
  const valido = Number.isInteger(anio) && anio >= 2000 && anio <= 2100;

  function cambiar(abierto: boolean) {
    if (pendiente) return;
    if (abierto) {
      setAnioTexto(String(anioSugerido));
      setError(null);
    }
    onOpenChange(abierto);
  }

  function crear() {
    setError(null);
    startTransition(async () => {
      const r = await crearEjercicio(anio);
      if (r.ok) {
        toast.success(`Ejercicio ${anio} creado con sus 12 períodos`);
        onOpenChange(false);
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
            <CalendarPlus className="size-5" />
          </div>
          <DialogTitle className="font-heading text-lg text-bordo-950">
            {primero ? "Crear el primer ejercicio" : `Crear Ejercicio ${anioSugerido}`}
          </DialogTitle>
          <DialogDescription>
            El ejercicio es el año calendario (Estatuto, art. 25: cierra el 31 de diciembre) y se
            divide en 12 períodos mensuales, todos abiertos.
          </DialogDescription>
        </DialogHeader>

        {primero ? (
          <div className="space-y-1.5">
            <Label htmlFor="anio-ejercicio" className="font-heading">
              Año
            </Label>
            <Input
              id="anio-ejercicio"
              inputMode="numeric"
              value={anioTexto}
              onChange={(e) => setAnioTexto(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="h-10 max-w-32 text-base tabular-nums"
              aria-invalid={!valido}
            />
            <p className="text-xs text-muted-foreground">
              Después cargás el asiento de apertura con los saldos iniciales desde el{" "}
              <Link href="/contabilidad/asientos" className="text-bordo-800 underline underline-offset-2">
                Libro diario
              </Link>{" "}
              (tipo apertura). Los siguientes ejercicios se abren solos al cerrar el anterior.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-linea bg-superficie/60 p-3 text-sm">
            Del <strong className="tabular-nums">01/01/{anioSugerido}</strong> al{" "}
            <strong className="tabular-nums">31/12/{anioSugerido}</strong>. Normalmente no hace falta
            crearlo a mano: el cierre del ejercicio anterior lo crea con su asiento de apertura.
            Crealo antes solo si necesitás registrar operaciones del año nuevo sin haber cerrado.
          </div>
        )}

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
          <Button variant="outline" className="rounded-full" onClick={() => cambiar(false)} disabled={pendiente}>
            Cancelar
          </Button>
          <Button className="rounded-full" onClick={crear} disabled={!valido || pendiente}>
            {pendiente && <Loader2 className="size-3.5 animate-spin" />}
            {pendiente ? "Creando…" : `Crear ejercicio ${valido ? anio : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
