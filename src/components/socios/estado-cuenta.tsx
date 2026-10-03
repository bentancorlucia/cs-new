"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import type { CuotaPendiente, MovimientoCuenta } from "@/lib/socios/padron";
import { Panel, Vacio } from "@/components/compras/ui";

/**
 * Estado de cuenta de una persona (socios.estado_cuenta) con sus cuotas
 * pendientes. Lo usan la ficha de secretaría y Mi cuenta.
 */
const ETIQUETA_TIPO_MOV: Record<string, { texto: string; clase: string }> = {
  cuota: { texto: "Cuota", clase: "bg-superficie text-foreground" },
  cobro: { texto: "Cobro", clase: "bg-emerald-50 text-emerald-700" },
  credito: { texto: "N. crédito", clase: "bg-sky-50 text-sky-800" },
};

export function EstadoCuenta({
  movimientos,
  pendientes,
  titulo = "Estado de cuenta",
}: {
  movimientos: MovimientoCuenta[];
  pendientes: CuotaPendiente[];
  titulo?: string;
}) {
  const [todos, setTodos] = useState(false);
  const visibles = useMemo(() => {
    const desc = [...movimientos].reverse();
    return todos ? desc : desc.slice(0, 12);
  }, [movimientos, todos]);
  const saldo = movimientos.at(-1)?.saldo ?? 0;

  return (
    <Panel
      titulo={titulo}
      icono={FileText}
      delay={0.15}
      accion={
        movimientos.length > 0 ? (
          <span className={cn("text-xs font-medium tabular-nums", saldo > 0 ? "text-rose-700" : "text-emerald-700")}>
            Saldo {saldo > 0 ? "deudor" : saldo < 0 ? "a favor" : ""} {formatImporte(Math.abs(saldo), "UYU")}
          </span>
        ) : undefined
      }
    >
      {pendientes.length > 0 && (
        <div className="border-b border-linea bg-superficie/40 px-4 py-3">
          <div className="mb-2 text-[10px] uppercase tracking-editorial text-muted-foreground">Cuotas pendientes</div>
          <ul className="space-y-1.5">
            {pendientes.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate">{c.concepto}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={cn("tabular-nums", c.vencida ? "text-rose-700" : "text-muted-foreground")}>
                    {c.vencida ? "venció" : "vence"} {formatFecha(c.fecha_vencimiento)}
                  </span>
                  <span className="w-24 text-right font-medium tabular-nums">{formatImporte(c.saldo, "UYU")}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {movimientos.length === 0 ? (
        <div className="p-4">
          <Vacio icono={FileText} titulo="Sin movimientos" texto="Todavía no se emitieron cuotas ni se registraron cobros." />
        </div>
      ) : (
        <>
          <div className="hidden sm:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-linea text-left text-[10px] uppercase tracking-editorial text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Fecha</th>
                  <th className="px-2 py-2 font-medium">Concepto</th>
                  <th className="px-2 py-2 text-right font-medium">Cargo</th>
                  <th className="px-2 py-2 text-right font-medium">Pago</th>
                  <th className="px-4 py-2 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {visibles.map((m, i) => (
                    <motion.tr
                      key={`${m.tipo}-${m.documento_id}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i, 12) * 0.02 }}
                      className="border-b border-linea/60 last:border-0"
                    >
                      <td className="px-4 py-2 whitespace-nowrap text-muted-foreground tabular-nums">{formatFecha(m.fecha)}</td>
                      <td className="px-2 py-2">
                        <span
                          className={cn(
                            "mr-1.5 inline-flex h-4 items-center rounded px-1 text-[10px] font-medium",
                            ETIQUETA_TIPO_MOV[m.tipo]?.clase
                          )}
                        >
                          {ETIQUETA_TIPO_MOV[m.tipo]?.texto ?? m.tipo}
                        </span>
                        {m.concepto}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{m.cargo ? formatImporte(m.cargo) : ""}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-emerald-700">{m.abono ? formatImporte(m.abono) : ""}</td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">{formatImporte(m.saldo)}</td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-linea sm:hidden">
            {visibles.map((m) => (
              <li key={`${m.tipo}-${m.documento_id}`} className="flex items-start justify-between gap-3 px-4 py-2.5 text-xs">
                <div className="min-w-0">
                  <div className="truncate text-foreground">{m.concepto}</div>
                  <div className="text-muted-foreground tabular-nums">
                    {formatFecha(m.fecha)} · {ETIQUETA_TIPO_MOV[m.tipo]?.texto ?? m.tipo}
                  </div>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <div className={m.abono ? "text-emerald-700" : ""}>
                    {m.abono ? `− ${formatImporte(m.abono)}` : formatImporte(m.cargo)}
                  </div>
                  <div className="text-muted-foreground">Saldo {formatImporte(m.saldo)}</div>
                </div>
              </li>
            ))}
          </ul>
          {movimientos.length > 12 && (
            <button
              type="button"
              onClick={() => setTodos((v) => !v)}
              className="w-full border-t border-linea px-4 py-2.5 text-xs font-medium text-bordo-800 hover:bg-bordo-50/40"
            >
              {todos ? "Ver solo los últimos" : `Ver los ${movimientos.length} movimientos`}
            </button>
          )}
        </>
      )}
    </Panel>
  );
}
