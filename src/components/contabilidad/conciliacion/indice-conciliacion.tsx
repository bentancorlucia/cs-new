"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, FileUp, Landmark, ScrollText, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth, fadeInUp, springBouncy, staggerContainerFast } from "@/lib/motion";
import type { CuentaConciliable, EstadoMes } from "@/lib/contabilidad/conciliacion";
import { EncabezadoPagina, BadgeUsd } from "@/components/contabilidad/asientos/ui-asiento";
import { BadgeExtracto, BarraAvance, MesesConciliados } from "./ui-conciliacion";

export type CuentaVista = CuentaConciliable & { anio: number; meses: EstadoMes[] };

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

export function IndiceConciliacion({
  cuentas,
  elegidaId,
  puedeEscribir,
  error,
}: {
  cuentas: CuentaVista[];
  elegidaId: string | null;
  puedeEscribir: boolean;
  error: string | null;
}) {
  const elegida = cuentas.find((c) => c.id === elegidaId) ?? null;

  return (
    <div className="space-y-6 pb-8">
      <EncabezadoPagina
        eyebrow="Contabilidad"
        titulo="Conciliación bancaria"
        descripcion="Cada extracto del banco se concilia contra los libros. Los extractos van seguidos: cada uno empieza donde terminó el anterior."
      />

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <motion.div
        variants={staggerContainerFast}
        initial="hidden"
        animate="visible"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        {cuentas.map((c) => (
          <TarjetaCuenta key={c.id} cuenta={c} elegida={c.id === elegidaId} puedeEscribir={puedeEscribir} />
        ))}
        {cuentas.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No hay cuentas de caja o banco imputables en el plan de cuentas.
          </p>
        )}
      </motion.div>

      <AnimatePresence mode="wait">
        {elegida && (
          <motion.section
            key={elegida.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={easeSmooth}
            className="rounded-2xl border border-linea bg-white"
          >
            <header className="flex flex-col gap-3 border-b border-linea p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="min-w-0">
                <div className="font-heading text-[11px] uppercase tracking-editorial text-bordo-800/70">
                  Extractos
                </div>
                <h2 className="flex min-w-0 items-center gap-2 font-heading text-lg text-foreground">
                  <span className="truncate">{elegida.nombre}</span>
                  {elegida.moneda && <BadgeUsd />}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {elegida.extractos.length === 0
                    ? "Todavía no se cargó ningún extracto."
                    : `${plural(elegida.extractos.length, "extracto", "extractos")} · ${
                        elegida.conciliadoHasta
                          ? `conciliado hasta el ${formatFecha(elegida.conciliadoHasta)}`
                          : "ninguno cerrado todavía"
                      }`}
                </p>
              </div>
              {puedeEscribir && <BotonImportar cuenta={elegida} />}
            </header>

            {elegida.extractos.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-8 text-center">
                <div className="flex size-11 items-center justify-center rounded-full bg-bordo-50 text-bordo-800">
                  <ScrollText className="size-5" />
                </div>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Importá el primer extracto: su saldo inicial es el punto de partida de la cadena de esta cuenta.
                </p>
              </div>
            ) : (
              <motion.ul variants={staggerContainerFast} initial="hidden" animate="visible" className="divide-y divide-linea">
                {elegida.extractos.map((e) => {
                  const avance = e.movimientos === 0 ? 1 : e.conciliados / e.movimientos;
                  return (
                    <motion.li key={e.id} variants={fadeInUp} transition={easeSmooth}>
                      <Link
                        href={`/contabilidad/conciliacion/${e.id}`}
                        className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-superficie/50 sm:grid-cols-[minmax(10rem,1.2fr)_minmax(12rem,1.5fr)_minmax(8rem,1fr)_auto] sm:px-5"
                      >
                        <div className="min-w-0">
                          <div className="font-medium tabular-nums text-foreground">
                            {formatFecha(e.fechaDesde)} – {formatFecha(e.fechaHasta)}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {e.archivo ?? "Carga manual"} · {plural(e.movimientos, "movimiento", "movimientos")}
                          </div>
                        </div>
                        <div className="col-span-2 row-start-2 text-xs tabular-nums text-muted-foreground sm:col-span-1 sm:row-start-auto">
                          <span className="text-foreground/80">{formatImporte(e.saldoInicial, elegida.moneda ?? undefined)}</span>
                          <ArrowRight className="mx-1 inline size-3" />
                          <span className="font-medium text-foreground">
                            {formatImporte(e.saldoFinal, elegida.moneda ?? undefined)}
                          </span>
                        </div>
                        <div className="col-span-2 row-start-3 sm:col-span-1 sm:row-start-auto">
                          <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
                            <span>Conciliado</span>
                            <span className="tabular-nums">{Math.round(avance * 100)}%</span>
                          </div>
                          <BarraAvance valor={avance} className="mt-1" />
                        </div>
                        <div className="col-start-2 row-start-1 flex items-center gap-2 sm:col-start-auto sm:row-start-auto">
                          <BadgeExtracto estado={e.estado} />
                          <ArrowRight className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-bordo-800 sm:block" />
                        </div>
                      </Link>
                    </motion.li>
                  );
                })}
              </motion.ul>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

function TarjetaCuenta({
  cuenta,
  elegida,
  puedeEscribir,
}: {
  cuenta: CuentaVista;
  elegida: boolean;
  puedeEscribir: boolean;
}) {
  const Icono = /caja|fondo/i.test(cuenta.nombre) ? Wallet : Landmark;
  const u = cuenta.ultimo;
  return (
    <motion.div variants={fadeInUp} transition={easeSmooth} layout>
      <motion.div
        whileHover={{ y: -2 }}
        transition={springBouncy}
        className={cn(
          "relative flex h-full flex-col gap-3 rounded-2xl border bg-white p-4 transition-shadow",
          elegida ? "border-bordo-300 shadow-[0_0_0_3px_rgba(115,13,50,0.08)]" : "border-linea hover:shadow-md"
        )}
      >
        <Link
          href={`/contabilidad/conciliacion?cuenta=${cuenta.id}`}
          scroll={false}
          aria-current={elegida ? "true" : undefined}
          className="absolute inset-0 rounded-2xl"
          aria-label={`Ver extractos de ${cuenta.nombre}`}
        />
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl",
              elegida ? "bg-bordo-800 text-white" : "bg-bordo-50 text-bordo-800"
            )}
          >
            <Icono className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[11px] text-muted-foreground tabular-nums">{cuenta.codigo}</div>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate font-heading text-sm text-foreground">{cuenta.nombre}</span>
              {cuenta.moneda && <BadgeUsd />}
            </div>
          </div>
          {u && <BadgeExtracto estado={u.estado} />}
        </div>

        <div className="text-xs text-muted-foreground">
          {u ? (
            <>
              Último: <span className="tabular-nums text-foreground">{formatFecha(u.fechaDesde)} – {formatFecha(u.fechaHasta)}</span>
              <br />
              Saldo banco:{" "}
              <span className="font-medium tabular-nums text-foreground">
                {formatImporte(u.saldoFinal, cuenta.moneda ?? "UYU")}
              </span>
            </>
          ) : (
            "Sin extractos"
          )}
        </div>

        <MesesConciliados anio={cuenta.anio} meses={cuenta.meses} />

        {puedeEscribir && (
          <div className="relative mt-auto">
            <BotonImportar cuenta={cuenta} compacto />
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function BotonImportar({ cuenta, compacto }: { cuenta: CuentaConciliable; compacto?: boolean }) {
  const texto = cuenta.proximoDesde
    ? `Importar desde ${formatFecha(cuenta.proximoDesde)}`
    : "Importar primer extracto";
  return (
    <motion.span className="inline-flex" whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.97 }} transition={springBouncy}>
      <Link
        href={`/contabilidad/conciliacion/importar?cuenta=${cuenta.id}`}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full font-medium transition-colors",
          compacto
            ? "h-8 border border-linea bg-white px-3 text-xs text-bordo-800 hover:border-bordo-200 hover:bg-bordo-50"
            : "h-9 bg-bordo-800 px-4 text-sm text-white hover:bg-bordo-900"
        )}
      >
        <FileUp className={compacto ? "size-3.5" : "size-4"} />
        {texto}
      </Link>
    </motion.span>
  );
}
