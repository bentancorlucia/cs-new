"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, FileText, PackageCheck, PackagePlus, Receipt, Search, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth, fadeInUp, staggerContainerFast } from "@/lib/motion";
import type { RecepcionDetalle, RecepcionListado } from "@/lib/comercial/compras";
import { BadgeMoneda, BotonLink, EncabezadoPagina, Filtros, Kpi, LinkAsiento, Panel, Vacio, claseControl } from "./ui";

type Filtro = "todas" | "sin_facturar" | "facturadas";

function estadoFactura(r: { unidades: number; facturadas: number; estado: string }) {
  if (r.estado === "anulada") return { texto: "Anulada", clase: "border-rose-200 bg-rose-50 text-rose-700" };
  if (r.facturadas >= r.unidades) return { texto: "Facturada", clase: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (r.facturadas > 0) return { texto: "Facturada en parte", clase: "border-violet-200 bg-violet-50 text-violet-800" };
  return { texto: "Sin facturar", clase: "border-dorado-300 bg-dorado-100 text-dorado-800" };
}

export function RecepcionesLista({ recepciones, puedeOperar }: { recepciones: RecepcionListado[]; puedeOperar: boolean }) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [texto, setTexto] = useState("");
  const q = useDeferredValue(texto.trim().toLowerCase());
  const sinFacturar = (r: RecepcionListado) => r.estado === "confirmada" && r.facturadas < r.unidades;
  const lista = useMemo(
    () =>
      recepciones.filter((r) => {
        if (filtro === "sin_facturar" && !sinFacturar(r)) return false;
        if (filtro === "facturadas" && sinFacturar(r)) return false;
        return !q || `${r.numero} ${r.proveedor} ${r.remito ?? ""} ${r.orden_numero ?? ""}`.toLowerCase().includes(q);
      }),
    [recepciones, filtro, q]
  );

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Proveedores y compras"
        titulo="Recepciones"
        descripcion="Mercadería que entró al stock. Lo recibido queda a facturar hasta que se carga la factura del proveedor."
      >
        {puedeOperar && (
          <BotonLink href="/admin/compras/recepciones/nueva">
            <PackagePlus className="size-4" />
            Recibir sin orden
          </BotonLink>
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
            placeholder="Buscá por número, proveedor, remito u orden…"
            className={cn(claseControl, "pl-9")}
          />
        </div>
        <Filtros<Filtro>
          id="recepciones"
          valor={filtro}
          onChange={setFiltro}
          opciones={[
            { valor: "todas", etiqueta: "Todas", cantidad: recepciones.length },
            { valor: "sin_facturar", etiqueta: "Con algo sin facturar", cantidad: recepciones.filter(sinFacturar).length },
            { valor: "facturadas", etiqueta: "Facturadas", cantidad: recepciones.filter((r) => !sinFacturar(r)).length },
          ]}
        />
      </motion.div>

      {lista.length === 0 ? (
        <Vacio icono={PackageCheck} titulo="No hay recepciones" texto="Las recepciones se hacen desde una orden aprobada o sin orden." />
      ) : (
        <motion.ul layout className="space-y-2">
          <AnimatePresence mode="popLayout">
            {lista.map((r, i) => {
              const e = estadoFactura(r);
              return (
                <motion.li
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0, transition: { ...easeSmooth, delay: Math.min(i, 12) * 0.03 } }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                >
                  <motion.div whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 400, damping: 30 }}>
                    <Link
                      href={`/admin/compras/recepciones/${r.id}`}
                      className="group grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 rounded-2xl border border-linea bg-white px-4 py-3 transition-shadow hover:shadow-card-hover sm:grid-cols-[7rem_minmax(0,1fr)_9rem_10rem_auto] sm:items-center"
                    >
                      <div className="flex items-baseline gap-2 sm:block">
                        <div className="font-heading text-base text-bordo-800">{r.numero}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">{formatFecha(r.fecha)}</div>
                      </div>
                      <div className="col-span-2 min-w-0 sm:col-span-1">
                        <div className="truncate text-sm font-medium">{r.proveedor}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {[r.orden_numero ?? "Sin orden", r.remito && `Remito ${r.remito}`].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {r.unidades} u. · facturadas {r.facturadas}
                      </div>
                      <div className="flex items-center gap-1.5 sm:justify-end">
                        <BadgeMoneda moneda={r.moneda} />
                        <span className="font-heading tabular-nums">{formatImporte(r.total, r.moneda)}</span>
                      </div>
                      <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1">
                        <span className={cn("inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-medium", e.clase)}>
                          {e.texto}
                        </span>
                        <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
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

export function RecepcionVista({ recepcion: r, puedeOperar }: { recepcion: RecepcionDetalle; puedeOperar: boolean }) {
  const e = estadoFactura(r);
  const pendiente = r.unidades - r.facturadas;
  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Recepción de mercadería"
        titulo={
          <span className="flex flex-wrap items-center gap-3">
            {r.numero}
            <span className={cn("inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium normal-case", e.clase)}>
              {e.texto}
            </span>
          </span>
        }
        descripcion={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link href={`/admin/proveedores/${r.proveedor_id}`} className="inline-flex items-center gap-1 hover:text-bordo-800">
              <Truck className="size-3.5" />
              {r.proveedor}
            </Link>
            <span className="tabular-nums">{formatFecha(r.fecha)}</span>
            {r.orden_id && (
              <Link href={`/admin/compras/ordenes/${r.orden_id}`} className="hover:text-bordo-800">
                Orden {r.orden_numero}
              </Link>
            )}
            {r.remito && <span>Remito {r.remito}</span>}
            <LinkAsiento id={r.asiento_id} />
          </span>
        }
      >
        {puedeOperar && pendiente > 0 && r.estado === "confirmada" && (
          <BotonLink href={`/admin/compras/documentos/nuevo?proveedor=${r.proveedor_id}&moneda=${r.moneda}`}>
            <Receipt className="size-4" />
            Cargar factura
          </BotonLink>
        )}
      </EncabezadoPagina>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta={`Total en ${r.moneda}`} delay={0.05}>
          {formatImporte(r.total, r.moneda)}
        </Kpi>
        <Kpi etiqueta="Valor en pesos (stock)" detalle={r.moneda !== "UYU" ? `TC ${String(r.tc).replace(".", ",")}` : undefined} delay={0.1}>
          {formatImporte(r.valor, "UYU")}
        </Kpi>
        <Kpi etiqueta="Unidades" delay={0.15}>
          {r.unidades}
        </Kpi>
        <Kpi etiqueta="Sin facturar" tono={pendiente > 0 ? "alerta" : "bueno"} delay={0.2}>
          {pendiente}
        </Kpi>
      </div>

      <Panel titulo="Mercadería recibida" icono={PackageCheck} delay={0.1}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-linea text-[10px] uppercase tracking-editorial text-muted-foreground">
                <th className="px-4 py-2 text-left font-normal">Producto</th>
                <th className="px-2 py-2 text-right font-normal">Cantidad</th>
                <th className="px-2 py-2 text-right font-normal">Facturada</th>
                <th className="px-2 py-2 text-right font-normal">Costo unit.</th>
                <th className="px-4 py-2 text-right font-normal">Valor $</th>
              </tr>
            </thead>
            <motion.tbody variants={staggerContainerFast} initial="hidden" animate="visible" className="divide-y divide-linea/60">
              {r.items.map((i) => (
                <motion.tr key={i.id} variants={fadeInUp}>
                  <td className="px-4 py-2.5">{i.nombre}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{i.cantidad}</td>
                  <td className={cn("px-2 py-2.5 text-right tabular-nums", i.cantidad_facturada === i.cantidad && "text-emerald-700")}>
                    {i.cantidad_facturada}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{formatImporte(i.costo_unitario, r.moneda)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatImporte(i.valor)}</td>
                </motion.tr>
              ))}
            </motion.tbody>
          </table>
        </div>
      </Panel>

      <Panel titulo="Facturas que la imputan" icono={FileText} delay={0.15}>
        {r.documentos.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Todavía no se facturó.</p>
        ) : (
          <ul className="divide-y divide-linea/70">
            {r.documentos.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/admin/compras/documentos/${d.id}`}
                  className={cn("flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-superficie/60", d.estado === "anulado" && "line-through opacity-60")}
                >
                  {d.nombre}
                  <ArrowRight className="ml-auto size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
