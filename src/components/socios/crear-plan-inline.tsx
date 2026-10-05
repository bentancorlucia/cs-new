"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatImporte } from "@/lib/contabilidad/formato";
import { Campo, claseControl } from "@/components/socios/cuotas/ui";
import { aNumero } from "@/components/socios/disciplinas/ui";

type Resultado = { ok: true; data: number | null } | { ok: false; error: string };

/**
 * Para una disciplina que todavía no tiene planes: crea el primero ahí
 * mismo (nombre + cuota de la disciplina) y lo devuelve para elegirlo.
 * Va dentro de otros formularios: Enter crea el plan, no envía el de afuera.
 */
export function CrearPlanInline({
  disciplina,
  cuotaSocial,
  crear,
  onCreado,
}: {
  disciplina: string;
  /** Lo que paga además el socio por la cuota social (null si no se sabe). */
  cuotaSocial: number | null;
  crear: (nombre: string, importe: number) => Promise<Resultado>;
  onCreado: (plan: { id: number; nombre: string; importe: number }) => void;
}) {
  const [nombre, setNombre] = useState(disciplina);
  const [importe, setImporte] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();
  const monto = aNumero(importe);
  const listo = nombre.trim().length >= 2 && monto > 0;

  function crearPlan() {
    if (!listo || pendiente) return;
    setError(null);
    start(async () => {
      const r = await crear(nombre.trim(), monto);
      if (!r.ok || !r.data) {
        const msg = r.ok ? "No se pudo crear el plan" : r.error;
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success(`Plan “${nombre.trim()}” creado y elegido`);
      onCreado({ id: r.data, nombre: nombre.trim(), importe: monto });
    });
  }

  const alEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      crearPlan();
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="space-y-3 rounded-xl border border-dashed border-dorado-300 bg-dorado-50/50 p-3"
    >
      <p className="flex items-start gap-2 text-sm text-dorado-900">
        <Sparkles className="mt-0.5 size-4 shrink-0" />
        Esta disciplina todavía no tiene planes. Creá el primero:
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo etiqueta="Nombre del plan">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} onKeyDown={alEnter} autoComplete="off" className={claseControl} />
        </Campo>
        <Campo etiqueta="Cuota de la disciplina (UYU/mes)">
          <input
            value={importe}
            onChange={(e) => setImporte(e.target.value)}
            onKeyDown={alEnter}
            inputMode="decimal"
            placeholder="0,00"
            className={cn(claseControl, "tabular-nums")}
          />
        </Campo>
      </div>
      <p className="text-[11px] text-muted-foreground">
        El socio paga además la cuota social{cuotaSocial ? ` (${formatImporte(cuotaSocial, "UYU")})` : ""}.
        {cuotaSocial && monto > 0 ? (
          <>
            {" "}
            En total:{" "}
            <motion.span key={monto} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className="font-medium text-foreground tabular-nums">
              {formatImporte(cuotaSocial + monto, "UYU")}
            </motion.span>{" "}
            por mes.
          </>
        ) : null}
      </p>
      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            key={error}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto", x: [0, -4, 4, 0] }}
            exit={{ opacity: 0, height: 0 }}
            role="alert"
            className="overflow-hidden text-xs text-rose-700"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
      <motion.button
        type="button"
        onClick={crearPlan}
        disabled={!listo || pendiente}
        whileHover={listo && !pendiente ? { y: -1 } : undefined}
        whileTap={listo && !pendiente ? { scale: 0.97 } : undefined}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-bordo-800 px-3.5 text-sm font-medium text-white transition-colors hover:bg-bordo-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pendiente ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        Crear plan
      </motion.button>
    </motion.div>
  );
}
