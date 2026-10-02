"use client";

import { useTransition } from "react";
import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatFecha } from "@/lib/contabilidad/formato";
import { BotonAnimado } from "@/components/contabilidad/ejercicios/boton-animado";
import { actualizarDesdeBcu } from "@/app/(dashboard)/contabilidad/cotizaciones/actions";
import { formatTasa } from "./grafico-cotizaciones";

export function ActualizarBcuBoton() {
  const [pendiente, startTransition] = useTransition();

  function actualizar() {
    startTransition(async () => {
      const r = await actualizarDesdeBcu();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const { registradas, recibidas, ultima } = r.data;
      const detalle = ultima ? `último cierre ${formatFecha(ultima.fecha)}: ${formatTasa(ultima.tasa)}` : "";
      if (registradas > 0) {
        toast.success(
          `${registradas === 1 ? "Se registró 1 cotización" : `Se registraron ${registradas} cotizaciones`} del BCU`,
          { description: detalle }
        );
      } else if (recibidas > 0) {
        toast.success("Ya estaba todo al día", { description: detalle });
      } else {
        toast.info("El BCU no tiene cotizaciones publicadas para los últimos 30 días");
      }
    });
  }

  return (
    <BotonAnimado onClick={actualizar} disabled={pendiente} className="bg-bordo-800 text-white hover:bg-bordo-900">
      <motion.span
        className="inline-flex"
        animate={pendiente ? { rotate: 360 } : { rotate: 0 }}
        transition={pendiente ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0.3 }}
      >
        <RefreshCw className="size-3.5" />
      </motion.span>
      {pendiente ? "Consultando al BCU…" : "Actualizar desde BCU"}
    </BotonAnimado>
  );
}
