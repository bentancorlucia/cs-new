"use client";

import { motion } from "framer-motion";
import { AlertTriangle, BookOpen, Repeat, RotateCcw, Undo2 } from "lucide-react";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { ImporteAnimado } from "@/components/contabilidad/reportes/importe-animado";
import { fadeInUp } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { FilaAsiento, NumeroAsiento } from "./asiento-link";
import type { PedidoDetalle } from "./tipos";

function Dato({
  etiqueta,
  valor,
  detalle,
  tono,
}: {
  etiqueta: string;
  valor: number;
  detalle?: React.ReactNode;
  tono?: "positivo" | "negativo" | "neutro";
}) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="rounded-lg border border-linea bg-superficie/40 p-3"
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <ImporteAnimado
        valor={valor}
        moneda="UYU"
        className={cn(
          "mt-0.5 block text-base font-semibold",
          tono === "positivo" && "text-emerald-700",
          tono === "negativo" && "text-red-600"
        )}
      />
      {detalle && <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{detalle}</p>}
    </motion.div>
  );
}

/** Sección "Contabilidad" del detalle del pedido. */
export function ContabilidadPedidoSeccion({ pedido }: { pedido: PedidoDetalle }) {
  const { contabilidad: c, permisos } = pedido;
  const conLink = permisos.puedeVerContabilidad;
  const venta = c.venta;
  const nombreItem = new Map(
    pedido.items.map((i) => [i.id, i.variante ? `${i.producto.nombre} — ${i.variante.nombre}` : i.producto.nombre])
  );

  const itemsCosto = venta && !venta.anulada
    ? pedido.items.filter((i) => !i.es_encargue && i.costo_unitario_venta != null)
    : [];
  const factor = (() => {
    const base = pedido.items.filter((i) => !i.es_encargue).reduce((s, i) => s + i.subtotal, 0);
    return venta && base > 0 ? venta.monto_ventas / base : 1;
  })();

  const sinNada = !venta && c.asientos.length === 0 && c.devoluciones.length === 0;

  return (
    <motion.section variants={fadeInUp} className="mb-5 overflow-hidden rounded-xl border border-linea bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-linea px-4 py-3 sm:px-5">
        <h2 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <BookOpen className="size-3.5" />
          Contabilidad
        </h2>
        {venta?.cuenta_ingreso && (
          <span className="truncate text-[11px] text-muted-foreground">
            {venta.cuenta_ingreso.nombre} <span className="font-mono">({venta.cuenta_ingreso.codigo})</span>
          </span>
        )}
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {c.error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            No se pudo leer toda la información contable: {c.error}
          </div>
        )}

        {sinNada && (
          <p className="text-sm text-muted-foreground">
            {pedido.estado === "pendiente_verificacion"
              ? "Todavía no hay asientos: la venta se contabiliza al aprobar la transferencia."
              : pedido.estado === "cancelado"
                ? "El pedido se canceló antes de contabilizarse: no generó asientos."
                : "Este pedido no tiene asientos (es anterior a la contabilidad de la tienda)."}
          </p>
        )}

        {venta?.anulada && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
            <RotateCcw className="mt-0.5 size-3.5 shrink-0" />
            <span>
              <span className="font-medium">Venta anulada.</span> Los asientos se revirtieron y la mercadería volvió al
              stock al mismo costo con que salió.
            </span>
          </div>
        )}

        {venta && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Dato etiqueta="Venta" valor={venta.monto_ventas} detalle={`Neto de descuentos · ${formatFecha(venta.fecha)}`} />
            {venta.monto_encargues > 0 && (
              <Dato
                etiqueta="Encargues"
                valor={venta.monto_encargues}
                detalle={venta.encargue_reconocido ? "Reconocida como venta al retirar" : "Seña: se reconoce al retirar"}
              />
            )}
            {venta.monto_donacion > 0 && (
              <Dato etiqueta="Donación" valor={venta.monto_donacion} detalle="A transferir a la Olla (no es venta)" />
            )}
            <Dato etiqueta="Costo de lo vendido" valor={c.resultado?.costo ?? venta.costo} detalle="Salida del kardex" />
            {c.resultado && (
              <Dato
                etiqueta="Margen bruto"
                valor={c.resultado.margen}
                tono={c.resultado.margen >= 0 ? "positivo" : "negativo"}
                detalle={
                  c.resultado.margen_pct != null
                    ? `${(c.resultado.margen_pct * 100).toLocaleString("es-UY", { maximumFractionDigits: 1 })}% sobre ${formatImporte(c.resultado.ventas, "UYU")}`
                    : undefined
                }
              />
            )}
          </div>
        )}

        {venta && venta.monto_encargues > 0 && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Los encargues no salen del stock: su costo entra con la compra al proveedor, no en este pedido.
          </p>
        )}

        {c.asientos.length > 0 && (
          <div>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Asientos</h3>
            <ul className="divide-y divide-linea">
              {c.asientos.map((a, i) => (
                <FilaAsiento key={a.id} asiento={a} conLink={conLink} indice={i} />
              ))}
            </ul>
            {!conLink && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                El detalle de cada asiento lo ve tesorería en Contabilidad.
              </p>
            )}
          </div>
        )}

        {itemsCosto.length > 0 && (
          <div>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Costo y margen por ítem
            </h3>
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[420px] text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="pb-1.5 font-medium">Producto</th>
                    <th className="pb-1.5 text-right font-medium">Cant.</th>
                    <th className="pb-1.5 text-right font-medium">Venta</th>
                    <th className="pb-1.5 text-right font-medium">Costo</th>
                    <th className="pb-1.5 text-right font-medium">Margen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linea/60">
                  {itemsCosto.map((i) => {
                    const ventaItem = Math.round(i.subtotal * factor * 100) / 100;
                    const costo = (i.costo_unitario_venta ?? 0) * i.cantidad;
                    const margen = ventaItem - costo;
                    return (
                      <tr key={i.id}>
                        <td className="max-w-[180px] truncate py-1.5 pr-2">{nombreItem.get(i.id)}</td>
                        <td className="py-1.5 text-right tabular-nums">{i.cantidad}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatImporte(ventaItem)}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatImporte(costo)}</td>
                        <td
                          className={cn(
                            "py-1.5 text-right font-medium tabular-nums",
                            margen < 0 ? "text-red-600" : "text-emerald-700"
                          )}
                        >
                          {formatImporte(margen)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {factor !== 1 && (
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                La venta por ítem ya descuenta la parte proporcional del descuento del pedido.
              </p>
            )}
          </div>
        )}

        {c.devoluciones.length > 0 && (
          <div>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Devoluciones y cambios
            </h3>
            <ul className="space-y-2">
              {c.devoluciones.map((d, idx) => (
                <motion.li
                  key={d.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * idx }}
                  className="rounded-lg border border-linea p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {d.importe_nuevo > 0 ? <Repeat className="size-3.5" /> : <Undo2 className="size-3.5" />}
                      {d.importe_nuevo > 0 ? "Cambio" : "Devolución"}
                      <span className="text-[11px] font-normal text-muted-foreground">
                        {formatFecha(d.fecha)} · por {d.medio === "caja" ? "caja" : "banco"}
                      </span>
                    </span>
                    {d.asiento && <NumeroAsiento asiento={d.asiento} conLink={conLink} />}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{d.motivo}</p>
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {d.items.map((it) => (
                      <li key={it.id} className="flex justify-between gap-3">
                        <span className={cn("truncate", it.es_nuevo ? "text-emerald-700" : "text-red-600")}>
                          {it.es_nuevo ? "+ " : "− "}
                          {it.cantidad} × {it.nombre}
                        </span>
                        <span className="shrink-0 tabular-nums">{formatImporte(it.importe)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 border-t border-linea pt-1.5 text-xs font-medium">
                    {d.neto < 0
                      ? `Se reintegraron ${formatImporte(-d.neto, "UYU")} por ${d.medio}`
                      : d.neto > 0
                        ? `El cliente pagó ${formatImporte(d.neto, "UYU")} de diferencia por ${d.medio}`
                        : "Sin diferencia de dinero"}
                  </p>
                </motion.li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </motion.section>
  );
}
