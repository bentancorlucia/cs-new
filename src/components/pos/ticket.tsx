"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { PagoTicket, TicketVenta } from "./tipos";
import { fechaHora, pesos } from "./formato";

const ESTILO_IMPRESION = `
@media screen { #ticket-pos-impresion { display: none !important; } }
@media print {
  @page { size: 80mm auto; margin: 0; }
  html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
  body > *:not(#ticket-pos-impresion) { display: none !important; }
  #ticket-pos-impresion { display: block !important; width: 72mm; margin: 0 auto; padding: 3mm 0 6mm; color: #000; }
}
`;

function medioDePago(t: TicketVenta): string {
  if (t.metodo_pago === "efectivo") return "Efectivo";
  if (t.metodo_pago === "transferencia") return "Transferencia";
  return "Mixto";
}

/** Contenido del ticket (80 mm). Se usa para la vista previa y para imprimir. */
export function ContenidoTicket({ ticket, pago }: { ticket: TicketVenta; pago: PagoTicket | null }) {
  const pendiente = ticket.estado === "pendiente_verificacion";
  const hayEncargues = ticket.items.some((i) => i.es_encargue);
  return (
    <div className="font-mono text-[11px] leading-snug text-black">
      <div className="text-center">
        <p className="text-[14px] font-bold uppercase tracking-wide">Club Seminario</p>
        <p>Tienda del club</p>
        <p className="mt-1">{fechaHora(ticket.fecha)}</p>
        <p className="font-bold">Pedido {ticket.numero_pedido}</p>
        {ticket.cliente && <p>Cliente: {ticket.cliente}</p>}
      </div>

      <div className="my-2 border-t border-dashed border-black" />

      <table className="w-full border-collapse">
        <tbody>
          {ticket.items.map((i, n) => (
            <tr key={n} className="align-top">
              <td className="py-0.5 pr-1">
                <div>
                  {i.cantidad} × {i.nombre}
                  {i.es_encargue ? " (encargue)" : ""}
                </div>
                {i.detalle && <div className="text-[10px]">{i.detalle}</div>}
                {i.cantidad > 1 && <div className="text-[10px]">{pesos(i.precio_unitario)} c/u</div>}
              </td>
              <td className="py-0.5 text-right whitespace-nowrap">{pesos(i.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="my-2 border-t border-dashed border-black" />

      <div className="space-y-0.5">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{pesos(ticket.subtotal)}</span>
        </div>
        {ticket.descuentos.map((d, n) => (
          <div key={n} className="flex justify-between gap-2">
            <span>{d.concepto}</span>
            <span className="whitespace-nowrap">- {pesos(d.importe)}</span>
          </div>
        ))}
        <div className="flex justify-between text-[14px] font-bold pt-1">
          <span>TOTAL</span>
          <span>{pesos(ticket.total)}</span>
        </div>
      </div>

      <div className="my-2 border-t border-dashed border-black" />

      <div className="space-y-0.5">
        <div className="flex justify-between">
          <span>Medio de pago</span>
          <span>{medioDePago(ticket)}</span>
        </div>
        {ticket.metodo_pago === "mixto" && (
          <>
            <div className="flex justify-between">
              <span>· Efectivo</span>
              <span>{pesos(ticket.monto_efectivo)}</span>
            </div>
            <div className="flex justify-between">
              <span>· Transferencia</span>
              <span>{pesos(ticket.monto_transferencia)}</span>
            </div>
          </>
        )}
        {pago?.recibido != null && pago.recibido > 0 && (
          <div className="flex justify-between">
            <span>Recibido</span>
            <span>{pesos(pago.recibido)}</span>
          </div>
        )}
        {pago?.vuelto != null && pago.vuelto > 0 && (
          <div className="flex justify-between font-bold">
            <span>Vuelto</span>
            <span>{pesos(pago.vuelto)}</span>
          </div>
        )}
      </div>

      {(pendiente || hayEncargues) && (
        <>
          <div className="my-2 border-t border-dashed border-black" />
          {pendiente && <p>Transferencia pendiente de verificación.</p>}
          {hayEncargues && <p>Encargue: te avisamos cuando esté para retirar.</p>}
        </>
      )}

      <div className="my-2 border-t border-dashed border-black" />
      <p className="text-center">¡Gracias por tu compra!</p>
      <p className="text-center text-[9px] mt-1">Comprobante interno, no válido como factura.</p>
    </div>
  );
}

const sinSuscripcion = () => () => {};

/**
 * Copia del ticket montada directamente en <body>: invisible en pantalla,
 * es lo único que sale al imprimir (window.print()).
 */
export function TicketImprimible({ ticket, pago }: { ticket: TicketVenta; pago: PagoTicket | null }) {
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  if (!montado) return null;
  return createPortal(
    <div id="ticket-pos-impresion">
      <style>{ESTILO_IMPRESION}</style>
      <ContenidoTicket ticket={ticket} pago={pago} />
    </div>,
    document.body
  );
}

export function imprimirTicket() {
  window.print();
}
