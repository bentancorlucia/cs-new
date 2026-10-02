"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Ban, HandCoins, Link2, Plus, Receipt, Search, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth } from "@/lib/motion";
import type { PagoCC, PagoDetalle } from "@/lib/comercial/compras";
import { AnularDialog, AplicarDialog, PagarDialog } from "./dialogos";
import {
  BadgeEstadoPago,
  BadgeMoneda,
  Boton,
  BotonLink,
  EncabezadoPagina,
  Filtros,
  Kpi,
  LinkAsiento,
  Panel,
  Vacio,
  claseControl,
} from "./ui";

type Filtro = "pendiente" | "pagada" | "anticipos" | "anulada" | "todas";

const pasa = (p: PagoCC, f: Filtro) => (f === "todas" ? true : f === "anticipos" ? p.saldo > 0 : p.estado === f);

export function PagosLista({ pagos, puedeOperar }: { pagos: PagoCC[]; puedeOperar: boolean }) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [texto, setTexto] = useState("");
  const q = useDeferredValue(texto.trim().toLowerCase());
  const lista = useMemo(
    () =>
      [...pagos]
        .reverse()
        .filter((p) => pasa(p, filtro))
        .filter((p) => !q || `${p.numero} ${p.proveedor} ${p.referencia ?? ""}`.toLowerCase().includes(q)),
    [pagos, filtro, q]
  );
  const pendientes = pagos.filter((p) => p.estado === "pendiente");
  const totalPend = (m: string) => pendientes.filter((p) => p.moneda === m).reduce((s, p) => s + p.importe, 0);

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Proveedores y compras"
        titulo="Órdenes de pago"
        descripcion="Se crean pendientes con las facturas que cancelan; al pagarlas se registra el asiento."
      >
        {puedeOperar && (
          <BotonLink href="/admin/compras/pagos/nuevo">
            <Plus className="size-4" />
            Nueva orden de pago
          </BotonLink>
        )}
      </EncabezadoPagina>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi etiqueta="Pendientes de pagar" delay={0.05}>
          {pendientes.length}
        </Kpi>
        <Kpi etiqueta="A pagar en pesos" delay={0.1}>
          {formatImporte(totalPend("UYU"), "UYU")}
        </Kpi>
        <Kpi etiqueta="A pagar en dólares" delay={0.15}>
          {formatImporte(totalPend("USD"), "USD")}
        </Kpi>
      </div>

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
            placeholder="Buscá por número, proveedor o referencia…"
            className={cn(claseControl, "pl-9")}
          />
        </div>
        <Filtros<Filtro>
          id="pagos"
          valor={filtro}
          onChange={setFiltro}
          opciones={[
            { valor: "todas", etiqueta: "Todas", cantidad: pagos.length },
            { valor: "pendiente", etiqueta: "Pendientes", cantidad: pendientes.length },
            { valor: "pagada", etiqueta: "Pagadas", cantidad: pagos.filter((p) => p.estado === "pagada").length },
            { valor: "anticipos", etiqueta: "Con anticipo", cantidad: pagos.filter((p) => p.saldo > 0).length },
            { valor: "anulada", etiqueta: "Anuladas", cantidad: pagos.filter((p) => p.estado === "anulada").length },
          ]}
        />
      </motion.div>

      {lista.length === 0 ? (
        <Vacio icono={HandCoins} titulo="No hay órdenes de pago con ese filtro" />
      ) : (
        <motion.ul layout className="space-y-2">
          <AnimatePresence mode="popLayout">
            {lista.map((p, i) => (
              <motion.li
                key={p.id}
                layout
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0, transition: { ...easeSmooth, delay: Math.min(i, 12) * 0.03 } }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
              >
                <motion.div whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 400, damping: 30 }}>
                  <Link
                    href={`/admin/compras/pagos/${p.id}`}
                    className={cn(
                      "group grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 rounded-2xl border bg-white px-4 py-3 transition-shadow hover:shadow-card-hover sm:grid-cols-[7rem_minmax(0,1fr)_10rem_10rem_auto] sm:items-center",
                      p.estado === "pendiente" ? "border-dorado-300/70" : "border-linea",
                      p.estado === "anulada" && "opacity-60"
                    )}
                  >
                    <div>
                      <div className="font-heading text-base text-bordo-800">{p.numero}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {p.fecha_pago ? formatFecha(p.fecha_pago) : `creada ${formatFecha(p.created_at.slice(0, 10))}`}
                      </div>
                    </div>
                    <div className="col-span-2 min-w-0 sm:col-span-1">
                      <div className="truncate text-sm font-medium">{p.proveedor}</div>
                      <div className="truncate text-xs text-muted-foreground">{p.referencia ?? "Sin referencia"}</div>
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      Aplicado {formatImporte(p.aplicado, p.moneda)}
                      {p.saldo > 0 && <div className="text-sky-700">Anticipo {formatImporte(p.saldo, p.moneda)}</div>}
                    </div>
                    <div className="flex items-center gap-1.5 sm:justify-end">
                      <BadgeMoneda moneda={p.moneda} />
                      <span className="font-heading tabular-nums">{formatImporte(p.importe, p.moneda)}</span>
                    </div>
                    <div className="col-span-2 flex items-center justify-end gap-2 sm:col-span-1">
                      <BadgeEstadoPago estado={p.estado} />
                      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </Link>
                </motion.div>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}
    </div>
  );
}

