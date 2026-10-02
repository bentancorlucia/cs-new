"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha } from "@/lib/contabilidad/formato";
import { leerTcVigente } from "@/app/(dashboard)/admin/compras/actions";
import { Campo, claseControl } from "./ui";
import { aImporte } from "./lineas-productos";

/**
 * TC para documentos en dólares: muestra el que va a usar la base (BCU del
 * día hábil anterior a la fecha) y permite indicar otro.
 */
export function TcCampo({
  moneda,
  fecha,
  valor,
  onChange,
  onVigente,
}: {
  moneda: string;
  fecha: string;
  valor: string;
  onChange: (v: string) => void;
  onVigente?: (tc: number | null) => void;
}) {
  const [vigente, setVigente] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    if (moneda === "UYU" || !fecha) return;
    let vivo = true;
    leerTcVigente(fecha, moneda).then((r) => {
      if (!vivo) return;
      const tc = r.ok ? r.data : null;
      setVigente(tc);
      onVigente?.(tc);
    });
    return () => {
      vivo = false;
    };
    // onVigente se pasa inline: no lo incluimos para no repetir la consulta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moneda, fecha]);

  const n = aImporte(valor);
  const invalido = valor.trim() !== "" && !(n > 0);

  return (
    <AnimatePresence initial={false}>
      {moneda !== "UYU" && (
        <motion.div
          key="tc"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <Campo
            etiqueta="Tipo de cambio"
            error={invalido ? "TC inválido" : !valor && vigente === null ? `No hay cotización anterior al ${formatFecha(fecha)}: indicá el TC` : null}
            ayuda={
              vigente === undefined ? (
                "Buscando cotización BCU…"
              ) : vigente ? (
                <span className="inline-flex items-center gap-1">
                  <DollarSign className="size-3" />
                  {valor ? "Usás un TC propio. " : ""}BCU del día hábil anterior: <b>{String(vigente).replace(".", ",")}</b>
                  {valor ? "" : " (es el que usa la base si lo dejás vacío)"}
                </span>
              ) : null
            }
          >
            <input
              inputMode="decimal"
              value={valor}
              onChange={(e) => onChange(e.target.value)}
              placeholder={vigente ? String(vigente).replace(".", ",") : "Ej.: 40,46"}
              aria-invalid={invalido || (!valor && vigente === null) || undefined}
              className={cn(claseControl, "text-right tabular-nums")}
            />
          </Campo>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** TC a mandar a la base: el indicado, o null para que use el vigente. */
export function tcParaEnviar(moneda: string, valor: string): number | null {
  if (moneda === "UYU") return null;
  const n = aImporte(valor);
  return n > 0 ? n : null;
}
