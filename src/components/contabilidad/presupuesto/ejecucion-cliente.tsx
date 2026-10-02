"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Loader2, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ImporteAnimado } from "@/components/contabilidad/reportes/importe-animado";
import { easeDramatic, easeSmooth, fadeInUp, springSmooth, staggerContainer } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { formatImporte } from "@/lib/contabilidad/formato";
import type { EjercicioResumen } from "@/lib/contabilidad/reportes";
import {
  MESES_CORTOS,
  NOMBRE_ESTADO_PRESUPUESTO,
  desvioFavorable,
  nombreRangoMeses,
  porcentajeEjecucion,
  type ClaseResultado,
  type Comparacion,
  type EstadoPresupuesto,
  type InformeEjecucion,
  type NodoEjecucion,
} from "@/lib/contabilidad/presupuesto";
import { EstadoBadge } from "./estado-badge";
import { GraficoEjecucion } from "./grafico-ejecucion";
import { SelectorEjercicio } from "./selector-ejercicio";

const claseControl =
  "h-9 rounded-lg border border-linea bg-white px-2 text-sm text-foreground outline-none transition-all focus:border-bordo-700 focus:ring-3 focus:ring-bordo-800/10";

/** Formato contable: negativos entre paréntesis. */
function contable(n: number): string {
  return n < 0 ? `(${formatImporte(-n)})` : formatImporte(n);
}

function formatPorcentaje(p: number | null): string {
  if (p === null) return "—";
  return `${p.toLocaleString("es-UY", { maximumFractionDigits: p >= 100 || p <= -100 ? 0 : 1 })}%`;
}

function tonoDesvio(clase: ClaseResultado | "resultado", desvio: number): string {
  const f = desvioFavorable(clase, desvio);
  return f === null ? "text-muted-foreground" : f ? "text-emerald-700" : "text-rose-700";
}

