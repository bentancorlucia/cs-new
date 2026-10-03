"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Loader2, Mail } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatFechaHora } from "@/lib/comunicaciones/esquemas";
import { leerMensaje } from "@/app/(dashboard)/comunicaciones/actions";
import { BadgeEstadoMensaje, VistaMail } from "./ui";

export type MensajeResumen = {
  id: string;
  email: string;
  nombre: string | null;
  estado: string;
  motivo_omision: string | null;
  error: string | null;
  intentos: number;
  enviado_at: string | null;
  created_at: string;
  envio_id?: string;
  envio_nombre?: string;
};

/** Detalle de un mensaje: datos del intento y el correo tal como sale. */
export function MensajeDialogo({ mensaje, onClose }: { mensaje: MensajeResumen | null; onClose: () => void }) {
  const [vista, setVista] = useState<{ id: string; asunto: string; html: string } | { id: string; error: string } | null>(null);

  useEffect(() => {
    if (!mensaje) return;
    let vivo = true;
    leerMensaje(mensaje.id).then((r) => {
      if (!vivo) return;
      setVista(r.ok ? { id: mensaje.id, ...r.data } : { id: mensaje.id, error: r.error });
    });
    return () => {
      vivo = false;
    };
  }, [mensaje]);

  const actual = vista && mensaje && vista.id === mensaje.id ? vista : null;

  return (
    <Dialog open={!!mensaje} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        {mensaje && (
          <>
            <DialogHeader>
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                className="flex size-10 items-center justify-center rounded-full bg-bordo-50 text-bordo-800"
              >
                <Mail className="size-5" />
              </motion.div>
              <DialogTitle className="font-heading text-lg break-all text-bordo-950">{mensaje.email}</DialogTitle>
              <DialogDescription render={<div />}>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <BadgeEstadoMensaje estado={mensaje.estado} />
                  {mensaje.nombre && <span>{mensaje.nombre}</span>}
                  {mensaje.envio_id && (
                    <Link
                      href={`/comunicaciones/envios/${mensaje.envio_id}`}
                      className="inline-flex items-center gap-0.5 text-bordo-800 hover:underline"
                    >
                      {mensaje.envio_nombre ?? "Ver envío"}
                      <ArrowUpRight className="size-3" />
                    </Link>
                  )}
                </div>
              </DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Creado</dt>
              <dd>{formatFechaHora(mensaje.created_at)}</dd>
              {mensaje.enviado_at && (
                <>
                  <dt className="text-muted-foreground">Enviado</dt>
                  <dd>{formatFechaHora(mensaje.enviado_at)}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Intentos</dt>
              <dd>{mensaje.intentos}</dd>
              {mensaje.motivo_omision && (
                <>
                  <dt className="text-muted-foreground">Motivo</dt>
                  <dd>{mensaje.motivo_omision}</dd>
                </>
              )}
              {mensaje.error && (
                <>
                  <dt className="text-muted-foreground">Error</dt>
                  <dd className="break-words text-rose-700">{mensaje.error}</dd>
                </>
              )}
            </dl>
            {!actual ? (
              <div className="flex h-40 items-center justify-center rounded-xl border border-linea">
                <Loader2 className="size-5 animate-spin text-bordo-700" />
              </div>
            ) : "error" in actual ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{actual.error}</div>
            ) : (
              <VistaMail html={actual.html} asunto={actual.asunto} />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
