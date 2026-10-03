"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, SendHorizontal } from "lucide-react";
import { toast } from "sonner";
import { procesarColaAhora } from "@/app/(dashboard)/comunicaciones/actions";

/** Manda ya lo pendiente, sin esperar al cron (que en las ramas de prueba no corre). */
export function ProcesarCola({ enCola }: { enCola: number }) {
  const router = useRouter();
  const [pendiente, start] = useTransition();

  function procesar() {
    start(async () => {
      const r = await procesarColaAhora();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const { enviados, fallidos, reintentos, omitidos } = r.data;
      if (enviados + fallidos + reintentos + omitidos === 0) toast.info("No había nada listo para enviar");
      else {
        const partes = [
          `${enviados} enviado(s)`,
          fallidos ? `${fallidos} fallido(s)` : null,
          reintentos ? `${reintentos} para reintentar` : null,
          omitidos ? `${omitidos} omitido(s) por baja` : null,
        ].filter(Boolean);
        (fallidos || reintentos ? toast.warning : toast.success)(partes.join(" · "));
      }
      router.refresh();
    });
  }

  return (
    <motion.button
      type="button"
      onClick={procesar}
      disabled={pendiente}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      className="inline-flex items-center gap-2 border border-bordo-800/20 bg-white px-3 py-2 text-sm font-medium text-bordo-900 transition-colors hover:bg-bordo-800/5 disabled:opacity-60"
    >
      {pendiente ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
      {pendiente ? "Enviando…" : `Procesar cola ahora${enCola ? ` (${enCola})` : ""}`}
    </motion.button>
  );
}