export function EjecucionCliente({
  ejercicios,
  informe,
  mesActual,
}: {
  ejercicios: EjercicioResumen[];
  informe: InformeEjecucion;
  mesActual: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendiente, startTransition] = useTransition();
  const [acumulado, setAcumulado] = useState(false);
  const { ejercicio, presupuesto, versiones, mesDesde, mesHasta, porCentro, ejecucion, serie } = informe;

  const navegar = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("ejercicio", ejercicio.id);
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    startTransition(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }));
  };
  const rango = (d: number, h: number) => navegar({ desde: String(d), hasta: String(h) });

  const atajos: { etiqueta: string; desde: number; hasta: number }[] = [
    ...(mesActual
      ? [
          { etiqueta: "Acumulado al mes", desde: 1, hasta: mesActual },
          { etiqueta: "Mes actual", desde: mesActual, hasta: mesActual },
        ]
      : []),
    { etiqueta: "Año completo", desde: 1, hasta: 12 },
  ];

  return (
    <div className="space-y-5">
      {/* Controles */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springSmooth}
        className="space-y-3 rounded-2xl border border-linea bg-white p-3 shadow-card sm:p-4"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SelectorEjercicio ejercicios={ejercicios} ejercicioId={ejercicio.id} limpiar={["presupuesto", "desde", "hasta"]} />
          <div className="flex min-w-0 items-center gap-2">
            <label htmlFor="version-ejecucion" className="shrink-0 text-[10px] font-heading uppercase tracking-editorial text-muted-foreground">
              Versión
            </label>
            <select
              id="version-ejecucion"
              value={presupuesto.id}
              onChange={(e) => navegar({ presupuesto: e.target.value })}
              className={cn(claseControl, "min-w-0 flex-1 lg:w-80 lg:flex-none")}
            >
              {versiones.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.version} · {v.nombre} —{" "}
                  {v.estado === "aprobado" ? "vigente" : NOMBRE_ESTADO_PRESUPUESTO[v.estado as EstadoPresupuesto].toLowerCase()}
                </option>
              ))}
            </select>
            <AnimatePresence>
              {pendiente && (
                <motion.span initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}>
                  <Loader2 className="size-4 animate-spin text-bordo-700" />
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-linea/70 pt-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs">
              <select
                aria-label="Desde el mes"
                value={mesDesde}
                onChange={(e) => {
                  const d = Number(e.target.value);
                  rango(d, Math.max(d, mesHasta));
                }}
                className={claseControl}
              >
                {MESES_CORTOS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
              <span className="text-muted-foreground">→</span>
              <select
                aria-label="Hasta el mes"
                value={mesHasta}
                onChange={(e) => {
                  const h = Number(e.target.value);
                  rango(Math.min(mesDesde, h), h);
                }}
                className={claseControl}
              >
                {MESES_CORTOS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {atajos.map((a) => {
                const activo = a.desde === mesDesde && a.hasta === mesHasta;
                return (
                  <motion.button
                    key={a.etiqueta}
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={() => !activo && rango(a.desde, a.hasta)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-heading transition-colors",
                      activo
                        ? "border-bordo-800 bg-bordo-50 text-bordo-800"
                        : "border-linea text-muted-foreground hover:border-bordo-200 hover:text-foreground"
                    )}
                  >
                    {a.etiqueta}
                  </motion.button>
                );
              })}
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={porCentro} onCheckedChange={(v) => navegar({ centros: v ? "1" : null })} />
            Abrir por centro de costo
          </label>
        </div>
      </motion.div>

      <motion.div animate={{ opacity: pendiente ? 0.55 : 1 }} transition={{ duration: 0.2 }} className="space-y-5">
        {/* Encabezado de la versión */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Link href={`/contabilidad/presupuesto/${presupuesto.id}`} className="font-heading text-sm text-bordo-900 hover:text-bordo-700">
            {presupuesto.nombre}
          </Link>
          <EstadoBadge estado={presupuesto.estado} />
          <span>·</span>
          <span className="font-heading">{nombreRangoMeses(mesDesde, mesHasta)}</span>
          <span>
            ({MESES_CORTOS[mesDesde - 1]} a {MESES_CORTOS[mesHasta - 1]} {ejercicio.fecha_inicio.slice(0, 4)})
          </span>
        </div>

        {/* KPIs */}
        <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid gap-3 sm:grid-cols-3">
          <Kpi titulo="Ingresos" clase="ingreso" c={ejecucion.totalIngresos} />
          <Kpi titulo="Egresos" clase="egreso" c={ejecucion.totalEgresos} />
          <Kpi titulo="Resultado" clase="resultado" c={ejecucion.resultado} destacado />
        </motion.div>

        {/* Gráfico */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...easeSmooth, delay: 0.1 }}
          className="rounded-2xl border border-linea bg-white p-4 sm:p-5"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-heading text-base text-bordo-900">Resultado {acumulado ? "acumulado" : "mes a mes"}</h2>
              <p className="text-xs text-muted-foreground">Ingresos menos egresos, presupuestado contra ejecutado.</p>
            </div>
            <div className="flex rounded-full bg-superficie p-1 text-xs">
              {[false, true].map((a) => (
                <button
                  key={String(a)}
                  type="button"
                  onClick={() => setAcumulado(a)}
                  aria-pressed={acumulado === a}
                  className={cn(
                    "relative rounded-full px-3 py-1 font-heading transition-colors",
                    acumulado === a ? "text-white" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {acumulado === a && (
                    <motion.span layoutId="modo-grafico" className="absolute inset-0 rounded-full bg-bordo-800" transition={springSmooth} />
                  )}
                  <span className="relative">{a ? "Acumulado" : "Mensual"}</span>
                </button>
              ))}
            </div>
          </div>
          <GraficoEjecucion key={acumulado ? "a" : "m"} serie={serie} acumulado={acumulado} />
        </motion.section>

        {/* Tabla */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...easeSmooth, delay: 0.18 }}
          className="overflow-hidden rounded-2xl border border-linea bg-white"
        >
          <div className="overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[42rem] border-separate border-spacing-0 text-xs sm:text-sm">
              <thead>
                <tr className="text-[10px] font-heading uppercase tracking-editorial text-muted-foreground">
                  <th className="sticky left-0 z-10 border-b border-linea bg-white px-3 py-2.5 text-left">Cuenta</th>
                  <th className="border-b border-linea px-3 py-2.5 text-right">Presupuestado</th>
                  <th className="border-b border-linea px-3 py-2.5 text-right">Ejecutado</th>
                  <th className="border-b border-linea px-3 py-2.5 text-right">Desvío</th>
                  <th className="w-36 border-b border-linea px-3 py-2.5 text-right">% ejecutado</th>
                </tr>
              </thead>
              <tbody>
                <Seccion titulo="Ingresos" clase="ingreso" nodos={ejecucion.ingresos} total={ejecucion.totalIngresos} />
                <Seccion titulo="Egresos" clase="egreso" nodos={ejecucion.egresos} total={ejecucion.totalEgresos} />
              </tbody>
              <tfoot>
                <tr className="bg-bordo-800 font-heading text-white">
                  <td className="sticky left-0 z-10 bg-bordo-800 px-3 py-3 text-[11px] uppercase tracking-editorial">
                    {ejecucion.resultado.ejecutado >= 0 ? "Superávit" : "Déficit"} (ingresos − egresos)
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{contable(ejecucion.resultado.presupuestado)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{contable(ejecucion.resultado.ejecutado)}</td>
                  <td
                    className={cn(
                      "px-3 py-3 text-right tabular-nums",
                      desvioFavorable("resultado", ejecucion.resultado.desvio) === false && "text-rose-200",
                      desvioFavorable("resultado", ejecucion.resultado.desvio) === true && "text-emerald-200"
                    )}
                  >
                    {contable(ejecucion.resultado.desvio)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatPorcentaje(porcentajeEjecucion(ejecucion.resultado))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </motion.section>

        <p className="text-[11px] text-muted-foreground">
          Ejecutado: asientos confirmados del período, sin apertura, cierre ni refundición. Desvío = ejecutado − presupuestado: en
          ingresos, positivo es a favor; en egresos, negativo es a favor. Las cuentas con movimientos pero sin presupuesto aparecen
          con presupuestado 0.
        </p>
      </motion.div>
    </div>
  );
}

function Kpi({
  titulo,
  clase,
  c,
  destacado,
}: {
  titulo: string;
  clase: ClaseResultado | "resultado";
  c: Comparacion;
  destacado?: boolean;
}) {
  const pct = porcentajeEjecucion(c);
  const favorable = desvioFavorable(clase, c.desvio);
  const Icono = favorable === null ? Minus : (clase === "egreso" ? c.desvio < 0 : c.desvio > 0) ? TrendingUp : TrendingDown;
  const ancho = pct === null ? 0 : Math.max(0, Math.min(pct, 100));
  return (
    <motion.div
      variants={fadeInUp}
      transition={easeSmooth}
      whileHover={{ y: -2 }}
      className={cn("rounded-2xl border p-4", destacado ? "border-bordo-200 bg-bordo-50/40" : "border-linea bg-white")}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-heading uppercase tracking-editorial text-muted-foreground">{titulo}</span>
        <span className={cn("font-heading text-xs tabular-nums", tonoDesvio(clase, c.desvio))}>{formatPorcentaje(pct)}</span>
      </div>
      <div className="mt-1 font-heading text-xl text-foreground sm:text-2xl">
        <ImporteAnimado valor={c.ejecutado} />
      </div>
      <div className="text-[11px] text-muted-foreground">
        de <span className="tabular-nums">{contable(c.presupuestado)}</span> presupuestado
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-superficie">
        <motion.div
          className={cn(
            "h-full origin-left rounded-full",
            favorable === false ? "bg-rose-500" : favorable === true ? "bg-emerald-500" : "bg-bordo-700"
          )}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: ancho / 100 }}
          transition={easeDramatic}
        />
      </div>
      <div className={cn("mt-2 flex items-center gap-1 text-xs", tonoDesvio(clase, c.desvio))}>
        <Icono className="size-3.5" />
        <span className="tabular-nums">{contable(c.desvio)}</span>
        <span className="text-muted-foreground">
          {favorable === null ? "sin desvío" : favorable ? "· a favor" : "· en contra"}
        </span>
      </div>
    </motion.div>
  );
}

function Seccion({
  titulo,
  clase,
  nodos,
  total,
}: {
  titulo: string;
  clase: ClaseResultado;
  nodos: NodoEjecucion[];
  total: Comparacion;
}) {
  const [colapsados, setColapsados] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setColapsados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <tr>
        <td
          colSpan={5}
          className={cn(
            "border-b border-linea px-3 pb-1.5 pt-4 font-heading text-[11px] uppercase tracking-editorial",
            clase === "ingreso" ? "text-emerald-800" : "text-rose-800"
          )}
        >
          <span className="sticky left-3 inline-flex items-center gap-2">
            <span className={cn("size-2 rounded-full", clase === "ingreso" ? "bg-emerald-500" : "bg-rose-500")} />
            {titulo}
          </span>
        </td>
      </tr>
      {nodos.length === 0 && (
        <tr>
          <td colSpan={5} className="border-b border-linea/60 px-3 py-3 text-xs text-muted-foreground">
            Sin importes presupuestados ni ejecutados en el período.
          </td>
        </tr>
      )}
      {nodos.map((n) => (
        <Rama key={n.cuenta.id} nodo={n} clase={clase} profundidad={0} colapsados={colapsados} onToggle={toggle} />
      ))}
      <tr className="bg-[#f9f7f3] font-heading">
        <td className="sticky left-0 z-10 border-b border-linea bg-[#f9f7f3] px-3 py-2 text-[11px] uppercase tracking-editorial">
          Total {titulo.toLowerCase()}
        </td>
        <Importes c={total} clase={clase} />
      </tr>
    </>
  );
}

