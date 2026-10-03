"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, MailX, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fadeInUp, springBouncy } from "@/lib/motion";

type Props = {
  token: string;
  valido: boolean;
  email: string | null;
  yaDadaDeBaja: boolean;
  /** Baja de los saludos (cumpleaños, bienvenida), no de la difusión. */
  personal?: boolean;
};

export function BajaConfirmacion({ token, valido, email, yaDadaDeBaja, personal = false }: Props) {
  const [estado, setEstado] = useState<"inicial" | "enviando" | "listo" | "error">(
    yaDadaDeBaja ? "listo" : "inicial"
  );

  async function confirmar() {
    setEstado("enviando");
    try {
      const r = await fetch(`/api/comunicaciones/baja/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      });
      setEstado(r.ok ? "listo" : "error");
    } catch {
      setEstado("error");
    }
  }

  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      className="border border-bordo-800/10 bg-white p-8 text-center shadow-sm"
    >
      <AnimatePresence mode="wait">
        {!valido ? (
          <motion.div key="invalido" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <TriangleAlert className="mx-auto mb-4 size-10 text-bordo-800" />
            <h1 className="font-heading text-xl font-bold text-bordo-950">El enlace no es válido</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Puede estar incompleto. Si querés dejar de recibir correos, respondé cualquiera de nuestros
              mensajes y te damos de baja.
            </p>
          </motion.div>
        ) : estado === "listo" ? (
          <motion.div
            key="listo"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={springBouncy}
          >
            <CheckCircle2 className="mx-auto mb-4 size-12 text-emerald-600" />
            <h1 className="font-heading text-xl font-bold text-bordo-950">
              {personal ? "Listo, no te mandamos más saludos" : "Listo, te dimos de baja"}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {personal
                ? `${email} no va a recibir más saludos del club (cumpleaños, bienvenida). Lo demás te sigue llegando.`
                : `${email} no va a recibir más novedades ni difusión del club. Vas a seguir recibiendo lo necesario sobre tus cuotas, compras y entradas.`}
            </p>
          </motion.div>
        ) : (
          <motion.div key="confirmar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <MailX className="mx-auto mb-4 size-10 text-bordo-800" />
            <h1 className="font-heading text-xl font-bold text-bordo-950">
              {personal ? "¿Dejar de recibir saludos?" : "¿Dejar de recibir novedades?"}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {personal
                ? `${email} va a dejar de recibir los saludos del club (cumpleaños, bienvenida). Las novedades y los avisos sobre cuotas, compras y entradas se siguen enviando.`
                : `${email} va a dejar de recibir correos de difusión de Club Seminario. Los avisos sobre cuotas, compras y entradas se siguen enviando.`}
            </p>
            <motion.div whileTap={{ scale: 0.97 }} className="mt-6 inline-block">
              <Button onClick={confirmar} disabled={estado === "enviando"} className="bg-bordo-800 hover:bg-bordo-900">
                {estado === "enviando" ? "Procesando…" : personal ? "Sí, no quiero saludos" : "Sí, darme de baja"}
              </Button>
            </motion.div>
            {estado === "error" && (
              <p className="mt-4 text-sm text-red-700">No pudimos registrar la baja. Probá de nuevo en un rato.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
