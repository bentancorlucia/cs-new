"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CalendarPlus, CalendarRange, RefreshCcwDot } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { NOMBRE_MES, formatFecha } from "@/lib/contabilidad/formato";
import { easeSmooth, fadeInUp, staggerContainer } from "@/lib/motion";
import {
  cerrarPeriodo,
  reabrirEjercicio,
  reabrirPeriodo,
} from "@/app/(dashboard)/contabilidad/ejercicios/actions";
import { BotonAnimado } from "./boton-animado";
import { CerrarEjercicioDialog } from "./cerrar-ejercicio-dialog";
import { ConfirmarDialog } from "./confirmar-dialog";
import { CrearEjercicioDialog } from "./crear-ejercicio-dialog";
import { EjercicioCard } from "./ejercicio-card";
import { RevaluarDialog } from "./revaluar-dialog";

export type PeriodoVista = {
  id: string;
  anio: number;
  mes: number;
  fechaInicio: string;
  fechaFin: string;
  estado: "abierto" | "cerrado";
  /** Total de asientos del período (confirmados + borradores). */
  asientos: number;
  borradores: number;
};

export type ChequeoCotizacion = {
  moneda: string;
  fecha: string | null;
  tasa: number | null;
  fuente: string | null;
};

export type EjercicioVista = {
  id: string;
  nombre: string;
  anio: number;
  fechaInicio: string;
  fechaFin: string;
  estado: "abierto" | "cerrado";
  cerradoAt: string | null;
  periodos: PeriodoVista[];
  asientos: number;
  borradores: number;
  /** Asientos que no son la apertura (si hay, no se puede reabrir el anterior). */
  movimientosPropios: number;
  /** Última cotización en los 7 días previos al cierre, por moneda que revalúa. */
  cotizacionesCierre: ChequeoCotizacion[];
};

type Dialogo =
  | { tipo: "crear" }
  | { tipo: "revaluar" }
  | { tipo: "cerrarPeriodo"; periodo: PeriodoVista }
  | { tipo: "reabrirPeriodo"; periodo: PeriodoVista }
  | { tipo: "cerrarEjercicio"; ejercicio: EjercicioVista }
  | { tipo: "reabrirEjercicio"; ejercicio: EjercicioVista };

function nombrePeriodo(p: PeriodoVista) {
  return `${NOMBRE_MES[p.mes - 1] ?? p.mes} ${p.anio}`;
}

