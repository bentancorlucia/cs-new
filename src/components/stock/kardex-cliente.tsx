"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, BookOpen, ExternalLink, History, PackageMinus, Pencil, User } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { costoPromedio, NOMBRE_TIPO_MOVIMIENTO } from "@/lib/comercial/stock";
import { easeSmooth, fadeInUp, springSmooth, staggerContainer, staggerContainerFast } from "@/lib/motion";
import { EnteroAnimado, ImporteAnimado } from "@/components/contabilidad/reportes/importe-animado";
import { TituloReporte } from "@/components/contabilidad/reportes/titulo-reporte";
import { BajaDialog, type CentroCosto } from "./baja-dialog";
import type { ProductoVista } from "./tipos";

export interface FilaKardex {
  id: number;
  fecha: string;
  creado: string;
  tipo: string;
  item: string;
  cantidad: number;
  costoUnitario: number | null;
  valor: number | null;
  stockResultante: number;
  valorResultante: number | null;
  origen: string;
  origenHref: string | null;
  motivo: string | null;
  asientoId: string | null;
  usuario: string | null;
}

const TONO_TIPO: Record<string, string> = {
  inventario_inicial: "bg-sky-50 text-sky-700 border-sky-200",
  compra: "bg-emerald-50 text-emerald-700 border-emerald-200",
  venta: "bg-bordo-50 text-bordo-800 border-bordo-200",
  devolucion_venta: "bg-violet-50 text-violet-700 border-violet-200",
  ajuste: "bg-amber-50 text-amber-800 border-amber-200",
  baja: "bg-red-50 text-red-700 border-red-200",
  recuento: "bg-teal-50 text-teal-700 border-teal-200",
  devolucion_compra: "bg-orange-50 text-orange-700 border-orange-200",
};

