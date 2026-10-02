"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarRange, Loader2, Lock } from "lucide-react";
import { springSmooth } from "@/lib/motion";
import { formatFecha } from "@/lib/contabilidad/formato";
import {
  NOMBRE_ATAJO,
  rangoAtajo,
  type AtajoPeriodo,
  type EjercicioResumen,
} from "@/lib/contabilidad/reportes";

const ATAJOS: AtajoPeriodo[] = ["mes", "trimestre", "anio", "ejercicio"];

/**
 * Ejercicio + rango desde/hasta por searchParams (`ejercicio`, `desde`,
 * `hasta`). Conserva el resto de los parámetros (cuenta, tab…).
 */
export function SelectorPeriodo({
  ejercicios,
  ejercicioId,
  desde,
  hasta,
  referencia,
}: {
  ejercicios: EjercicioResumen[];
  ejercicioId: string;
  desde: string;
  hasta: string;
  referencia: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendiente, startTransition] = useTransition();
  const ejercicio = ejercicios.find((e) => e.id === ejercicioId) ?? ejercicios[0];

  const navegar = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    startTransition(() => {
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    });
  };

  const atajoActivo = ATAJOS.find((a) => {
    const r = rangoAtajo(a, ejercicio, referencia);
    return r.hasta === hasta && r.desde === desde;
  });

  const aplicarFechas = (d: string, h: string) => {
    if (!d || !h) return;
    if (d < ejercicio.fecha_inicio || h > ejercicio.fecha_fin) return;
    if (d > h) return;
    if (d === desde && h === hasta) return;
    navegar({ ejercicio: ejercicio.id, desde: d, hasta: h });
  };

  const ordenados = [...ejercicios].sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springSmooth}
      className="reporte-tarjeta rounded-2xl border border-linea bg-white p-3 sm:p-4 shadow-card print:hidden"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Ejercicios */}
        <div className="flex items-center gap-2 min-w-0">
          <CalendarRange className="size-4 shrink-0 text-bordo-700" strokeWidth={1.5} />
          <div className="flex gap-1 overflow-x-auto rounded-full bg-superficie p-1 text-xs [scrollbar-width:none]">
            {ordenados.map((e) => {
              const activo = e.id === ejercicio.id;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => !activo && navegar({ ejercicio: e.id, desde: null, hasta: null })}
                  className={`relative shrink-0 rounded-full px-3 py-1.5 font-heading transition-colors ${
                    activo ? "text-white" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {activo && (
                    <motion.span
                      layoutId="periodo-ejercicio"
                      className="absolute inset-0 rounded-full bg-bordo-800"
                      transition={springSmooth}
                    />
                  )}
                  <span className="relative inline-flex items-center gap-1">
                    {e.nombre}
                    {e.estado === "cerrado" && <Lock className="size-3" />}
                  </span>
                </button>
              );
            })}
          </div>
          <AnimatePresence>
            {pendiente && (
              <motion.span
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                className="shrink-0"
              >
                <Loader2 className="size-4 animate-spin text-bordo-700" />
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Atajos */}
          <div className="flex flex-wrap gap-1.5">
            {ATAJOS.map((a) => {
              const activo = atajoActivo === a;
              return (
                <motion.button
                  key={a}
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    const r = rangoAtajo(a, ejercicio, referencia);
                    navegar({ ejercicio: ejercicio.id, desde: r.desde, hasta: r.hasta });
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-heading transition-colors ${
                    activo
                      ? "border-bordo-800 bg-bordo-50 text-bordo-800"
                      : "border-linea text-muted-foreground hover:border-bordo-200 hover:text-foreground"
                  }`}
                >
                  {NOMBRE_ATAJO[a]}
                </motion.button>
              );
            })}
          </div>

          {/* Fechas */}
          <CamposFecha
            key={`${ejercicio.id}-${desde}-${hasta}`}
            desde={desde}
            hasta={hasta}
            min={ejercicio.fecha_inicio}
            max={ejercicio.fecha_fin}
            onAplicar={aplicarFechas}
          />
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {ejercicio.nombre}: {formatFecha(ejercicio.fecha_inicio)} al {formatFecha(ejercicio.fecha_fin)}
        {ejercicio.estado === "cerrado" ? " · cerrado" : ""}
      </p>
    </motion.div>
  );
}

const CLASE_INPUT =
  "h-9 rounded-lg border border-linea bg-white px-2 font-body tabular-nums focus:border-bordo-400 focus:outline-none focus:ring-2 focus:ring-bordo-100 transition-shadow";

/** Se remonta (key) cuando cambia el período aplicado; mientras tanto edita en local. */
function CamposFecha({
  desde,
  hasta,
  min,
  max,
  onAplicar,
}: {
  desde: string;
  hasta: string;
  min: string;
  max: string;
  onAplicar: (desde: string, hasta: string) => void;
}) {
  const [d, setD] = useState(desde);
  const [h, setH] = useState(hasta);
  const aplicar = () => onAplicar(d, h);
  return (
    <div className="flex items-center gap-2 text-xs">
      <label className="sr-only" htmlFor="periodo-desde">Desde</label>
      <input
        id="periodo-desde"
        type="date"
        value={d}
        min={min}
        max={h || max}
        onChange={(e) => setD(e.target.value)}
        onBlur={aplicar}
        onKeyDown={(e) => e.key === "Enter" && aplicar()}
        className={CLASE_INPUT}
      />
      <span className="text-muted-foreground">→</span>
      <label className="sr-only" htmlFor="periodo-hasta">Hasta</label>
      <input
        id="periodo-hasta"
        type="date"
        value={h}
        min={d || min}
        max={max}
        onChange={(e) => setH(e.target.value)}
        onBlur={aplicar}
        onKeyDown={(e) => e.key === "Enter" && aplicar()}
        className={CLASE_INPUT}
      />
    </div>
  );
}