function sumarDia(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export function EjerciciosCliente({
  ejercicios,
  puedeEscribir,
  hoy,
  error,
  primerPeriodoAbiertoId,
  ultimoPeriodoCerradoId,
  ultimoEjercicioCerradoId,
  fechaRevaluacion,
  proximoAnio,
  hayEjercicios,
}: {
  ejercicios: EjercicioVista[];
  puedeEscribir: boolean;
  hoy: string;
  error: string | null;
  primerPeriodoAbiertoId: string | null;
  ultimoPeriodoCerradoId: string | null;
  ultimoEjercicioCerradoId: string | null;
  fechaRevaluacion: string;
  proximoAnio: number;
  hayEjercicios: boolean;
}) {
  // El diálogo activo se conserva al cerrar para que la animación de salida
  // tenga contenido; `abierto` controla la visibilidad.
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [abierto, setAbierto] = useState(false);
  // Cada apertura monta el diálogo de cero (sin estado de la vez anterior).
  const [apertura, setApertura] = useState(0);

  function abrir(d: Dialogo) {
    setDialogo(d);
    setApertura((n) => n + 1);
    setAbierto(true);
  }

  const hayAbiertos = ejercicios.some((e) => e.estado === "abierto");

  return (
    <div className="space-y-6 pb-12">
      <motion.header
        className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        transition={easeSmooth}
      >
        <div>
          <p className="font-heading text-[10px] uppercase tracking-editorial text-bordo-700">
            Contabilidad
          </p>
          <h1 className="font-display text-2xl uppercase tracking-tightest text-foreground sm:text-3xl">
            Ejercicios y períodos
          </h1>
          <p className="mt-1 max-w-2xl font-body text-sm text-muted-foreground">
            Cada ejercicio es un año calendario con 12 períodos mensuales. Los meses se cierran en
            orden para que nadie registre en fechas ya revisadas; el cierre anual traslada los saldos
            al ejercicio siguiente.
          </p>
        </div>
        {puedeEscribir ? (
          hayEjercicios && (
            <div className="flex flex-wrap gap-2">
              {hayAbiertos && (
                <BotonAnimado variant="outline" onClick={() => abrir({ tipo: "revaluar" })}>
                  <RefreshCcwDot className="size-3.5" />
                  Revaluar dólares a fecha
                </BotonAnimado>
              )}
              <BotonAnimado variant="outline" onClick={() => abrir({ tipo: "crear" })}>
                <CalendarPlus className="size-3.5" />
                Crear ejercicio {proximoAnio}
              </BotonAnimado>
            </div>
          )
        ) : (
          <span className="w-fit rounded-full border border-linea bg-white px-3 py-1 font-heading text-[10px] uppercase tracking-editorial text-muted-foreground">
            Solo lectura
          </span>
        )}
      </motion.header>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          role="alert"
        >
          No se pudieron cargar los ejercicios: {error}
        </motion.div>
      )}

      {!error && !hayEjercicios && (
        <div className="rounded-2xl border border-dashed border-linea bg-white">
          <EmptyState
            icon={CalendarRange}
            title="Todavía no hay ejercicios contables"
            description={
              puedeEscribir
                ? "Creá el primer ejercicio para empezar a registrar asientos. Después cargás la apertura con los saldos iniciales."
                : "Tesorería todavía no creó el primer ejercicio contable."
            }
            action={
              puedeEscribir
                ? { label: `Crear ejercicio ${proximoAnio}`, onClick: () => abrir({ tipo: "crear" }) }
                : undefined
            }
          />
        </div>
      )}

      {hayEjercicios && (
        <motion.div
          className="space-y-4"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {ejercicios.map((e) => (
            <EjercicioCard
              key={e.id}
              ejercicio={e}
              hoy={hoy}
              puedeEscribir={puedeEscribir}
              primerPeriodoAbiertoId={primerPeriodoAbiertoId}
              ultimoPeriodoCerradoId={ultimoPeriodoCerradoId}
              esUltimoCerrado={e.id === ultimoEjercicioCerradoId}
              onCerrarPeriodo={(periodo) => abrir({ tipo: "cerrarPeriodo", periodo })}
              onReabrirPeriodo={(periodo) => abrir({ tipo: "reabrirPeriodo", periodo })}
              onCerrarEjercicio={() => abrir({ tipo: "cerrarEjercicio", ejercicio: e })}
              onReabrirEjercicio={() => abrir({ tipo: "reabrirEjercicio", ejercicio: e })}
            />
          ))}
        </motion.div>
      )}

      {puedeEscribir && dialogo && (
        <Dialogos
          key={apertura}
          dialogo={dialogo}
          abierto={abierto}
          setAbierto={setAbierto}
          ejercicios={ejercicios}
          hoy={hoy}
          fechaRevaluacion={fechaRevaluacion}
          proximoAnio={proximoAnio}
          hayEjercicios={hayEjercicios}
        />
      )}
    </div>
  );
}

