"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ChevronRight, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatFecha } from "@/lib/contabilidad/formato";
import {
  mesLiquidacion,
  montoLiquidacion,
  resultadoLiquidacion,
  type ResumenLiquidacion,
} from "@/lib/socios/liquidacion-resumen";
import type { LiquidacionLista } from "@/lib/socios/panel-disciplina";
import { LiquidacionDetalle } from "@/components/socios/liquidacion-detalle";
import { Aviso, Panel, Pastilla, Vacio } from "@/components/socios/cuotas/ui";
import { leerLiquidacionDisc } from "@/app/(dashboard)/disciplina/actions";

function Estado({ l }: { l: LiquidacionLista }) {
  const r = resultadoLiquidacion(l);
  if (r.signo > 0) return l.saldo > 0.004 ? <Pastilla tono="alerta">Pendiente de pago</Pastilla> : <Pastilla tono="bueno">Pagada</Pastilla>;
  if (r.signo < 0) return <Pastilla tono="alerta">A depositar</Pastilla>;
  return <Pastilla>Sin saldo</Pastilla>;
}

export function LiquidacionesPanel({
  liquidaciones,
  inicial,
  seleccion,
  onSeleccion,
}: {
  liquidaciones: LiquidacionLista[];
  inicial: ResumenLiquidacion | null;
  seleccion: number | null;
  onSeleccion: (id: number | null) => void;
}) {
  const [cargadas, setCargadas] = useState<Record<number, ResumenLiquidacion>>(inicial ? { [inicial.id]: inicial } : {});
  const [errores, setErrores] = useState<Record<number, string>>({});

  useEffect(() => {
    if (seleccion === null || cargadas[seleccion] || errores[seleccion]) return;
    let vigente = true;
    leerLiquidacionDisc(seleccion).then((r) => {
      if (!vigente) return;
      if (r.ok) setCargadas((c) => ({ ...c, [seleccion]: r.data }));
      else {
        setErrores((e) => ({ ...e, [seleccion]: r.error }));
        toast.error(r.error);
      }
    });
    return () => {
      vigente = false;
    };
  }, [seleccion, cargadas, errores]);

  if (liquidaciones.length === 0 && !inicial) {
    return <Vacio icono={Receipt} titulo="Todavía no hay liquidaciones" texto="Cada mes, después del débito, tesorería liquida lo cobrado y te llega el resumen por mail." />;
  }

  const mostrado = seleccion !== null ? (cargadas[seleccion] ?? null) : null;
  const error = seleccion !== null ? (errores[seleccion] ?? null) : null;
  const cargando = seleccion !== null && !mostrado && !error;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className={cn(seleccion !== null && "hidden lg:block")}>
        <Panel titulo="Por mes" icono={Receipt}>
          <ul className="divide-y divide-linea">
            {liquidaciones.map((l, i) => {
              const r = resultadoLiquidacion(l);
              const activa = seleccion === l.id;
              return (
                <motion.li key={l.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }}>
                  <button
                    type="button"
                    onClick={() => onSeleccion(l.id)}
                    className={cn(
                      "group relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                      activa ? "bg-bordo-50/70" : "hover:bg-superficie/60"
                    )}
                  >
                    {activa && <motion.span layoutId="liq-activa" className="absolute inset-y-0 left-0 w-1 rounded-r bg-bordo-700" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium capitalize">{mesLiquidacion(l.periodo)}</span>
                        <span className={cn("text-sm tabular-nums", r.signo < 0 ? "text-rose-700" : "text-bordo-800")}>
                          {r.signo < 0 ? "−" : ""}
                          {montoLiquidacion(r.importe)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span>
                          {r.texto} · {l.socios} socios
                        </span>
                        <Estado l={l} />
                      </div>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </button>
                </motion.li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="min-w-0">
        {seleccion !== null && (
          <button
            type="button"
            onClick={() => onSeleccion(null)}
            className="group mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-bordo-800 lg:hidden"
          >
            <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
            Todas las liquidaciones
          </button>
        )}
        <AnimatePresence mode="wait">
          {seleccion === null ? (
            <motion.div key="nada" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="hidden lg:block">
              <Vacio icono={Receipt} titulo="Elegí un mes" texto="Vas a ver lo cobrado por débito, la cuota social, la comisión y el detalle por socio." />
            </motion.div>
          ) : cargando ? (
            <motion.div key="cargando" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-2 rounded-2xl border border-linea bg-white py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Cargando la liquidación…
            </motion.div>
          ) : error ? (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Aviso titulo="No se pudo abrir la liquidación">{error}</Aviso>
            </motion.div>
          ) : mostrado ? (
            <motion.div key={mostrado.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Liquidada el {formatFecha(mostrado.fecha)}</span>
                {mostrado.visa_fecha && <span>· débito del {formatFecha(mostrado.visa_fecha)}</span>}
              </div>
              <LiquidacionDetalle resumen={mostrado} />
              {mostrado.notas && <p className="rounded-xl bg-superficie px-3 py-2 text-xs text-muted-foreground">{mostrado.notas}</p>}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
