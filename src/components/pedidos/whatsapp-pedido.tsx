"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  leerWhatsAppTienda,
  linkWhatsApp,
  normalizarTelefono,
  textoWhatsApp,
  type WhatsAppTienda,
} from "@/lib/comunicaciones/whatsapp";

const POR_DEFECTO = {
  pedido_listo: "Hola {{nombre}}, tu pedido #{{numero}} de la tienda de Club Seminario está listo para retirar.",
  consulta: "Hola, te escribimos de la tienda de Club Seminario por tu pedido #{{numero}}.",
};

/**
 * Botones para escribirle al cliente del pedido por WhatsApp (wa.me con el
 * mensaje armado). Solo aparecen si el teléfono parece un celular.
 */
export function WhatsAppPedido({
  telefono,
  nombre,
  numero,
  listo,
}: {
  telefono: string | null | undefined;
  nombre: string | null | undefined;
  numero: string;
  /** Pedido listo para retirar: el aviso pasa a ser la acción principal. */
  listo: boolean;
}) {
  const [config, setConfig] = useState<WhatsAppTienda | null>(null);
  const destino = normalizarTelefono(telefono);

  useEffect(() => {
    if (!destino) return;
    let vivo = true;
    // RPC pública (no está en los tipos generados de public).
    const sb = createBrowserClient() as unknown as { rpc: (fn: string) => PromiseLike<{ data: unknown }> };
    sb.rpc("whatsapp_tienda").then(({ data }) => {
      if (vivo) setConfig(leerWhatsAppTienda(data));
    });
    return () => {
      vivo = false;
    };
  }, [destino]);

  if (!destino) return null;

  const variables = { nombre: (nombre ?? "").trim().split(/\s+/)[0] ?? "", numero: numero.replace(/^#/, "") };
  const mensajes = { ...POR_DEFECTO, ...(config?.mensajes ?? {}) };
  const botones = [
    { clave: "pedido_listo", etiqueta: "Avisar por WhatsApp", principal: listo },
    { clave: "consulta", etiqueta: "Escribir por WhatsApp", principal: false },
  ] as const;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mt-2 flex flex-wrap gap-1.5"
    >
      {botones.map((b) => (
        <motion.a
          key={b.clave}
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.96 }}
          href={linkWhatsApp(destino, textoWhatsApp(mensajes[b.clave] ?? "", variables))}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
            b.principal
              ? "bg-[#25d366] text-white shadow-sm hover:bg-[#1ebe5b]"
              : "border border-[#25d366]/40 bg-white text-[#128c4a] hover:bg-[#25d366]/10"
          )}
        >
          <MessageCircle className="size-3.5" />
          {b.etiqueta}
        </motion.a>
      ))}
    </motion.div>
  );
}