function Dialogos({
  dialogo,
  abierto,
  setAbierto,
  ejercicios,
  hoy,
  fechaRevaluacion,
  proximoAnio,
  hayEjercicios,
}: {
  dialogo: Dialogo;
  abierto: boolean;
  setAbierto: (v: boolean) => void;
  ejercicios: EjercicioVista[];
  hoy: string;
  fechaRevaluacion: string;
  proximoAnio: number;
  hayEjercicios: boolean;
}) {
  switch (dialogo.tipo) {
    case "crear":
      return (
        <CrearEjercicioDialog
          open={abierto}
          onOpenChange={setAbierto}
          primero={!hayEjercicios}
          anioSugerido={proximoAnio}
        />
      );

    case "revaluar":
      return (
        <RevaluarDialog open={abierto} onOpenChange={setAbierto} fechaSugerida={fechaRevaluacion} />
      );

    case "cerrarPeriodo": {
      const p = dialogo.periodo;
      const avisos: string[] = [];
      if (p.borradores > 0) {
        avisos.push(
          `Tiene ${p.borradores} ${p.borradores === 1 ? "asiento" : "asientos"} en borrador: hay que confirmarlos o borrarlos antes de cerrar.`
        );
      }
      if (p.fechaFin >= hoy) {
        avisos.push(`El mes todavía no terminó (termina el ${formatFecha(p.fechaFin)}).`);
      }
      return (
        <ConfirmarDialog
          open={abierto}
          onOpenChange={setAbierto}
          titulo={`Cerrar ${nombrePeriodo(p)}`}
          aviso={avisos.length ? avisos.map((a) => <p key={a}>{a}</p>) : undefined}
          textoAccion="Cerrar período"
          textoPendiente="Cerrando…"
          mensajeExito={`${nombrePeriodo(p)} cerrado`}
          accion={() => cerrarPeriodo(p.id)}
        >
          <p>
            Después de cerrar no se pueden registrar, editar ni borrar asientos con fecha entre el{" "}
            {formatFecha(p.fechaInicio)} y el {formatFecha(p.fechaFin)}.
          </p>
          <p>
            Si hay saldos en dólares, conviene revaluarlos al {formatFecha(p.fechaFin)} antes de
            cerrar. Mientras sea el último período cerrado, se puede reabrir.
          </p>
        </ConfirmarDialog>
      );
    }

    case "reabrirPeriodo": {
      const p = dialogo.periodo;
      return (
        <ConfirmarDialog
          open={abierto}
          onOpenChange={setAbierto}
          titulo={`Reabrir ${nombrePeriodo(p)}`}
          textoAccion="Reabrir período"
          textoPendiente="Reabriendo…"
          mensajeExito={`${nombrePeriodo(p)} reabierto`}
          accion={() => reabrirPeriodo(p.id)}
        >
          <p>
            Vuelve a permitir asientos con fecha de {nombrePeriodo(p)}. Usalo solo para corregir algo
            puntual y volvé a cerrarlo después: los reportes ya emitidos de ese mes pueden cambiar.
          </p>
        </ConfirmarDialog>
      );
    }

    case "cerrarEjercicio": {
      const e = dialogo.ejercicio;
      const anterior = ejercicios.find(
        (x) => x.estado === "abierto" && x.fechaFin < e.fechaInicio
      );
      return (
        <CerrarEjercicioDialog
          open={abierto}
          onOpenChange={setAbierto}
          ejercicio={e}
          anteriorAbierto={anterior?.nombre ?? null}
          hoy={hoy}
        />
      );
    }

    case "reabrirEjercicio": {
      const e = dialogo.ejercicio;
      const siguiente = ejercicios.find((x) => x.fechaInicio === sumarDia(e.fechaFin));
      const bloqueado = !!siguiente && siguiente.movimientosPropios > 0;
      return (
        <ConfirmarDialog
          open={abierto}
          onOpenChange={setAbierto}
          titulo={`Reabrir ${e.nombre}`}
          destructivo
          deshabilitado={bloqueado}
          aviso={
            bloqueado
              ? `El ${siguiente.nombre} ya tiene ${siguiente.movimientosPropios} ${siguiente.movimientosPropios === 1 ? "asiento" : "asientos"} además de la apertura: no se puede reabrir.`
              : undefined
          }
          textoAccion="Reabrir ejercicio"
          textoPendiente="Reabriendo…"
          mensajeExito={`${e.nombre} reabierto`}
          accion={() => reabrirEjercicio(e.id)}
        >
          <p>Se van a borrar los asientos generados por el cierre:</p>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>revaluación de cierre, cierre de resultados y refundición de {e.nombre};</li>
            <li>el asiento de apertura del {siguiente?.nombre ?? `ejercicio ${e.anio + 1}`}.</li>
          </ul>
          <p>
            El ejercicio y diciembre quedan abiertos para corregir; después lo volvés a cerrar y se
            regeneran.
          </p>
        </ConfirmarDialog>
      );
    }
  }
}