function Rama({
  nodo,
  clase,
  profundidad,
  colapsados,
  onToggle,
}: {
  nodo: NodoEjecucion;
  clase: ClaseResultado;
  profundidad: number;
  colapsados: Set<string>;
  onToggle: (id: string) => void;
}) {
  const grupo = nodo.hijos.length > 0;
  const abierto = !colapsados.has(nodo.cuenta.id);
  const sinPresupuesto = !grupo && nodo.presupuestado === 0;
  return (
    <>
      <motion.tr
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className={cn("group/fila", grupo ? "bg-superficie/40 font-heading text-foreground/85" : "text-foreground")}
      >
        <td
          className={cn(
            "sticky left-0 z-10 max-w-[13rem] border-b border-linea/60 px-3 py-2 sm:max-w-none",
            grupo ? "bg-[#fbfaf7]" : "bg-white group-hover/fila:bg-[#fcfbf9]"
          )}
        >
          <div className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: profundidad * 14 }}>
            {grupo ? (
              <button
                type="button"
                onClick={() => onToggle(nodo.cuenta.id)}
                aria-expanded={abierto}
                className="flex min-w-0 items-center gap-1.5 text-left"
              >
                <motion.span animate={{ rotate: abierto ? 90 : 0 }} transition={springSmooth} className="shrink-0">
                  <ChevronRight className="size-3.5 text-bordo-700" />
                </motion.span>
                <span className="hidden shrink-0 font-mono text-[10px] text-muted-foreground sm:inline">{nodo.cuenta.codigo}</span>
                <span className="truncate">{nodo.cuenta.nombre}</span>
              </button>
            ) : (
              <>
                <span className="hidden shrink-0 pl-5 font-mono text-[10px] text-muted-foreground sm:inline">{nodo.cuenta.codigo}</span>
                <span className="truncate pl-5 sm:pl-0" title={`${nodo.cuenta.codigo} ${nodo.cuenta.nombre}`}>
                  {nodo.cuenta.nombre}
                </span>
                {sinPresupuesto && (
                  <>
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-amber-400 sm:hidden"
                      title="Sin presupuesto"
                      aria-label="Sin presupuesto"
                    />
                    <span className="hidden shrink-0 rounded-full bg-amber-50 px-1.5 text-[9px] font-heading uppercase text-amber-800 sm:inline">
                      sin presupuesto
                    </span>
                  </>
                )}
              </>
            )}
          </div>
        </td>
        <Importes c={nodo} clase={clase} />
      </motion.tr>
      {nodo.centros.map((c) => (
        <motion.tr
          key={c.centro?.id ?? "sin"}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25 }}
          className="text-[11px] text-muted-foreground"
        >
          <td className="sticky left-0 z-10 max-w-[13rem] border-b border-linea/40 bg-white px-3 py-1.5 sm:max-w-none">
            <span className="block truncate text-bordo-700" style={{ paddingLeft: profundidad * 14 + 28 }}>
              {c.centro?.nombre ?? "Sin centro de costo"}
            </span>
          </td>
          <Importes c={c} clase={clase} chico />
        </motion.tr>
      ))}
      <AnimatePresence initial={false}>
        {grupo &&
          abierto &&
          nodo.hijos.map((h) => (
            <Fragment key={h.cuenta.id}>
              <Rama nodo={h} clase={clase} profundidad={profundidad + 1} colapsados={colapsados} onToggle={onToggle} />
            </Fragment>
          ))}
      </AnimatePresence>
    </>
  );
}

