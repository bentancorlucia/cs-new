"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Lock, LockOpen, RotateCcw } from "lucide-react";
import { NOMBRE_MES, formatFecha } from "@/lib/contabilidad/formato";
import { easeDramatic, easeSmooth, fadeInUp, scaleIn, springBouncy, staggerContainerFast } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { BotonAnimado } from "./boton-animado";
import { NumeroAnimado } from "./numero-animado";
import type { EjercicioVista, PeriodoVista } from "./ejercicios-cliente";

const fechaHora = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

export function EjercicioCard({
  ejercicio,
  hoy,
  puedeEscribir,
  primerPeriodoAbiertoId,
  ultimoPeriodoCerradoId,
  esUltimoCerrado,
  onCerrarPeriodo,
  onReabrirPeriodo,
  onCerrarEjercicio,
  onReabrirEjercicio,
}: {
  ejercicio: EjercicioVista;
  hoy: string;
  puedeEscribir: boolean;
  primerPeriodoAbiertoId: string | null;
  ultimoPeriodoCerradoId: string | null;
  esUltimoCerrado: boolean;
  onCerrarPeriodo: (p: PeriodoVista) => void;
  onReabrirPeriodo: (p: PeriodoVista) => void;
  onCerrarEjercicio: () => void;
  onReabrirEjercicio: () => void;
}) {
  const cerrados = ejercicio.periodos.filter((p) => p.estado === "cerrado").length;
  const total = ejercicio.periodos.length || 12;
  const abierto = ejercicio.estado === "abierto";

  return (
    <motion.article
      layout
      variants={fadeInUp}
      transition={easeSmooth}
      className={cn(
        "rounded-2xl border bg-white p-4 sm:p-5",
        abierto ? "border-linea" : "border-linea bg-superficie/40"
      )}
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl uppercase tracking-tightest text-bordo-950 sm:text-2xl">
              {ejercicio.nombre}
            </h2>
            <EstadoEjercicio abierto={abierto} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            {formatFecha(ejercicio.fechaInicio)} – {formatFecha(ejercicio.fechaFin)}
            {" · "}
            {plural(ejercicio.asientos, "asiento", "asientos")}
            {ejercicio.borradores > 0 && (
              <span className="text-amber-700">
                {" · "}
                {plural(ejercicio.borradores, "borrador", "borradores")}
              </span>
            )}
          </p>
          {ejercicio.cerradoAt && (
            <p className="text-xs text-muted-foreground">
              Cerrado el {fechaHora.format(new Date(ejercicio.cerradoAt))}
            </p>
          )}
        </div>

        {puedeEscribir && (abierto || esUltimoCerrado) && (
          <div className="flex flex-wrap gap-2">
            {abierto ? (
              <BotonAnimado
                onClick={onCerrarEjercicio}
                className="bg-bordo-800 text-white hover:bg-bordo-900"
              >
                <Lock className="size-3.5" />
                Cerrar ejercicio
              </BotonAnimado>
            ) : (
              <BotonAnimado variant="outline" onClick={onReabrirEjercicio}>
                <RotateCcw className="size-3.5" />
                Reabrir ejercicio
              </BotonAnimado>
            )}
          </div>
        )}
      </header>

      {/* Avance de cierres mensuales */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between text-xs text-muted-foreground">
          <span className="font-heading uppercase tracking-editorial">Meses cerrados</span>
          <span className="font-heading text-sm text-foreground">
            <NumeroAnimado valor={cerrados} />
            <span className="text-muted-foreground">/{total}</span>
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-superficie">
          <motion.div
            className="h-full origin-left rounded-full bg-gradient-to-r from-bordo-800 to-bordo-600"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: cerrados / total }}
            transition={easeDramatic}
          />
        </div>
      </div>

      <motion.ul
        className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6"
        variants={staggerContainerFast}
        initial="hidden"
        animate="visible"
      >
        {ejercicio.periodos.map((p) => (
          <PeriodoChip
            key={p.id}
            periodo={p}
            hoy={hoy}
            puedeEscribir={puedeEscribir}
            esPrimerAbierto={p.id === primerPeriodoAbiertoId}
            esUltimoCerrado={p.id === ultimoPeriodoCerradoId}
            onCerrar={() => onCerrarPeriodo(p)}
            onReabrir={() => onReabrirPeriodo(p)}
          />
        ))}
      </motion.ul>
    </motion.article>
  );
}

