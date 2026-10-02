"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, PackagePlus, Plus, Search, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth } from "@/lib/motion";
import { NOMBRE_ESTADO_OC } from "@/lib/comercial/compras-esquemas";
import type { OrdenCompraListado } from "@/lib/comercial/compras";
import { BadgeEstadoOrden, BadgeMoneda, BotonLink, EncabezadoPagina, Filtros, Vacio, claseControl } from "./ui";

type Filtro = "abiertas" | "todas" | keyof typeof NOMBRE_ESTADO_OC;

export function OrdenesLista({ ordenes, puedeOperar }: { ordenes: OrdenCompraListado[]; puedeOperar: boolean }) {
  const [filtro, setFiltro] = useState<Filtro>("abiertas");
  const [texto, setTexto] = useState("");
  const q = useDeferredValue(texto.trim().toLowerCase());

  const abiertas = (o: OrdenCompraListado) => ["borrador", "aprobada", "recibida_parcial"].includes(o.estado);
  const lista = useMemo(
    () =>
      ordenes.filter((o) => {
        if (filtro === "abiertas" ? !abiertas(o) : filtro !== "todas" && o.estado !== filtro) return false;
        return !q || `${o.numero} ${o.proveedor} ${o.notas ?? ""}`.toLowerCase().includes(q);
      }),
    [ordenes, filtro, q]
  );
  const cuenta = (e: string) => ordenes.filter((o) => o.estado === e).length;

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Proveedores y compras"
        titulo="Órdenes de compra"
        descripcion="Pedidos de mercadería a proveedores: borrador → aprobada → recibida. La recepción da entrada al stock y genera el asiento."
      >
        {puedeOperar && (
          <>
            <BotonLink href="/admin/compras/recepciones/nueva" variante="secundario">
              <PackagePlus className="size-4" />
              Recibir sin orden
            </BotonLink>
            <BotonLink href="/admin/compras/ordenes/nueva">
              <Plus className="size-4" />
              Nueva orden
            </BotonLink>
          </>
        )}
      </EncabezadoPagina>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...easeSmooth, delay: 0.05 }}
        className="space-y-3 rounded-2xl border border-linea bg-white p-3"
      >
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscá por número o proveedor…"
            className={cn(claseControl, "pl-9")}
          />
        </div>
        <Filtros<Filtro>
          id="ordenes"
          valor={filtro}
          onChange={setFiltro}
          opciones={[
            { valor: "abiertas", etiqueta: "Abiertas", cantidad: ordenes.filter(abiertas).length },
            { valor: "borrador", etiqueta: "Borradores", cantidad: cuenta("borrador") },
            { valor: "aprobada", etiqueta: "Aprobadas", cantidad: cuenta("aprobada") },
            { valor: "recibida_parcial", etiqueta: "Recibidas en parte", cantidad: cuenta("recibida_parcial") },
            { valor: "recibida", etiqueta: "Recibidas", cantidad: cuenta("recibida") },
            { valor: "cancelada", etiqueta: "Canceladas", cantidad: cuenta("cancelada") },
            { valor: "todas", etiqueta: "Todas", cantidad: ordenes.length },
          ]}
        />
      </motion.div>

      {lista.length === 0 ? (
        <Vacio
          icono={ShoppingCart}
          titulo={ordenes.length === 0 ? "Todavía no hay órdenes de compra" : "No hay órdenes con ese filtro"}
          texto={ordenes.length === 0 ? "Armá una orden para pedir mercadería y después recibila." : undefined}
        >
          {puedeOperar && ordenes.length === 0 && (
            <BotonLink href="/admin/compras/ordenes/nueva">
              <Plus className="size-4" />
              Nueva orden
            </BotonLink>
          )}
        </Vacio>
      ) : (
        <motion.ul layout className="space-y-2">
          <AnimatePresence mode="popLayout">
            {lista.map((o, i) => {
              const pct = o.unidades ? Math.round((o.recibidas / o.unidades) * 100) : 0;
              return (
                <motion.li
                  key={o.id}
                  layout
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0, transition: { ...easeSmooth, delay: Math.min(i, 12) * 0.03 } }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                >
                  <motion.div whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 400, damping: 30 }}>
                    <Link
                      href={`/admin/compras/ordenes/${o.id}`}
                      className={cn(
                        "group grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 rounded-2xl border bg-white px-4 py-3 transition-shadow hover:shadow-card-hover sm:grid-cols-[7rem_minmax(0,1fr)_10rem_9rem_auto] sm:items-center",
                        o.estado === "borrador" ? "border-dorado-300/70" : "border-linea",
                        o.estado === "cancelada" && "opacity-70"
                      )}
                    >
                      <div className="flex items-baseline gap-2 sm:block">
                        <div className="font-heading text-base text-bordo-800">{o.numero}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">{formatFecha(o.fecha)}</div>
                      </div>
                      <div className="col-span-2 min-w-0 sm:col-span-1">
                        <div className="truncate text-sm font-medium">{o.proveedor}</div>
                        <div className="text-xs text-muted-foreground">
                          {o.lineas} producto{o.lineas === 1 ? "" : "s"} · {o.unidades} u.
                        </div>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>Recibido</span>
                          <span className="tabular-nums">
                            {o.recibidas}/{o.unidades}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-superficie">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
                            className={cn("h-full rounded-full", pct === 100 ? "bg-emerald-500" : "bg-bordo-700")}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 sm:justify-end">
                        <BadgeMoneda moneda={o.moneda} />
                        <span className="font-heading tabular-nums">{formatImporte(o.total, o.moneda)}</span>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <BadgeEstadoOrden estado={o.estado} />
                        <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-bordo-800" />
                      </div>
                    </Link>
                  </motion.div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </motion.ul>
      )}
    </div>
  );
}
