"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Ban, FileText, HandCoins, Link2, ListChecks, Plus, Receipt, Search, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte, hoyUruguay } from "@/lib/contabilidad/formato";
import { easeSmooth, fadeInUp, staggerContainerFast } from "@/lib/motion";
import { NOMBRE_TIPO_DOC, diasEntre, numeroDocumento } from "@/lib/comercial/compras-esquemas";
import type { DocumentoCC, DocumentoDetalle } from "@/lib/comercial/compras";
import { AnularDialog, AplicarDialog } from "./dialogos";
import {
  BadgeMoneda,
  BadgeSaldoDoc,
  BadgeTipoDoc,
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

type Filtro = "pendientes" | "vencidos" | "factura" | "nota_credito" | "nota_debito" | "anulados" | "todos";

export function DocumentosLista({ documentos, puedeOperar }: { documentos: DocumentoCC[]; puedeOperar: boolean }) {
  const hoy = hoyUruguay();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [texto, setTexto] = useState("");
  const q = useDeferredValue(texto.trim().toLowerCase());
  const vencido = (d: DocumentoCC) => d.tipo !== "nota_credito" && d.saldo > 0 && !!d.vencimiento && diasEntre(d.vencimiento, hoy) > 0;
  const pasa = (d: DocumentoCC, f: Filtro) => {
    switch (f) {
      case "pendientes":
        return d.saldo > 0;
      case "vencidos":
        return vencido(d);
      case "anulados":
        return d.estado === "anulado";
      case "todos":
        return true;
      default:
        return d.tipo === f && d.estado !== "anulado";
    }
  };
  const lista = useMemo(
    () =>
      [...documentos]
        .reverse()
        .filter((d) => pasa(d, filtro))
        .filter((d) => !q || `${numeroDocumento(d)} ${d.proveedor} ${d.notas ?? ""}`.toLowerCase().includes(q)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [documentos, filtro, q]
  );
  const cuenta = (f: Filtro) => documentos.filter((d) => pasa(d, f)).length;

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Proveedores y compras"
        titulo="Facturas y notas"
        descripcion="Facturas, notas de crédito y notas de débito de proveedores, con su saldo pendiente."
      >
        {puedeOperar && (
          <>
            <BotonLink href="/admin/compras/documentos/nuevo?tipo=nota_credito" variante="secundario">
              Nota de crédito
            </BotonLink>
            <BotonLink href="/admin/compras/documentos/nuevo">
              <Plus className="size-4" />
              Cargar factura
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
          id="documentos"
          valor={filtro}
          onChange={setFiltro}
          opciones={[
            { valor: "todos", etiqueta: "Todos", cantidad: documentos.length },
            { valor: "pendientes", etiqueta: "Con saldo", cantidad: cuenta("pendientes") },
            { valor: "vencidos", etiqueta: "Vencidos", cantidad: cuenta("vencidos") },
            { valor: "factura", etiqueta: "Facturas", cantidad: cuenta("factura") },
            { valor: "nota_credito", etiqueta: "Notas de crédito", cantidad: cuenta("nota_credito") },
            { valor: "nota_debito", etiqueta: "Notas de débito", cantidad: cuenta("nota_debito") },
            { valor: "anulados", etiqueta: "Anulados", cantidad: cuenta("anulados") },
          ]}
        />
      </motion.div>

      {lista.length === 0 ? (
        <Vacio icono={FileText} titulo="No hay documentos con ese filtro" />
      ) : (
        <motion.ul layout className="space-y-2">
          <AnimatePresence mode="popLayout">
            {lista.map((d, i) => (
              <motion.li
                key={d.id}
                layout
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0, transition: { ...easeSmooth, delay: Math.min(i, 12) * 0.03 } }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
              >
                <motion.div whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 400, damping: 30 }}>
                  <Link
                    href={`/admin/compras/documentos/${d.id}`}
                    className={cn(
                      "group grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 rounded-2xl border bg-white px-4 py-3 transition-shadow hover:shadow-card-hover sm:grid-cols-[10rem_minmax(0,1fr)_9rem_10rem_auto] sm:items-center",
                      vencido(d) ? "border-rose-200" : "border-linea",
                      d.estado === "anulado" && "opacity-60"
                    )}
                  >
                    <div>
                      <div className={cn("font-heading text-sm text-bordo-800", d.estado === "anulado" && "line-through")}>
                        {numeroDocumento(d)}
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums">{formatFecha(d.fecha)}</div>
                    </div>
                    <div className="col-span-2 min-w-0 sm:col-span-1">
                      <div className="truncate text-sm font-medium">{d.proveedor}</div>
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <BadgeTipoDoc tipo={d.tipo} contado={d.contado} />
                        <BadgeSaldoDoc {...d} diasVencido={d.vencimiento ? diasEntre(d.vencimiento, hoy) : 0} />
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {d.vencimiento ? `Vence ${formatFecha(d.vencimiento)}` : d.contado ? "Contado" : ""}
                    </div>
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <BadgeMoneda moneda={d.moneda} />
                        <span className="font-heading tabular-nums">{formatImporte(d.total, d.moneda)}</span>
                      </div>
                      {d.saldo > 0 && d.saldo !== d.total && (
                        <div className="text-[11px] text-muted-foreground tabular-nums">saldo {formatImporte(d.saldo, d.moneda)}</div>
                      )}
                    </div>
                    <ArrowRight className="hidden size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block" />
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

export function DocumentoVista({ documento: d, puedeOperar }: { documento: DocumentoDetalle; puedeOperar: boolean }) {
  const hoy = hoyUruguay();
  const [anular, setAnular] = useState(false);
  const [aplicar, setAplicar] = useState(false);
  const dias = d.vencimiento ? diasEntre(d.vencimiento, hoy) : 0;
  const nombre = numeroDocumento(d);
  const tieneAplicaciones = d.aplicaciones.some((a) => a.vigente);
  const esNc = d.tipo === "nota_credito";

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow={NOMBRE_TIPO_DOC[d.tipo]}
        titulo={
          <span className={cn("flex flex-wrap items-center gap-3", d.estado === "anulado" && "line-through decoration-rose-400")}>
            {nombre}
          </span>
        }
        descripcion={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link href={`/admin/proveedores/${d.proveedor_id}`} className="inline-flex items-center gap-1 hover:text-bordo-800">
              <Truck className="size-3.5" />
              {d.proveedor}
            </Link>
            <BadgeTipoDoc tipo={d.tipo} contado={d.contado} />
            <BadgeSaldoDoc {...d} diasVencido={dias} />
            <LinkAsiento id={d.asiento_id} />
          </span>
        }
      >
        {puedeOperar && d.estado === "vigente" && !esNc && d.saldo > 0 && (
          <BotonLink href={`/admin/compras/pagos/nuevo?proveedor=${d.proveedor_id}&moneda=${d.moneda}&documento=${d.id}`}>
            <HandCoins className="size-4" />
            Pagar
          </BotonLink>
        )}
        {puedeOperar && d.estado === "vigente" && esNc && d.saldo > 0 && (
          <Boton onClick={() => setAplicar(true)}>
            <Link2 className="size-4" />
            Aplicar a una factura
          </Boton>
        )}
        {puedeOperar && d.estado === "vigente" && (
          <Boton variante="peligro" onClick={() => setAnular(true)}>
            <Ban className="size-4" />
            Anular
          </Boton>
        )}
      </EncabezadoPagina>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Total" delay={0.05} detalle={d.moneda !== "UYU" ? `TC ${String(d.tc).replace(".", ",")} · ${formatImporte(d.total * d.tc, "UYU")}` : undefined}>
          {formatImporte(d.total, d.moneda)}
        </Kpi>
        <Kpi etiqueta={esNc ? "Sin aplicar" : "Saldo pendiente"} tono={!esNc && dias > 0 && d.saldo > 0 ? "alerta" : d.saldo === 0 ? "bueno" : "neutro"} delay={0.1}>
          {formatImporte(d.saldo, d.moneda)}
        </Kpi>
        <Kpi etiqueta="Fecha" delay={0.15}>
          {formatFecha(d.fecha)}
        </Kpi>
        <Kpi
          etiqueta={d.contado ? "Pagada desde" : "Vencimiento"}
          tono={!d.contado && dias > 0 && d.saldo > 0 ? "alerta" : "neutro"}
          detalle={!d.contado && d.vencimiento && d.saldo > 0 ? (dias > 0 ? `Vencida hace ${dias} días` : dias === 0 ? "Vence hoy" : `Faltan ${-dias} días`) : undefined}
          delay={0.2}
        >
          <span className="text-base">{d.contado ? d.cuenta_pago ?? "Caja/banco" : d.vencimiento ? formatFecha(d.vencimiento) : "—"}</span>
        </Kpi>
      </div>

      {d.comprometido > 0 && (
        <div className="rounded-2xl border border-dorado-300 bg-dorado-50 px-4 py-3 text-sm text-dorado-900">
          {formatImporte(d.comprometido, d.moneda)} de este documento están en una orden de pago pendiente de pagar.
        </div>
      )}

      <Panel titulo="Líneas" icono={ListChecks} delay={0.1}>
        <motion.ul variants={staggerContainerFast} initial="hidden" animate="visible" className="divide-y divide-linea/70">
          {d.lineas.map((l) => (
            <motion.li key={l.id} variants={fadeInUp} className="flex items-start gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{l.descripcion}</span>
                  {l.cantidad !== null && <span className="text-xs text-muted-foreground">× {l.cantidad}</span>}
                </div>
                {l.detalle &&
                  (l.href ? (
                    <Link href={l.href} className="text-xs text-muted-foreground hover:text-bordo-800 hover:underline">
                      {l.detalle}
                    </Link>
                  ) : (
                    <div className="text-xs text-muted-foreground">{l.detalle}</div>
                  ))}
              </div>
              <span className="font-heading tabular-nums">{formatImporte(l.importe, d.moneda)}</span>
            </motion.li>
          ))}
        </motion.ul>
        {d.notas && <p className="border-t border-linea px-4 py-2 text-xs text-muted-foreground">{d.notas}</p>}
      </Panel>

      <Panel titulo={esNc ? "Aplicada a" : "Pagos y notas aplicados"} icono={Receipt} delay={0.15}>
        {d.aplicaciones.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {d.contado ? "Pagada al contado." : esNc ? "Todavía no se aplicó." : "Sin pagos todavía."}
          </p>
        ) : (
          <ul className="divide-y divide-linea/70">
            {d.aplicaciones.map((a) => (
              <li key={a.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm", !a.vigente && "opacity-60")}>
                <Link href={a.href} className="font-medium hover:text-bordo-800 hover:underline">
                  {a.descripcion}
                </Link>
                <span className="text-xs text-muted-foreground tabular-nums">{formatFecha(a.fecha)}</span>
                {!a.vigente && <span className="text-[11px] text-muted-foreground">(no vigente)</span>}
                <span className="ml-auto flex items-center gap-2">
                  <span className="tabular-nums">{formatImporte(a.importe, d.moneda)}</span>
                  <LinkAsiento id={a.asiento_id} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <AnularDialog
        open={anular}
        onOpenChange={setAnular}
        tipo="documento"
        id={d.id}
        nombre={nombre}
        aviso={
          tieneAplicaciones
            ? "Este documento tiene pagos o notas aplicados: la base no deja anularlo hasta anular esas aplicaciones (anulando la orden de pago)."
            : undefined
        }
      />
      {esNc && (
        <AplicarDialog
          open={aplicar}
          onOpenChange={setAplicar}
          origen={{ tipo: "nota_credito", id: d.id, nombre }}
          proveedorId={d.proveedor_id}
          moneda={d.moneda}
          disponible={d.saldo}
        />
      )}
    </div>
  );
}
