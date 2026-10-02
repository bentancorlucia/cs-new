"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ResultadoSimple = { ok: true } | { ok: false; error: string };

/**
 * AlertDialog de confirmación que ejecuta una Server Action. Si la base
 * rechaza la operación, el mensaje queda visible en el diálogo.
 */
export function ConfirmarDialog({
  open,
  onOpenChange,
  titulo,
  children,
  aviso,
  textoAccion,
  textoPendiente,
  destructivo,
  deshabilitado,
  mensajeExito,
  accion,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: string;
  children: React.ReactNode;
  /** Advertencia previa (en ámbar), opcional. */
  aviso?: React.ReactNode;
  textoAccion: string;
  textoPendiente: string;
  destructivo?: boolean;
  deshabilitado?: boolean;
  mensajeExito: string;
  accion: () => Promise<ResultadoSimple>;
}) {
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function cambiar(abierto: boolean) {
    if (pendiente) return;
    if (!abierto) setError(null);
    onOpenChange(abierto);
  }

  function confirmar() {
    setError(null);
    startTransition(async () => {
      const r = await accion();
      if (r.ok) {
        toast.success(mensajeExito);
        onOpenChange(false);
      } else {
        setError(r.error);
        toast.error(r.error);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={cambiar}>
      <AlertDialogContent className="data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading text-lg text-bordo-950">{titulo}</AlertDialogTitle>
          <AlertDialogDescription render={<div />} className="space-y-2 text-left">
            {children}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {aviso && (
          <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>{aviso}</div>
          </div>
        )}

        <AnimatePresence>
          {error && (
            <motion.div
              key={error}
              initial={{ opacity: 0, x: 0 }}
              animate={{ opacity: 1, x: [0, -6, 6, -4, 4, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
              role="alert"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <AlertDialogFooter>
          <AlertDialogCancel className="rounded-full" disabled={pendiente}>
            Cancelar
          </AlertDialogCancel>
          <Button
            onClick={confirmar}
            disabled={pendiente || deshabilitado}
            className={cn(
              "rounded-full",
              destructivo && "bg-red-600 text-white hover:bg-red-700"
            )}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={pendiente ? "p" : "a"}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="inline-flex items-center gap-1.5"
              >
                {pendiente && <Loader2 className="size-3.5 animate-spin" />}
                {pendiente ? textoPendiente : textoAccion}
              </motion.span>
            </AnimatePresence>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
