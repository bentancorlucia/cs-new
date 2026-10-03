"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { leerMisCuotas, type MisCuotas as Datos } from "@/app/(dashboard)/mi-cuenta/actions";
import { ImporteAnimado } from "@/components/compras/ui";
import { EstadoCuenta } from "./estado-cuenta";

/**
 * "Mis cuotas" en Mi cuenta: solo aparece si la cuenta está vinculada a
 * una persona del padrón.
 */
export function MisCuotas() {
  const [datos, setDatos] = useState<Datos | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [verTodo, setVerTodo] = useState(false);

  useEffect(() => {
    let vivo = true;
    leerMisCuotas().then((r) => {
      if (!vivo) return;
      if (r.ok) setDatos(r.data);
      else {
        setError(r.error);
        setDatos(null);
      }
    });
    return () => {
      vivo = false;
    };
  }, []);

  if (datos === undefined) {
    return <div className="h-40 animate-pulse rounded-2xl border border-linea bg-superficie/60" aria-label="Cargando cuotas" />;
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        No pudimos cargar tus cuotas: {error}
      </div>
    );
  }
  if (!datos) return null;

  const vencidas = datos.pendientes.filter((c) => c.vencida);
  const alDia = datos.deudaVencida === 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="overflow-hidden rounded-2xl border border-linea bg-white shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-linea px-4 py-3 sm:px-6">
        <h2 className="flex items-center gap-2 font-heading text-base text-bordo-800">
          <Receipt className="size-4" />
          Mis cuotas
        </h2>
        <span
          className={cn(
            "inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium",
            alDia ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"
          )}
        >
          {alDia ? "Al día" : `${vencidas.length} cuota${vencidas.length === 1 ? "" : "s"} vencida${vencidas.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="grid grid-cols-3 divide-x divide-linea border-b border-linea">
        {[
          { t: "A pagar", v: datos.deudaTotal, c: "text-foreground" },
          { t: "Vencido", v: datos.deudaVencida, c: datos.deudaVencida > 0 ? "text-rose-700" : "text-foreground" },
          { t: "Saldo a favor", v: datos.saldoAFavor, c: datos.saldoAFavor > 0 ? "text-emerald-700" : "text-foreground" },
        ].map((k, i) => (
          <motion.div
            key={k.t}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.06 }}
            className="min-w-0 px-3 py-3 sm:px-6"
          >
            <div className="truncate text-[10px] uppercase tracking-editorial text-muted-foreground">{k.t}</div>
            <ImporteAnimado valor={k.v} moneda="UYU" className={cn("mt-0.5 block truncate font-heading text-sm sm:text-lg", k.c)} />
          </motion.div>
        ))}
      </div>

      {datos.pendientes.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted-foreground sm:px-6">No tenés cuotas pendientes.</p>
      ) : (
        <ul className="divide-y divide-linea">
          {datos.pendientes.map((c, i) => (
            <motion.li
              key={c.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + Math.min(i, 8) * 0.04 }}
              className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6"
            >
              <div className="min-w-0">
                <div className="truncate text-sm">{c.concepto}</div>
                <div className={cn("text-xs", c.vencida ? "text-rose-700" : "text-muted-foreground")}>
                  {c.vencida ? "Venció" : "Vence"} el {formatFecha(c.fecha_vencimiento)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-sm font-medium tabular-nums">{formatImporte(c.saldo, "UYU")}</div>
                {c.saldo < c.importe && (
                  <div className="text-[11px] text-muted-foreground tabular-nums">de {formatImporte(c.importe, "UYU")}</div>
                )}
              </div>
            </motion.li>
          ))}
        </ul>
      )}

      {datos.movimientos.length > 0 && (
        <div className="border-t border-linea">
          <button
            type="button"
            onClick={() => setVerTodo((v) => !v)}
            aria-expanded={verTodo}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-bordo-800 transition-colors hover:bg-bordo-50/40 sm:px-6"
          >
            Ver estado de cuenta completo
            <motion.span animate={{ rotate: verTodo ? 180 : 0 }}>
              <ChevronDown className="size-4" />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {verTodo && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="p-3 sm:p-4">
                  <EstadoCuenta movimientos={datos.movimientos} pendientes={[]} titulo="Movimientos" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
      <p className="border-t border-linea px-4 py-2.5 text-[11px] text-muted-foreground sm:px-6">
        Para pagar o consultar, comunicate con secretaría{datos.numeroSocio ? ` (socio N° ${datos.numeroSocio})` : ""}.
      </p>
    </motion.section>
  );
}
