"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Boton } from "./ui";

type Res = { ok: true } | { ok: false; error: string };

/** Diálogo con formulario que ejecuta una Server Action y muestra el error de la base. */
export function DialogoAccion({
  open,
  onOpenChange,
  icono: Icono,
  titulo,
  descripcion,
  children,
  textoAccion,
  mensajeOk,
  destructivo,
  deshabilitado,
  ancho = "sm:max-w-md",
  ejecutar,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  icono: LucideIcon;
  titulo: string;
  descripcion?: React.ReactNode;
  children?: React.ReactNode;
  textoAccion: string;
  mensajeOk: string;
  destructivo?: boolean;
  deshabilitado?: boolean;
  ancho?: string;
  /** Devuelve null si la validación local falló (el diálogo queda abierto sin llamar a la base). */
  ejecutar: () => Promise<Res> | null;
}) {
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function cambiar(o: boolean) {
    if (pendiente) return;
    if (!o) setError(null);
    onOpenChange(o);
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const promesa = ejecutar();
    if (!promesa) return;
    start(async () => {
      const r = await promesa;
      if (r.ok) {
        toast.success(mensajeOk);
        onOpenChange(false);
        router.refresh();
      } else {
        setError(r.error);
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={cambiar}>
      <DialogContent className={cn("max-h-[calc(100dvh-2rem)] overflow-y-auto", ancho)}>
        <form onSubmit={enviar} className="space-y-4">
          <DialogHeader>
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              className={cn(
                "flex size-10 items-center justify-center rounded-full",
                destructivo ? "bg-rose-50 text-rose-700" : "bg-bordo-50 text-bordo-800"
              )}
            >
              <Icono className="size-5" />
            </motion.div>
            <DialogTitle className="font-heading text-lg text-bordo-950">{titulo}</DialogTitle>
            {descripcion && <DialogDescription render={<div />}>{descripcion}</DialogDescription>}
          </DialogHeader>
          {children && <div className="space-y-3">{children}</div>}
          <AnimatePresence>
            {error && (
              <motion.div
                key={error}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, x: [0, -6, 6, -4, 4, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>
          <DialogFooter>
            <Boton variante="secundario" onClick={() => cambiar(false)} disabled={pendiente}>
              Cancelar
            </Boton>
            <Boton type="submit" variante={destructivo ? "peligro" : "primario"} pendiente={pendiente} disabled={deshabilitado}>
              {textoAccion}
            </Boton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