export function PagoVista({ pago: p, puedeOperar }: { pago: PagoDetalle; puedeOperar: boolean }) {
  const [pagar, setPagar] = useState(false);
  const [anular, setAnular] = useState(false);
  const [aplicar, setAplicar] = useState(false);
  const previsto = p.estado === "pendiente";

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Orden de pago"
        titulo={
          <span className="flex flex-wrap items-center gap-3">
            {p.numero}
            <BadgeEstadoPago estado={p.estado} />
          </span>
        }
        descripcion={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link href={`/admin/proveedores/${p.proveedor_id}`} className="inline-flex items-center gap-1 hover:text-bordo-800">
              <Truck className="size-3.5" />
              {p.proveedor}
            </Link>
            {p.referencia && <span>Ref. {p.referencia}</span>}
            <LinkAsiento id={p.asiento_id} />
          </span>
        }
      >
        {puedeOperar && p.estado === "pendiente" && (
          <Boton onClick={() => setPagar(true)}>
            <HandCoins className="size-4" />
            Pagar
          </Boton>
        )}
        {puedeOperar && p.saldo > 0 && (
          <Boton variante="dorado" onClick={() => setAplicar(true)}>
            <Link2 className="size-4" />
            Aplicar anticipo
          </Boton>
        )}
        {puedeOperar && p.estado !== "anulada" && (
          <Boton variante="peligro" onClick={() => setAnular(true)}>
            <Ban className="size-4" />
            Anular
          </Boton>
        )}
      </EncabezadoPagina>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Importe" delay={0.05}>
          <span className="flex items-center gap-2">
            {formatImporte(p.importe, p.moneda)}
            <BadgeMoneda moneda={p.moneda} />
          </span>
        </Kpi>
        <Kpi etiqueta={previsto ? "A aplicar" : "Aplicado"} delay={0.1}>
          {formatImporte(p.aplicado, p.moneda)}
        </Kpi>
        <Kpi
          etiqueta={previsto ? "Quedará de anticipo" : "Anticipo disponible"}
          tono={p.saldo > 0 ? "bueno" : "neutro"}
          delay={0.15}
        >
          {formatImporte(previsto ? p.importe - p.aplicado : p.saldo, p.moneda)}
        </Kpi>
        <Kpi
          etiqueta={p.fecha_pago ? "Pagada" : "Sale de"}
          detalle={p.fecha_pago ? `${p.cuenta_pago ?? ""}${p.tc && p.moneda !== "UYU" ? ` · TC ${String(p.tc).replace(".", ",")}` : ""}` : undefined}
          delay={0.2}
        >
          <span className="text-base">{p.fecha_pago ? formatFecha(p.fecha_pago) : p.cuenta_pago ?? "—"}</span>
        </Kpi>
      </div>

      {previsto && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-dorado-300 bg-dorado-50 px-4 py-3 text-sm text-dorado-900"
        >
          Pendiente: todavía no salió la plata ni hay asiento. Cuando hagas la transferencia o el pago, tocá “Pagar”.
        </motion.div>
      )}

      <Panel titulo={previsto ? "Facturas que va a cancelar" : "Facturas canceladas"} icono={Receipt} delay={0.1}>
        {p.aplicaciones.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Sin facturas: todo el importe es anticipo.</p>
        ) : (
          <ul className="divide-y divide-linea/70">
            {p.aplicaciones.map((a) => (
              <li
                key={a.id}
                className={cn(
                  "flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm",
                  !a.vigente && !previsto && "opacity-60"
                )}
              >
                <Link href={a.href} className="font-medium hover:text-bordo-800 hover:underline">
                  {a.descripcion}
                </Link>
                <span className="text-xs text-muted-foreground tabular-nums">{formatFecha(a.fecha)}</span>
                {!a.vigente && !previsto && <span className="text-[11px] text-muted-foreground">(liberada)</span>}
                {a.asiento_id && a.asiento_id !== p.asiento_id && <span className="text-[11px] text-sky-700">aplicación de anticipo</span>}
                <span className="ml-auto flex items-center gap-2">
                  <span className="tabular-nums">{formatImporte(a.importe, p.moneda)}</span>
                  {a.asiento_id !== p.asiento_id && <LinkAsiento id={a.asiento_id} />}
                </span>
              </li>
            ))}
          </ul>
        )}
        {p.notas && <p className="border-t border-linea px-4 py-2 text-xs text-muted-foreground">{p.notas}</p>}
      </Panel>

      <PagarDialog
        open={pagar}
        onOpenChange={setPagar}
        id={p.id}
        numero={p.numero}
        moneda={p.moneda}
        importe={p.importe}
        cuenta={p.cuenta_pago}
      />
      <AnularDialog
        open={anular}
        onOpenChange={setAnular}
        tipo="pago"
        id={p.id}
        nombre={p.numero}
        aviso={
          p.estado === "pagada"
            ? "Se revierten el asiento del pago y los de las aplicaciones de su anticipo; las facturas vuelven a quedar pendientes."
            : "La orden queda anulada; las facturas siguen pendientes. No hay asiento que revertir."
        }
      />
      {p.saldo > 0 && (
        <AplicarDialog
          open={aplicar}
          onOpenChange={setAplicar}
          origen={{ tipo: "anticipo", id: p.id, nombre: `anticipo ${p.numero}` }}
          proveedorId={p.proveedor_id}
          moneda={p.moneda}
          disponible={p.saldo}
        />
      )}
    </div>
  );
}
