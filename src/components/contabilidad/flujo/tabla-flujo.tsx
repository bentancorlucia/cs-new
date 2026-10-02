"use client";

import { Fragment, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import type { FilaFlujo, SeccionFlujo } from "@/lib/contabilidad/flujo";
import { easeSmooth, springSmooth } from "@/lib/motion";
import { formatContable } from "@/components/contabilidad/reportes/arbol-filas";

export interface ColumnaTabla {
  clave: string;
  titulo: string;
  /** Segunda línea del encabezado (ej. "parcial", "promedio"). */
  sub?: string;
  /** Resalta la columna (mes en curso). */
  destacada?: boolean;
}

export type FilaTabla =
  | {
      tipo: "seccion";
      id: string;
      titulo: string;
      seccion: SeccionFlujo;
      tono: "ingreso" | "egreso";
      /** Texto si la sección no tiene grupos. */
      vacio: string;
    }
  | {
      tipo: "valor";
      id: string;
      titulo: string;
      valores: number[];
      total: number | null;
      estilo: "saldo" | "total" | "normal" | "informativo";
      /** Pinta en rojo las celdas negativas con fondo (saldos proyectados). */
      alertaNegativo?: boolean;
      ayuda?: string;
    }
  | { tipo: "separador"; id: string };

// La columna fija necesita fondos opacos (si no, se ve lo que scrollea debajo).
const COLOR_TONO = {
  ingreso: { punto: "bg-emerald-500", texto: "text-emerald-800", fondo: "bg-emerald-50" },
  egreso: { punto: "bg-rose-500", texto: "text-rose-800", fondo: "bg-rose-50" },
};

const CELDA = "px-3 py-2 text-right tabular-nums whitespace-nowrap";
const PRIMERA =
  "sticky left-0 z-10 w-40 min-w-40 max-w-40 sm:w-72 sm:min-w-72 sm:max-w-72 border-r border-linea/70 px-3 py-2 text-left";

/**
 * Estado con columnas por mes (flujo real o proyección). La primera columna
 * queda fija y la tabla scrollea dentro de su contenedor.
 */
export function TablaFlujo({
  columnas,
  filas,
  conTotal = true,
  verCuentas,
}: {
  columnas: ColumnaTabla[];
  filas: FilaTabla[];
  conTotal?: boolean;
  /** Muestra todas las cuentas abiertas. */
  verCuentas: boolean;
}) {
  const [abiertos, setAbiertos] = useState<Map<string, boolean>>(new Map());
  const alternar = (k: string, actual: boolean) =>
    setAbiertos((prev) => {
      const m = new Map(prev);
      m.set(k, !actual);
      return m;
    });
  const nCols = columnas.length + (conTotal ? 1 : 0) + 1;

  return (
    <div className="reporte-tarjeta overflow-hidden rounded-2xl border border-linea bg-white shadow-card">
      <div className="reporte-scroll overflow-x-auto overscroll-x-contain">
        <table className="reporte-tabla w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-editorial text-muted-foreground font-heading">
              <th className={`${PRIMERA} bg-superficie py-2.5`}>Concepto</th>
              {columnas.map((c) => (
                <th
                  key={c.clave}
                  className={`min-w-28 px-3 py-2.5 text-right font-heading ${c.destacada ? "bg-dorado-50" : "bg-superficie"}`}
                >
                  <div className="whitespace-nowrap">{c.titulo}</div>
                  {c.sub && <div className="mt-0.5 normal-case tracking-normal text-[10px] font-body text-muted-foreground">{c.sub}</div>}
                </th>
              ))}
              {conTotal && <th className="min-w-32 bg-bordo-50 px-3 py-2.5 text-right text-bordo-900">Total</th>}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => {
              if (f.tipo === "separador") {
                return (
                  <tr key={f.id} aria-hidden>
                    <td colSpan={nCols} className="h-3 border-b border-dashed border-linea p-0" />
                  </tr>
                );
              }
              if (f.tipo === "valor") return <FilaValor key={f.id} fila={f} indice={i} conTotal={conTotal} columnas={columnas} />;
              return (
                <FilasSeccion
                  key={f.id}
                  fila={f}
                  indice={i}
                  columnas={columnas}
                  conTotal={conTotal}
                  nCols={nCols}
                  verCuentas={verCuentas}
                  abiertos={abiertos}
                  onAlternar={alternar}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilaValor({
  fila,
  indice,
  columnas,
  conTotal,
}: {
  fila: Extract<FilaTabla, { tipo: "valor" }>;
  indice: number;
  columnas: ColumnaTabla[];
  conTotal: boolean;
}) {
  const saldo = fila.estilo === "saldo";
  const total = fila.estilo === "total";
  const info = fila.estilo === "informativo";
  const fondo = saldo ? "bg-bordo-50" : total ? "bg-superficie" : "bg-white";
  return (
    <motion.tr
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...easeSmooth, delay: Math.min(indice, 10) * 0.04 }}
      className={saldo || total ? "font-heading" : ""}
    >
      <td className={`${PRIMERA} border-t border-linea ${fondo} ${info ? "italic text-muted-foreground" : "text-foreground"}`}>
        <div className={saldo ? "text-bordo-900" : ""}>{fila.titulo}</div>
        {fila.ayuda && <div className="mt-0.5 text-[10px] font-body not-italic text-muted-foreground leading-snug whitespace-normal">{fila.ayuda}</div>}
      </td>
      {fila.valores.map((v, i) => {
        const negativo = v < 0;
        const alerta = fila.alertaNegativo && negativo;
        return (
          <td
            key={columnas[i]?.clave ?? i}
            className={`${CELDA} border-t border-linea ${
              alerta
                ? "bg-rose-100 text-rose-800"
                : columnas[i]?.destacada && (fila.estilo === "normal" || info)
                  ? "bg-dorado-50/50"
                  : fondo
            } ${negativo ? "text-rose-700" : info ? "text-muted-foreground" : ""} ${info ? "italic" : ""}`}
          >
            {info && v === 0 ? "—" : formatContable(v)}
          </td>
        );
      })}
      {conTotal && (
        <td className={`${CELDA} border-t border-linea bg-bordo-50/60 ${fila.total !== null && fila.total < 0 ? "text-rose-700" : "text-bordo-900"}`}>
          {fila.total === null ? "" : formatContable(fila.total)}
        </td>
      )}
    </motion.tr>
  );
}

function FilasSeccion({
  fila,
  indice,
  columnas,
  conTotal,
  nCols,
  verCuentas,
  abiertos,
  onAlternar,
}: {
  fila: Extract<FilaTabla, { tipo: "seccion" }>;
  indice: number;
  columnas: ColumnaTabla[];
  conTotal: boolean;
  nCols: number;
  verCuentas: boolean;
  abiertos: Map<string, boolean>;
  onAlternar: (k: string, actual: boolean) => void;
}) {
  const color = COLOR_TONO[fila.tono];
  const { seccion } = fila;
  return (
    <>
      <motion.tr
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...easeSmooth, delay: Math.min(indice, 10) * 0.04 }}
        className="font-heading"
      >
        <td className={`${PRIMERA} border-t border-linea ${color.fondo} ${color.texto}`}>
          <span className="inline-flex items-center gap-2">
            <span className={`size-2 rounded-full ${color.punto}`} />
            {fila.titulo}
          </span>
        </td>
        {seccion.porMes.map((v, i) => (
          <td key={columnas[i]?.clave ?? i} className={`${CELDA} border-t border-linea ${color.fondo} ${color.texto}`}>
            {formatContable(v)}
          </td>
        ))}
        {conTotal && <td className={`${CELDA} border-t border-linea bg-bordo-50/60 ${color.texto}`}>{formatContable(seccion.total)}</td>}
      </motion.tr>
      {seccion.grupos.length === 0 && (
        <tr>
          <td colSpan={nCols} className="border-t border-linea/60 px-3 py-3 text-xs text-muted-foreground">
            <span className="sticky left-3">{fila.vacio}</span>
          </td>
        </tr>
      )}
      {seccion.grupos.map((g, gi) => {
        const k = `${fila.id}:${g.id}`;
        const tieneHijos = g.hijos.length > 0;
        const abierto = tieneHijos && (abiertos.get(k) ?? verCuentas);
        return (
          <Fragment key={k}>
            <motion.tr
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...springSmooth, delay: Math.min(gi, 12) * 0.025 }}
              onClick={() => tieneHijos && onAlternar(k, abierto)}
              className={`group ${tieneHijos ? "cursor-pointer" : ""}`}
            >
              <td className={`${PRIMERA} border-t border-linea/60 bg-white transition-colors group-hover:bg-bordo-50`}>
                <div className="flex items-start gap-1.5 pl-2">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center print:hidden">
                    {tieneHijos && (
                      <motion.span animate={{ rotate: abierto ? 90 : 0 }} transition={springSmooth}>
                        <ChevronRight className="size-3.5 text-muted-foreground group-hover:text-bordo-700" />
                      </motion.span>
                    )}
                  </span>
                  <NombreGrupo fila={g} />
                </div>
              </td>
              {g.porMes.map((v, i) => (
                <td
                  key={columnas[i]?.clave ?? i}
                  className={`${CELDA} border-t border-linea/60 transition-colors group-hover:bg-bordo-50/40 ${
                    v < 0 ? "text-rose-700" : v === 0 ? "text-muted-foreground/50" : "text-foreground"
                  } ${columnas[i]?.destacada ? "bg-dorado-50/40" : ""}`}
                >
                  {v === 0 ? "—" : formatContable(v)}
                </td>
              ))}
              {conTotal && (
                <td className={`${CELDA} border-t border-linea/60 bg-bordo-50/40 font-heading ${g.total < 0 ? "text-rose-700" : "text-foreground"}`}>
                  {formatContable(g.total)}
                </td>
              )}
            </motion.tr>
            <AnimatePresence initial={false}>
              {abierto &&
                g.hijos.map((h, hi) => (
                  <motion.tr
                    key={`${k}:${h.id}`}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ ...easeSmooth, duration: 0.25, delay: Math.min(hi, 10) * 0.02 }}
                    className="text-[12px] text-foreground/75"
                  >
                    <td className={`${PRIMERA} bg-white py-1.5`}>
                      <div className="flex gap-2 pl-8">
                        {h.codigo && <span className="shrink-0 font-mono text-[10px] text-muted-foreground pt-px">{h.codigo}</span>}
                        <span className="min-w-0 leading-snug sm:truncate" title={h.nombre}>
                          {h.nombre}
                        </span>
                      </div>
                    </td>
                    {h.porMes.map((v, i) => (
                      <td
                        key={columnas[i]?.clave ?? i}
                        className={`${CELDA} py-1.5 ${v < 0 ? "text-rose-700" : v === 0 ? "text-muted-foreground/40" : ""} ${
                          columnas[i]?.destacada ? "bg-dorado-50/40" : ""
                        }`}
                      >
                        {v === 0 ? "—" : formatContable(v)}
                      </td>
                    ))}
                    {conTotal && (
                      <td className={`${CELDA} py-1.5 bg-bordo-50/30 ${h.total < 0 ? "text-rose-700" : ""}`}>{formatContable(h.total)}</td>
                    )}
                  </motion.tr>
                ))}
            </AnimatePresence>
          </Fragment>
        );
      })}
    </>
  );
}

function NombreGrupo({ fila }: { fila: FilaFlujo }) {
  return (
    <span className="min-w-0">
      <span className="block text-[13px] leading-snug text-foreground sm:truncate" title={fila.nombre}>
        {fila.codigo && !fila.etiqueta && (
          <span className="mr-1.5 font-mono text-[10px] text-muted-foreground">{fila.codigo}</span>
        )}
        {fila.nombre}
      </span>
      {fila.etiqueta && (
        <span className="mt-0.5 inline-block rounded border border-linea px-1 py-px text-[9px] uppercase tracking-editorial font-heading text-muted-foreground">
          {fila.etiqueta}
        </span>
      )}
    </span>
  );
}
