"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarRange, Loader2, Lock } from "lucide-react";
import { springSmooth } from "@/lib/motion";
import type { EjercicioResumen } from "@/lib/contabilidad/reportes";

/**
 * Chips de ejercicio por searchParam `ejercicio`. Al cambiar de ejercicio
 * borra los parámetros de `limpiar` (versión, meses…), que dependen de él.
 */
export function SelectorEjercicio({
  ejercicios,
  ejercicioId,
  limpiar = [],
  layoutId = "presupuesto-ejercicio",
}: {
  ejercicios: EjercicioResumen[];
  ejercicioId: string;
  limpiar?: string[];
  layoutId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendiente, startTransition] = useTransition();
  const ordenados = [...ejercicios].sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio));

  const elegir = (id: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("ejercicio", id);
    for (const k of limpiar) p.delete(k);
    startTransition(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }));
  };

  return (
    <div className="flex min-w-0 items-center gap-2">
      <CalendarRange className="size-4 shrink-0 text-bordo-700" strokeWidth={1.5} />
      <div className="flex gap-1 overflow-x-auto rounded-full bg-superficie p-1 text-xs [scrollbar-width:none]">
        {ordenados.map((e) => {
          const activo = e.id === ejercicioId;
          return (
            <motion.button
              key={e.id}
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => !activo && elegir(e.id)}
              aria-pressed={activo}
              className={`relative shrink-0 rounded-full px-3 py-1.5 font-heading transition-colors ${
                activo ? "text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {activo && (
                <motion.span layoutId={layoutId} className="absolute inset-0 rounded-full bg-bordo-800" transition={springSmooth} />
              )}
              <span className="relative inline-flex items-center gap-1">
                {e.nombre}
                {e.estado === "cerrado" && <Lock className="size-3" />}
              </span>
            </motion.button>
          );
        })}
      </div>
      <AnimatePresence>
        {pendiente && (
          <motion.span initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}>
            <Loader2 className="size-4 animate-spin text-bordo-700" />
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