function Importes({ c, clase, chico }: { c: Comparacion; clase: ClaseResultado; chico?: boolean }) {
  const pct = porcentajeEjecucion(c);
  const favorable = desvioFavorable(clase, c.desvio);
  const borde = chico ? "border-linea/40" : "border-linea/60";
  return (
    <>
      <td className={cn("border-b px-3 py-2 text-right tabular-nums", borde)}>{contable(c.presupuestado)}</td>
      <td className={cn("border-b px-3 py-2 text-right tabular-nums", borde)}>{contable(c.ejecutado)}</td>
      <td className={cn("border-b px-3 py-2 text-right tabular-nums", borde, tonoDesvio(clase, c.desvio))}>{contable(c.desvio)}</td>
      <td className={cn("border-b px-3 py-2", borde)}>
        <div className="flex items-center justify-end gap-2">
          {!chico && (
            <div className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-superficie sm:block">
              <motion.div
                className={cn(
                  "h-full origin-left rounded-full",
                  favorable === false ? "bg-rose-400" : favorable === true ? "bg-emerald-400" : "bg-bordo-300"
                )}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: pct === null ? 0 : Math.max(0, Math.min(pct, 100)) / 100 }}
                transition={easeDramatic}
              />
            </div>
          )}
          <span className="w-12 text-right tabular-nums">{formatPorcentaje(pct)}</span>
        </div>
      </td>
    </>
  );
}