export function KardexCliente({
  producto,
  seleccion,
  filas,
  verCostos,
  puedeOperar,
  centros,
  error,
}: {
  producto: ProductoVista;
  seleccion: string;
  filas: FilaKardex[];
  verCostos: boolean;
  puedeOperar: boolean;
  centros: CentroCosto[];
  error: string | null;
}) {
  const [bajaAbierta, setBajaAbierta] = useState(false);
  const [tipo, setTipo] = useState<string>("todos");

  const itemsSel = useMemo(
    () => (seleccion === "todas" ? producto.items : producto.items.filter((i) => String(i.varianteId ?? 0) === seleccion)),
    [producto, seleccion]
  );
  const stock = itemsSel.reduce((s, i) => s + i.stock, 0);
  const valor = itemsSel.reduce((s, i) => s + i.valor, 0);
  const reservado = itemsSel.reduce((s, i) => s + i.reservado, 0);
  const prom = costoPromedio(stock, valor);
  const metodo = itemsSel[0]?.metodo ?? "promedio";
  const heredado = itemsSel.some((i) => i.heredado);

  const tipos = useMemo(() => [...new Set(filas.map((f) => f.tipo))], [filas]);
  const visibles = tipo === "todos" ? filas : filas.filter((f) => f.tipo === tipo);
  const mostrarItem = producto.tieneVariantes && seleccion === "todas";
  const productoAjuste = useMemo(() => ({ ...producto, items: itemsSel }), [producto, itemsSel]);

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={easeSmooth}>
        <Link href="/admin/stock" className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
          Stock
        </Link>
      </motion.div>

      <TituloReporte etiqueta="Kardex valorizado" titulo={producto.nombre} descripcion={[producto.sku && `SKU ${producto.sku}`, producto.categoria, `Costeo ${metodo === "fifo" ? "FIFO" : "promedio ponderado"}`].filter(Boolean).join(" · ")}>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/productos/${producto.id}`} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "rounded-full")}>
            <Pencil className="size-4" />
            Ficha
          </Link>
          {puedeOperar && stock > 0 && (
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              <Button size="lg" className="rounded-full" onClick={() => setBajaAbierta(true)}>
                <PackageMinus className="size-4" />
                Dar de baja
              </Button>
            </motion.div>
          )}
        </div>
      </TituloReporte>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {/* Variantes */}
      {producto.tieneVariantes && (
        <motion.div variants={staggerContainerFast} initial="hidden" animate="visible" className="flex flex-wrap gap-1.5">
          {[{ clave: "todas", nombre: "Todas", stock: producto.stock }, ...producto.items.map((i) => ({ clave: String(i.varianteId ?? 0), nombre: i.nombre, stock: i.stock }))].map(
            (v) => (
              <motion.div key={v.clave} variants={fadeInUp} transition={springSmooth}>
                <Link
                  href={`/admin/stock/kardex/${producto.id}${v.clave === "todas" ? "" : `?variante=${v.clave}`}`}
                  scroll={false}
                  className={cn(
                    "relative inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    seleccion === v.clave ? "text-white" : "bg-superficie/60 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {seleccion === v.clave && (
                    <motion.span layoutId="variante-kardex" className="absolute inset-0 rounded-full bg-bordo-800" transition={springSmooth} />
                  )}
                  <span className="relative">{v.nombre}</span>
                  <span className={cn("relative tabular-nums", seleccion === v.clave ? "text-white/70" : "text-muted-foreground/70")}>{v.stock}</span>
                </Link>
              </motion.div>
            )
          )}
        </motion.div>
      )}

      {/* Resumen */}
      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Stock", valor: <EnteroAnimado valor={stock} /> },
          { label: "Reservado", valor: <EnteroAnimado valor={reservado} /> },
          ...(verCostos
            ? [
                { label: "Costo promedio", valor: prom !== null ? <ImporteAnimado valor={prom} moneda="UYU" /> : <span>—</span> },
                { label: "Valor del stock", valor: <ImporteAnimado valor={valor} moneda="UYU" /> },
              ]
            : []),
        ].map((t) => (
          <motion.div key={t.label} variants={fadeInUp} transition={springSmooth} className="rounded-2xl border border-linea bg-white p-4 shadow-sm">
            <p className="text-[11px] text-muted-foreground">{t.label}</p>
            <p className="mt-1 font-display text-xl tracking-tightest text-bordo-900 sm:text-2xl">{t.valor}</p>
          </motion.div>
        ))}
      </motion.div>

      {heredado && (
        <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
          Parte de este stock es anterior al motor de costos: entra al kardex (como inventario inicial al último costo conocido)
          con su primer movimiento.
        </p>
      )}

      {/* Filtro por tipo */}
      {tipos.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {["todos", ...tipos].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
                tipo === t ? "border-bordo-300 bg-bordo-50 text-bordo-800" : "border-linea text-muted-foreground hover:border-bordo-200"
              )}
            >
              {t === "todos" ? "Todos los movimientos" : NOMBRE_TIPO_MOVIMIENTO[t] ?? t}
            </button>
          ))}
        </div>
      )}

      {/* Movimientos */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...easeSmooth, delay: 0.1 }}
        className="overflow-hidden rounded-2xl border border-linea bg-white"
      >
        {visibles.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <History className="mx-auto mb-3 size-12 opacity-20" />
            <p className="text-sm">Sin movimientos todavía</p>
            {puedeOperar && (
              <p className="mt-1 text-xs">
                El stock entra con el inventario inicial o una compra; después solo cambia por ventas, devoluciones, bajas y
                recuentos.
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Escritorio */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead className="bg-superficie/40 text-[11px] font-heading uppercase tracking-editorial text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Fecha</th>
                    <th className="px-2 py-2.5 text-left">Movimiento</th>
                    {mostrarItem && <th className="px-2 py-2.5 text-left">Variante</th>}
                    <th className="px-2 py-2.5 text-right">Cant.</th>
                    {verCostos && <th className="px-2 py-2.5 text-right">Costo unit.</th>}
                    {verCostos && <th className="px-2 py-2.5 text-right">Valor</th>}
                    <th className="px-2 py-2.5 text-right">Stock</th>
                    {verCostos && <th className="px-2 py-2.5 text-right">Valor stock</th>}
                    <th className="px-4 py-2.5 text-right">Asiento</th>
                  </tr>
                </thead>
                <motion.tbody variants={staggerContainerFast} initial="hidden" animate="visible">
                  <AnimatePresence initial={false}>
                    {visibles.map((f) => (
                      <motion.tr
                        key={f.id}
                        layout
                        variants={fadeInUp}
                        exit={{ opacity: 0 }}
                        transition={springSmooth}
                        className="border-t border-linea/70 align-top hover:bg-superficie/30"
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{formatFecha(f.fecha)}</td>
                        <td className="px-2 py-2.5">
                          <TipoBadge tipo={f.tipo} />
                          <Origen fila={f} />
                        </td>
                        {mostrarItem && <td className="px-2 py-2.5 text-xs">{f.item}</td>}
                        <td className={cn("px-2 py-2.5 text-right font-medium tabular-nums", f.cantidad > 0 ? "text-emerald-700" : "text-red-600")}>
                          {f.cantidad > 0 ? "+" : ""}
                          {f.cantidad}
                        </td>
                        {verCostos && <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">{formatImporte(f.costoUnitario)}</td>}
                        {verCostos && (
                          <td className={cn("px-2 py-2.5 text-right tabular-nums", (f.valor ?? 0) < 0 && "text-red-600")}>{formatImporte(f.valor)}</td>
                        )}
                        <td className="px-2 py-2.5 text-right tabular-nums">{f.stockResultante}</td>
                        {verCostos && <td className="px-2 py-2.5 text-right tabular-nums">{formatImporte(f.valorResultante)}</td>}
                        <td className="px-4 py-2.5 text-right">
                          <EnlaceAsiento id={f.asientoId} tipo={f.tipo} />
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </motion.tbody>
              </table>
            </div>

            {/* Celular */}
            <motion.ul variants={staggerContainerFast} initial="hidden" animate="visible" className="divide-y divide-linea lg:hidden">
              {visibles.map((f) => (
                <motion.li key={f.id} variants={fadeInUp} transition={springSmooth} className="space-y-1.5 p-4 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs tabular-nums text-muted-foreground">{formatFecha(f.fecha)}</span>
                        <TipoBadge tipo={f.tipo} />
                      </div>
                      {mostrarItem && <p className="mt-1 text-xs font-medium">{f.item}</p>}
                      <Origen fila={f} />
                    </div>
                    <span className={cn("font-heading text-lg tabular-nums", f.cantidad > 0 ? "text-emerald-700" : "text-red-600")}>
                      {f.cantidad > 0 ? "+" : ""}
                      {f.cantidad}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      Stock {f.stockResultante}
                      {verCostos && ` · $ ${formatImporte(f.valorResultante)}`}
                      {verCostos && ` · ${formatImporte(f.costoUnitario)} c/u`}
                    </span>
                    <EnlaceAsiento id={f.asientoId} tipo={f.tipo} />
                  </div>
                </motion.li>
              ))}
            </motion.ul>
          </>
        )}
      </motion.div>

      {puedeOperar && (
        <BajaDialog
          open={bajaAbierta}
          onOpenChange={setBajaAbierta}
          productos={[productoAjuste]}
          inicial={itemsSel.length === 1 ? itemsSel[0].clave : null}
          verCostos={verCostos}
          centros={centros}
        />
      )}
    </div>
  );
}

function TipoBadge({ tipo }: { tipo: string }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium", TONO_TIPO[tipo] ?? "border-linea")}>
      {NOMBRE_TIPO_MOVIMIENTO[tipo] ?? tipo}
    </span>
  );
}

function Origen({ fila }: { fila: FilaKardex }) {
  return (
    <div className="mt-1 text-xs text-muted-foreground">
      {fila.origenHref ? (
        <Link href={fila.origenHref} className="inline-flex items-center gap-1 text-bordo-700 hover:underline">
          {fila.origen}
          <ExternalLink className="size-3" />
        </Link>
      ) : (
        <span>{fila.origen}</span>
      )}
      {fila.motivo && fila.motivo !== fila.origen && <span className="block text-[11px]">{fila.motivo}</span>}
      {fila.usuario && (
        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground/80">
          <User className="size-3" />
          {fila.usuario}
        </span>
      )}
    </div>
  );
}

function EnlaceAsiento({ id, tipo }: { id: string | null; tipo: string }) {
  if (!id) {
    return (
      <span className="text-[11px] text-muted-foreground/70" title={tipo === "inventario_inicial" ? "Va en la apertura contable" : "Sin asiento"}>
        {tipo === "inventario_inicial" ? "Apertura" : "—"}
      </span>
    );
  }
  return (
    <Link href={`/contabilidad/asientos/${id}`} className="inline-flex items-center gap-1 text-xs text-bordo-700 hover:underline">
      <BookOpen className="size-3" />
      Ver asiento
    </Link>
  );
}
