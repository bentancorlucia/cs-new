"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { LineChart, Loader2, Waves } from "lucide-react";
import type { AgrupacionFlujo, EstadoFlujo, HorizonteProyeccion, ProyeccionFlujo } from "@/lib/contabilidad/flujo";
import { easeSmooth, springSmooth } from "@/lib/motion";
import { VistaReal, type OpcionDisponibilidad, type OpcionMes } from "./vista-real";
import { VistaProyeccion } from "./vista-proyeccion";

export type VistaFlujo = "real" | "proyeccion";

const VISTAS: { id: VistaFlujo; label: string; icono: typeof Waves }[] = [
  { id: "real", label: "Flujo real", icono: Waves },
  { id: "proyeccion", label: "Proyección", icono: LineChart },
];

export function FlujoCliente({
  vista,
  hoy,
  real,
  proyeccion,
  error,
  opcionesMeses,
  disponibilidades,
  filtros,
}: {
  vista: VistaFlujo;
  hoy: string;
  real: EstadoFlujo | null;
  proyeccion: ProyeccionFlujo | null;
  error: string | null;
  opcionesMeses: OpcionMes[];
  disponibilidades: OpcionDisponibilidad[];
  filtros: {
    desde: string;
    hasta: string;
    cuenta: string | null;
    agrupar: AgrupacionFlujo;
    horizonte: HorizonteProyeccion;
    ejercicioDesde: string;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendiente, startTransition] = useTransition();

  const navegar = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    const qs = p.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 print:hidden">
        <div className="flex w-full gap-1 overflow-x-auto rounded-full border border-linea bg-white p-1 text-xs sm:w-fit [scrollbar-width:none]">
          {VISTAS.map(({ id, label, icono: Icono }) => (
            <motion.button
              key={id}
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => id !== vista && navegar({ vista: id === "real" ? null : id })}
              className={`relative flex flex-1 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 py-2 font-heading transition-colors sm:flex-none ${
                vista === id ? "text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {vista === id && (
                <motion.span layoutId="vista-flujo" className="absolute inset-0 rounded-full bg-bordo-800" transition={springSmooth} />
              )}
              <Icono className="relative size-3.5" />
              <span className="relative">{label}</span>
            </motion.button>
          ))}
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

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {error}
        </motion.div>
      )}

      <motion.div animate={{ opacity: pendiente ? 0.55 : 1 }} transition={{ duration: 0.2 }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={vista}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={easeSmooth}
          >
            {vista === "real" ? (
              <VistaReal
                datos={real}
                hoy={hoy}
                opcionesMeses={opcionesMeses}
                disponibilidades={disponibilidades}
                filtros={filtros}
                navegar={navegar}
              />
            ) : (
              <VistaProyeccion datos={proyeccion} horizonte={filtros.horizonte} navegar={navegar} />
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
