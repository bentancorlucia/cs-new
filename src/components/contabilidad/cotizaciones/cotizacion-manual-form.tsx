"use client";

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Info, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatFecha } from "@/lib/contabilidad/formato";
import { BotonAnimado } from "@/components/contabilidad/ejercicios/boton-animado";
import { registrarCotizacionManual } from "@/app/(dashboard)/contabilidad/cotizaciones/actions";
import { formatTasa } from "./grafico-cotizaciones";
import type { CotizacionVista } from "./cotizaciones-cliente";

/** "40,463" o "40.463" → 40.463 */
function leerTasa(texto: string): number {
  const limpio = texto.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(limpio)) return NaN;
  return Number(limpio);
}

function esFinDeSemana(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  const dia = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dia === 0 || dia === 6;
}

export function CotizacionManualForm({
  cotizaciones,
  hoy,
}: {
  cotizaciones: CotizacionVista[];
  hoy: string;
}) {
  const [fecha, setFecha] = useState(hoy);
  const [tasaTexto, setTasaTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const tasa = leerTasa(tasaTexto);
  const existente = cotizaciones.find((c) => c.fecha === fecha);
  const pisaBcu = existente?.fuente === "bcu";
  const finDeSemana = fecha ? esFinDeSemana(fecha) : false;
  const valido = !!fecha && fecha <= hoy && Number.isFinite(tasa) && tasa > 0 && !pisaBcu;

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!valido) return;
    setError(null);
    startTransition(async () => {
      const r = await registrarCotizacionManual({ fecha, tasa });
      if (r.ok) {
        toast.success(`Cotización manual del ${formatFecha(fecha)} registrada: ${formatTasa(tasa)}`);
        setTasaTexto("");
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <form onSubmit={guardar} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="cot-fecha" className="font-heading">
            Fecha
          </Label>
          <Input
            id="cot-fecha"
            type="date"
            max={hoy}
            value={fecha}
            onChange={(e) => {
              setFecha(e.target.value);
              setError(null);
            }}
            className="h-10 text-base sm:w-44"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cot-tasa" className="font-heading">
            Pesos por dólar
          </Label>
          <Input
            id="cot-tasa"
            inputMode="decimal"
            placeholder="40,463"
            value={tasaTexto}
            onChange={(e) => {
              setTasaTexto(e.target.value);
              setError(null);
            }}
            aria-invalid={tasaTexto !== "" && !(Number.isFinite(tasa) && tasa > 0)}
            className="h-10 text-base tabular-nums"
          />
        </div>
        <BotonAnimado type="submit" disabled={!valido || pendiente} className="h-10">
          {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          {pendiente ? "Guardando…" : "Cargar"}
        </BotonAnimado>
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        {pisaBcu && existente ? (
          <motion.p
            key="bcu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-xs text-red-700"
          >
            El {formatFecha(fecha)} ya tiene la cotización oficial del BCU ({formatTasa(existente.tasa)}): no
            se puede reemplazar a mano.
          </motion.p>
        ) : existente ? (
          <motion.p
            key="manual"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-xs text-amber-800"
          >
            Reemplaza la manual cargada para ese día ({formatTasa(existente.tasa)}).
          </motion.p>
        ) : finDeSemana ? (
          <motion.p
            key="finde"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-xs text-muted-foreground"
          >
            Es fin de semana: el BCU no publica y no hace falta cargarla; se usa la del último día hábil.
          </motion.p>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.p
            key={error}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, x: [0, -6, 6, -4, 4, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
            role="alert"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <p className="flex gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Solo para un día hábil en que el BCU no publicó (o el servicio no respondió). Si después llega
          la oficial, la reemplaza; una cotización del BCU nunca se pisa a mano.
        </span>
      </p>
    </form>
  );
}
