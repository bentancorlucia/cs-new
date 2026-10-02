"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, BookOpenText, Landmark, Minus, PencilLine } from "lucide-react";
import { formatFecha } from "@/lib/contabilidad/formato";
import { easeSmooth, fadeInUp, staggerContainer } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { NumeroAnimado } from "@/components/contabilidad/ejercicios/numero-animado";
import { ActualizarBcuBoton } from "./actualizar-bcu-boton";
import { CotizacionManualForm } from "./cotizacion-manual-form";
import { GraficoCotizaciones, formatTasa } from "./grafico-cotizaciones";

export type CotizacionVista = {
  fecha: string;
  tasa: number;
  fuente: "bcu" | "manual";
};

export function CotizacionesCliente({
  cotizaciones,
  puedeEscribir,
  hoy,
  dias,
  error,
}: {
  /** Más nueva primero. */
  cotizaciones: CotizacionVista[];
  puedeEscribir: boolean;
  hoy: string;
  dias: number;
  error: string | null;
}) {
  const ultima = cotizaciones[0] ?? null;
  const ultimaBcu = cotizaciones.find((c) => c.fuente === "bcu") ?? null;
  // tc_vigente: la del día hábil anterior (la última con fecha < hoy).
  const vigente = cotizaciones.find((c) => c.fecha < hoy) ?? null;
  const masVieja = cotizaciones.at(-1) ?? null;
  const variacion =
    ultima && masVieja && masVieja !== ultima ? ((ultima.tasa - masVieja.tasa) / masVieja.tasa) * 100 : null;

  return (
    <motion.div
      className="space-y-6 pb-12"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      <motion.header
        variants={fadeInUp}
        transition={easeSmooth}
        className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
      >
        <div>
          <p className="font-heading text-[10px] uppercase tracking-editorial text-bordo-700">
            Contabilidad
          </p>
          <h1 className="font-display text-2xl uppercase tracking-tightest text-foreground sm:text-3xl">
            Cotizaciones
          </h1>
          <p className="mt-1 max-w-2xl font-body text-sm text-muted-foreground">
            Dólar interbancario del Banco Central del Uruguay. Se actualiza solo todas las noches.
          </p>
        </div>
        {puedeEscribir ? (
          <ActualizarBcuBoton />
        ) : (
          <span className="w-fit rounded-full border border-linea bg-white px-3 py-1 font-heading text-[10px] uppercase tracking-editorial text-muted-foreground">
            Solo lectura
          </span>
        )}
      </motion.header>

      {error && (
        <motion.div
          variants={fadeInUp}
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          role="alert"
        >
          No se pudieron cargar las cotizaciones: {error}
        </motion.div>
      )}

      {/* KPIs */}
      <motion.div variants={fadeInUp} transition={easeSmooth} className="grid gap-3 sm:grid-cols-3">
        <Kpi
          etiqueta="Último cierre BCU"
          valor={ultimaBcu?.tasa ?? null}
          sub={ultimaBcu ? `Cierre del ${formatFecha(ultimaBcu.fecha)}` : "Sin cotizaciones del BCU"}
        />
        <Kpi
          etiqueta="Para documentos de hoy"
          valor={vigente?.tasa ?? null}
          sub={
            vigente
              ? `Cierre del ${formatFecha(vigente.fecha)}${vigente.fuente === "manual" ? " (manual)" : ""}`
              : "Falta la cotización del día hábil anterior"
          }
          destacado
          alerta={!vigente}
        />
        <div className="rounded-2xl border border-linea bg-white p-4">
          <p className="font-heading text-[11px] uppercase tracking-editorial text-muted-foreground">
            Variación {dias} días
          </p>
          {variacion === null ? (
            <p className="mt-1 font-display text-3xl text-muted-foreground">—</p>
          ) : (
            <p
              className={cn(
                "mt-1 inline-flex items-center gap-1 font-display text-3xl",
                variacion > 0 ? "text-emerald-700" : variacion < 0 ? "text-red-700" : "text-foreground"
              )}
            >
              {variacion > 0 ? (
                <ArrowUpRight className="size-6" />
              ) : variacion < 0 ? (
                <ArrowDownRight className="size-6" />
              ) : (
                <Minus className="size-6" />
              )}
              <NumeroAnimado valor={Math.abs(variacion)} decimales={2} />
              <span className="text-xl">%</span>
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {masVieja ? `Desde el ${formatFecha(masVieja.fecha)}` : "Sin datos"}
          </p>
        </div>
      </motion.div>

      {/* Gráfico */}
      <motion.section
        variants={fadeInUp}
        transition={easeSmooth}
        className="rounded-2xl border border-linea bg-white p-4 sm:p-5"
      >
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-heading text-base text-bordo-950">Últimos {dias} días</h2>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-0.5 w-4 rounded bg-bordo-800" /> BCU
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-dorado-300" /> Manual
            </span>
          </div>
        </div>
        <GraficoCotizaciones cotizaciones={cotizaciones} />
      </motion.section>

      {/* Nota normativa */}
      <motion.aside
        variants={fadeInUp}
        transition={easeSmooth}
        className="flex gap-3 rounded-2xl border border-dorado-200 bg-dorado-50 p-4 text-sm text-bordo-950"
      >
        <BookOpenText className="mt-0.5 size-4 shrink-0 text-dorado-700" />
        <div className="space-y-1">
          <p>
            <strong className="font-heading">Documentos en dólares</strong> (facturas, cobros, pagos): se
            convierten con la cotización del <strong>día hábil anterior</strong> a su fecha (Decreto
            150/007, art. 74).
          </p>
          <p>
            <strong className="font-heading">Saldos al cierre</strong> de mes o de ejercicio: se valúan con
            la cotización del <strong>mismo día</strong>.
          </p>
        </div>
      </motion.aside>

      <div className={cn("grid gap-6", puedeEscribir && "lg:grid-cols-[1fr_22rem] lg:items-start")}>
        {/* Tabla */}
        <motion.section
          variants={fadeInUp}
          transition={easeSmooth}
          className="overflow-hidden rounded-2xl border border-linea bg-white"
        >
          {cotizaciones.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No hay cotizaciones cargadas en los últimos {dias} días.
              {puedeEscribir && " Usá “Actualizar desde BCU” para traerlas."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-superficie">
                <tr className="text-left font-heading text-[11px] uppercase tracking-editorial text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Fecha</th>
                  <th className="px-4 py-2.5 text-right font-medium">Pesos por dólar</th>
                  <th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Variación</th>
                  <th className="px-4 py-2.5 text-right font-medium">Fuente</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {cotizaciones.map((c, i) => {
                    const anterior = cotizaciones[i + 1];
                    const delta = anterior ? c.tasa - anterior.tasa : null;
                    const esVigente = vigente?.fecha === c.fecha;
                    return (
                      <motion.tr
                        key={c.fecha}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0, transition: { ...easeSmooth, delay: Math.min(i, 15) * 0.03 } }}
                        exit={{ opacity: 0 }}
                        className={cn(
                          "border-t border-linea transition-colors hover:bg-bordo-50/50",
                          esVigente && "bg-dorado-50/60"
                        )}
                      >
                        <td className="px-4 py-2.5 tabular-nums">
                          {formatFecha(c.fecha)}
                          {esVigente && (
                            <span className="ml-2 hidden rounded-full bg-dorado-200 px-1.5 py-0.5 font-heading text-[10px] uppercase tracking-editorial text-bordo-950 sm:inline">
                              Hoy en documentos
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-heading tabular-nums">{formatTasa(c.tasa)}</td>
                        <td className="hidden px-4 py-2.5 text-right text-xs tabular-nums sm:table-cell">
                          {delta === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span
                              className={cn(
                                delta > 0 ? "text-emerald-700" : delta < 0 ? "text-red-700" : "text-muted-foreground"
                              )}
                            >
                              {delta > 0 ? "+" : ""}
                              {new Intl.NumberFormat("es-UY", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(delta)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <FuenteBadge fuente={c.fuente} />
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          )}
        </motion.section>

        {puedeEscribir && (
          <motion.section
            variants={fadeInUp}
            transition={easeSmooth}
            className="rounded-2xl border border-linea bg-white p-4 sm:p-5 lg:sticky lg:top-24"
          >
            <h2 className="mb-1 font-heading text-base text-bordo-950">Cargar cotización manual</h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Para cuando el BCU no publicó y hace falta la cotización igual.
            </p>
            <CotizacionManualForm cotizaciones={cotizaciones} hoy={hoy} />
          </motion.section>
        )}
      </div>
    </motion.div>
  );
}

function Kpi({
  etiqueta,
  valor,
  sub,
  destacado,
  alerta,
}: {
  etiqueta: string;
  valor: number | null;
  sub: string;
  destacado?: boolean;
  alerta?: boolean;
}) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "rounded-2xl border p-4",
        alerta ? "border-amber-200 bg-amber-50/60" : destacado ? "border-bordo-100 bg-bordo-50/40" : "border-linea bg-white"
      )}
    >
      <p className="font-heading text-[11px] uppercase tracking-editorial text-muted-foreground">{etiqueta}</p>
      <p className="mt-1 font-display text-3xl text-bordo-950">
        {valor === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <>
            <span className="mr-1 text-xl text-muted-foreground">$</span>
            <NumeroAnimado valor={valor} decimales={3} />
          </>
        )}
      </p>
      <p className={cn("text-xs", alerta ? "text-amber-800" : "text-muted-foreground")}>{sub}</p>
    </motion.div>
  );
}

function FuenteBadge({ fuente }: { fuente: "bcu" | "manual" }) {
  return fuente === "bcu" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-bordo-50 px-2 py-0.5 font-heading text-[10px] uppercase tracking-editorial text-bordo-800">
      <Landmark className="size-3" />
      BCU
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-dorado-100 px-2 py-0.5 font-heading text-[10px] uppercase tracking-editorial text-dorado-800">
      <PencilLine className="size-3" />
      Manual
    </span>
  );
}
