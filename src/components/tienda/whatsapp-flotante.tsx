"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { leerWhatsAppTienda, linkWhatsApp } from "@/lib/comunicaciones/whatsapp";

const TEXTO = "Hola, tengo una consulta sobre la tienda de Club Seminario.";

/** Botón flotante «Consultas por WhatsApp» (solo si la tienda cargó su número). */
export function WhatsAppFlotante() {
  const [numero, setNumero] = useState<string | null>(null);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    let vivo = true;
    // RPC pública (SECURITY DEFINER, también para anon): no está en los tipos generados de public.
    const sb = createBrowserClient() as unknown as { rpc: (fn: string) => PromiseLike<{ data: unknown }> };
    sb.rpc("whatsapp_tienda").then(
      ({ data }) => {
        if (vivo) setNumero(leerWhatsAppTienda(data).numero);
      },
      () => {}
    );
    return () => {
      vivo = false;
    };
  }, []);

  if (!numero) return null;
  return (
    <motion.a
      href={linkWhatsApp(numero, TEXTO)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Consultas por WhatsApp"
      initial={{ opacity: 0, scale: 0.6, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 22, delay: 0.4 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.94 }}
      onHoverStart={() => setHover(true)}
      onHoverEnd={() => setHover(false)}
      className="fixed right-4 bottom-24 z-40 flex h-12 items-center gap-2 rounded-full bg-[#25d366] px-3.5 text-white shadow-[0_8px_30px_rgba(37,211,102,0.35)] lg:right-6 lg:bottom-6"
    >
      <MessageCircle className="size-5 shrink-0" />
      <AnimatePresence initial={false}>
        {hover && (
          <motion.span
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "auto", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden text-sm font-medium whitespace-nowrap"
          >
            Consultas por WhatsApp
          </motion.span>
        )}
      </AnimatePresence>
    </motion.a>
  );
}
