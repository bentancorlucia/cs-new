"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { formatImporte } from "@/lib/contabilidad/formato";
import type { NodoSaldo } from "@/lib/contabilidad/reportes";
import { springSmooth } from "@/lib/motion";

/** Formato contable: negativos entre paréntesis. */
export function formatContable(n: number, moneda?: string): string {
  if (n < 0) return `(${formatImporte(-n, moneda)})`;
  return formatImporte(n, moneda);
}

/** Una agrupadora con una sola hija del mismo nombre se muestra como una línea. */
export function hijosVisibles(n: NodoSaldo): NodoSaldo[] {
  if (n.hijos.length === 1 && n.hijos[0].hijos.length === 0 && n.hijos[0].nombre === n.nombre) return [];
  return n.hijos;
}

/**
 * Filas de un estado contable (situación / resultados): rubros con importe
 * y, al desplegar, sus cuentas. `expandirTodo` muestra el detalle completo.
 */
export function ArbolFilas({
  nodos,
  expandirTodo,
  destacados,
  profundidad = 0,
  mostrarCodigo = false,
}: {
  nodos: NodoSaldo[];
  expandirTodo: boolean;
  /** ids a resaltar (p. ej. el resultado del ejercicio calculado). */
  destacados?: Set<string>;
  profundidad?: number;
  mostrarCodigo?: boolean;
}) {
  return (
    <ul className={profundidad === 0 ? "divide-y divide-linea/70" : ""}>
      {nodos.map((n, i) => (
        <FilaArbol
          key={n.id}
          nodo={n}
          indice={i}
          expandirTodo={expandirTodo}
          destacados={destacados}
          profundidad={profundidad}
          mostrarCodigo={mostrarCodigo}
        />
      ))}
    </ul>
  );
}

function FilaArbol({
  nodo,
  indice,
  expandirTodo,
  destacados,
  profundidad,
  mostrarCodigo,
}: {
  nodo: NodoSaldo;
  indice: number;
  expandirTodo: boolean;
  destacados?: Set<string>;
  profundidad: number;
  mostrarCodigo: boolean;
}) {
  const hijos = hijosVisibles(nodo);
  const [abiertoLocal, setAbiertoLocal] = useState<boolean | null>(null);
  const abierto = hijos.length > 0 && (abiertoLocal ?? expandirTodo);
  const destacado = destacados?.has(nodo.id) ?? false;
  const esRubro = profundidad === 0;

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...springSmooth, delay: Math.min(indice, 12) * 0.03 }}
    >
      <button
        type="button"
        disabled={hijos.length === 0}
        onClick={() => setAbiertoLocal(!abierto)}
        className={`group flex w-full items-center gap-2 py-2 pr-1 text-left transition-colors ${
          hijos.length > 0 ? "cursor-pointer hover:bg-bordo-50/40" : "cursor-default"
        } ${destacado ? "rounded-lg bg-dorado-50 px-2 -mx-2 my-0.5" : ""}`}
        style={{ paddingLeft: destacado ? undefined : profundidad * 16 }}
      >
        <span className="flex size-4 shrink-0 items-center justify-center print:hidden">
          {hijos.length > 0 && (
            <motion.span animate={{ rotate: abierto ? 90 : 0 }} transition={springSmooth}>
              <ChevronRight className="size-3.5 text-muted-foreground group-hover:text-bordo-700" />
            </motion.span>
          )}
        </span>
        {mostrarCodigo && (
          <span className="w-16 shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">{nodo.codigo}</span>
        )}
        <span
          className={`flex-1 min-w-0 ${
            esRubro ? "font-heading text-sm text-foreground" : "font-body text-[13px] text-foreground/80"
          } ${!nodo.activa ? "italic" : ""}`}
        >
          {nodo.nombre}
          {destacado && (
            <span className="ml-2 rounded-full bg-dorado-200/70 px-1.5 py-px text-[10px] font-heading text-dorado-900 align-middle print:hidden">
              calculado
            </span>
          )}
        </span>
        <span
          className={`shrink-0 tabular-nums ${esRubro ? "font-heading text-sm" : "font-body text-[13px]"} ${
            nodo.saldoFinal < 0 ? "text-rose-700" : esRubro ? "text-foreground" : "text-foreground/80"
          }`}
        >
          {formatContable(nodo.saldoFinal)}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {abierto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={springSmooth}
            className="overflow-hidden"
          >
            <ArbolFilas
              nodos={hijos}
              expandirTodo={expandirTodo}
              destacados={destacados}
              profundidad={profundidad + 1}
              mostrarCodigo={mostrarCodigo}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

/** Filas planas (con sangría) para exportar a Excel. */
export function filasPlanas(
  nodos: NodoSaldo[],
  conDetalle: boolean,
  profundidad = 0
): { nodo: NodoSaldo; profundidad: number }[] {
  const res: { nodo: NodoSaldo; profundidad: number }[] = [];
  for (const n of nodos) {
    res.push({ nodo: n, profundidad });
    const hijos = hijosVisibles(n);
    if (conDetalle && hijos.length > 0) res.push(...filasPlanas(hijos, conDetalle, profundidad + 1));
  }
  return res;
}

export function sangria(profundidad: number): string {
  return "    ".repeat(profundidad);
}