function EstadoEjercicio({ abierto }: { abierto: boolean }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={abierto ? "abierto" : "cerrado"}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        transition={springBouncy}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-heading text-[10px] uppercase tracking-editorial",
          abierto ? "bg-emerald-50 text-emerald-700" : "bg-bordo-50 text-bordo-800"
        )}
      >
        {abierto ? <LockOpen className="size-3" /> : <Lock className="size-3" />}
        {abierto ? "Abierto" : "Cerrado"}
      </motion.span>
    </AnimatePresence>
  );
}

function PeriodoChip({
  periodo,
  hoy,
  puedeEscribir,
  esPrimerAbierto,
  esUltimoCerrado,
  onCerrar,
  onReabrir,
}: {
  periodo: PeriodoVista;
  hoy: string;
  puedeEscribir: boolean;
  esPrimerAbierto: boolean;
  esUltimoCerrado: boolean;
  onCerrar: () => void;
  onReabrir: () => void;
}) {
  const cerrado = periodo.estado === "cerrado";
  const enCurso = periodo.fechaInicio <= hoy && hoy <= periodo.fechaFin;
  const futuro = periodo.fechaInicio > hoy;
  const mes = NOMBRE_MES[periodo.mes - 1] ?? String(periodo.mes);

  return (
    <motion.li
      layout
      variants={scaleIn}
      whileHover={{ y: -2 }}
      transition={springBouncy}
      title={`${mes} ${periodo.anio}: ${cerrado ? "cerrado" : "abierto"}`}
      className={cn(
        "relative flex min-h-[5.25rem] flex-col rounded-xl border p-2.5 transition-colors",
        cerrado && "border-linea bg-superficie",
        !cerrado && !futuro && "border-linea bg-white",
        !cerrado && futuro && "border-dashed border-linea bg-white/60",
        esPrimerAbierto && "border-bordo-200 ring-2 ring-bordo-800/10"
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className={cn(
            "font-heading text-sm",
            cerrado || futuro ? "text-muted-foreground" : "text-foreground"
          )}
        >
          <span className="sm:hidden">{mes.slice(0, 3)}</span>
          <span className="hidden sm:inline">{mes}</span>
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={cerrado ? "c" : "a"}
            initial={{ opacity: 0, rotate: -30, scale: 0.6 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 30, scale: 0.6 }}
            transition={springBouncy}
            aria-label={cerrado ? "Cerrado" : "Abierto"}
          >
            {cerrado ? (
              <Lock className="size-3.5 text-bordo-700" />
            ) : (
              <LockOpen className="size-3.5 text-emerald-600" />
            )}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="mt-1 space-y-0.5 text-[11px] leading-tight text-muted-foreground tabular-nums">
        <p>{plural(periodo.asientos, "asiento", "asientos")}</p>
        {periodo.borradores > 0 && (
          <p className="text-amber-700">{plural(periodo.borradores, "borrador", "borradores")}</p>
        )}
        {enCurso && !cerrado && (
          <p className="inline-flex items-center gap-1 text-bordo-700">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-bordo-500 opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-bordo-600" />
            </span>
            en curso
          </p>
        )}
      </div>

      {puedeEscribir && (esPrimerAbierto || esUltimoCerrado) && (
        <div className="mt-auto flex flex-col gap-1 pt-2">
          {esPrimerAbierto && (
            <motion.button
              type="button"
              onClick={onCerrar}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.95 }}
              transition={springBouncy}
              className="inline-flex items-center justify-center gap-1 rounded-full bg-bordo-800 px-2 py-1 font-heading text-[11px] text-white hover:bg-bordo-900"
            >
              <Lock className="size-3" />
              Cerrar
            </motion.button>
          )}
          {esUltimoCerrado && (
            <motion.button
              type="button"
              onClick={onReabrir}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.95 }}
              transition={springBouncy}
              className="inline-flex items-center justify-center gap-1 rounded-full border border-bordo-200 bg-white px-2 py-1 font-heading text-[11px] text-bordo-800 hover:bg-bordo-50"
            >
              <LockOpen className="size-3" />
              Reabrir
            </motion.button>
          )}
        </div>
      )}
    </motion.li>
  );
}
