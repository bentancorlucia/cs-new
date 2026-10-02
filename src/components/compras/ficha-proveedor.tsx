"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  CalendarClock,
  FileText,
  HandCoins,
  History,
  Mail,
  MapPin,
  PackagePlus,
  Pencil,
  Phone,
  Receipt,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth, fadeInUp, staggerContainerFast } from "@/lib/motion";
import {
  NOMBRE_TRAMO,
  numeroDocumento,
  tramoAntiguedad,
  type TramoAntiguedad,
} from "@/lib/comercial/compras-esquemas";
import type { CatalogoContable, FichaProveedor } from "@/lib/comercial/compras";
import { ProveedorDialog } from "./proveedor-dialog";
import { AplicarDialog } from "./dialogos";
import {
  BadgeEstadoOrden,
  BadgeEstadoPago,
  BadgeMoneda,
  BadgeSaldoDoc,
  Boton,
  BotonLink,
  EncabezadoPagina,
  Filtros,
  ImporteAnimado,
  Kpi,
  LinkAsiento,
  Panel,
} from "./ui";

const TRAMOS: TramoAntiguedad[] = ["a_vencer", "0_30", "31_60", "61_90", "90_mas"];
const COLOR_TRAMO: Record<TramoAntiguedad, string> = {
  a_vencer: "bg-emerald-500",
  "0_30": "bg-dorado-400",
  "31_60": "bg-amber-500",
  "61_90": "bg-orange-600",
  "90_mas": "bg-rose-600",
};

export function FichaProveedorVista({
  ficha,
  catalogo,
  puedeOperar,
}: {
  ficha: FichaProveedor;
  catalogo: CatalogoContable;
  puedeOperar: boolean;
}) {
  const { proveedor: p, saldos, movimientos, pendientes, notasCredito, anticipos, pagosPendientes, ordenesAbiertas } = ficha;
  const [editar, setEditar] = useState(false);
  const [aplicar, setAplicar] = useState<{
    tipo: "nota_credito" | "anticipo";
    id: number;
    nombre: string;
    moneda: string;
    disponible: number;
  } | null>(null);

  const monedas = useMemo(() => {
    const s = new Set(movimientos.map((m) => m.moneda));
    if (s.size === 0) s.add(p.condiciones?.moneda ?? "UYU");
    return [...s].sort((a) => (a === "UYU" ? -1 : 1));
  }, [movimientos, p.condiciones]);
  const [moneda, setMoneda] = useState(monedas[0]);

  const antiguedad = useMemo(() => {
    const m = new Map<string, Record<TramoAntiguedad, number>>();
    for (const d of pendientes) {
      const r = m.get(d.moneda) ?? { a_vencer: 0, "0_30": 0, "31_60": 0, "61_90": 0, "90_mas": 0 };
      r[tramoAntiguedad(d.diasVencido)] += d.saldo;
      m.set(d.moneda, r);
    }
    return [...m.entries()];
  }, [pendientes]);

  const q = `proveedor=${p.id}`;
  const movsMoneda = movimientos.filter((m) => m.moneda === moneda);

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Ficha de proveedor"
        titulo={p.nombre}
        descripcion={
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            {p.rut && <span className="font-mono">RUT {p.rut}</span>}
            {p.razon_social && <span>{p.razon_social}</span>}
            {p.contacto_nombre && <span>{p.contacto_nombre}</span>}
            {p.contacto_telefono && (
              <a href={`tel:${p.contacto_telefono}`} className="inline-flex items-center gap-1 hover:text-bordo-800">
                <Phone className="size-3" />
                {p.contacto_telefono}
              </a>
            )}
            {p.contacto_email && (
              <a href={`mailto:${p.contacto_email}`} className="inline-flex items-center gap-1 hover:text-bordo-800">
                <Mail className="size-3" />
                {p.contacto_email}
              </a>
            )}
            {p.direccion && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {p.direccion}
              </span>
            )}
            {!p.activo && <span className="rounded-full bg-superficie px-2">Inactivo</span>}
          </span>
        }
      >
        {puedeOperar && (
          <Boton variante="secundario" onClick={() => setEditar(true)}>
            <Pencil className="size-4" />
            Editar
          </Boton>
        )}
      </EncabezadoPagina>

      {puedeOperar && (
        <motion.div
          variants={staggerContainerFast}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {[
            { href: `/admin/compras/documentos/nuevo?${q}`, icono: Receipt, texto: "Nueva factura" },
            { href: `/admin/compras/pagos/nuevo?${q}`, icono: HandCoins, texto: "Nueva orden de pago" },
            { href: `/admin/compras/ordenes/nueva?${q}`, icono: ShoppingCart, texto: "Nueva orden de compra" },
            { href: `/admin/compras/recepciones/nueva?${q}`, icono: PackagePlus, texto: "Recibir sin orden" },
          ].map((a) => (
            <motion.div key={a.href} variants={fadeInUp} whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>
              <Link
                href={a.href}
                className="flex h-full items-center gap-2 rounded-2xl border border-linea bg-white px-3 py-3 text-sm font-medium text-foreground transition-colors hover:border-bordo-200 hover:text-bordo-800"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-bordo-50 text-bordo-800">
                  <a.icono className="size-4" />
                </span>
                {a.texto}
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Saldos */}
      <div className="grid gap-3 sm:grid-cols-2">
        {(saldos.length ? saldos : [{ moneda: p.condiciones?.moneda ?? "UYU", deuda: 0, aFavor: 0, neto: 0, vencido: 0 }]).map(
          (s, i) => (
            <Kpi
              key={s.moneda}
              etiqueta={`Saldo en ${s.moneda === "USD" ? "dólares" : "pesos"}`}
              tono={s.vencido > 0 ? "alerta" : s.neto < 0 ? "bueno" : "neutro"}
              delay={0.05 * i}
              detalle={
                <span className="flex flex-wrap gap-x-3">
                  <span>Documentos {formatImporte(s.deuda, s.moneda)}</span>
                  {s.aFavor > 0 && <span>A favor {formatImporte(s.aFavor, s.moneda)}</span>}
                  {s.vencido > 0 && <span className="text-rose-700">Vencido {formatImporte(s.vencido, s.moneda)}</span>}
                </span>
              }
            >
              <span className="flex items-baseline gap-2">
                <ImporteAnimado valor={Math.abs(s.neto)} moneda={s.moneda} />
                <span className="text-xs font-normal text-muted-foreground">
                  {s.neto > 0 ? "le debemos" : s.neto < 0 ? "a favor del club" : "al día"}
                </span>
              </span>
            </Kpi>
          )
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          {/* Pendientes */}
          <Panel
            titulo={`Documentos pendientes (${pendientes.length})`}
            icono={CalendarClock}
            delay={0.05}
            accion={
              puedeOperar && pendientes.length > 0 ? (
                <BotonLink href={`/admin/compras/pagos/nuevo?${q}`} variante="secundario" className="h-8 px-3 text-xs">
                  <HandCoins className="size-3.5" />
                  Pagar
                </BotonLink>
              ) : undefined
            }
          >
            {antiguedad.length > 0 && (
              <div className="space-y-3 border-b border-linea px-4 py-3">
                {antiguedad.map(([mon, r]) => {
                  const total = TRAMOS.reduce((s, t) => s + r[t], 0) || 1;
                  return (
                    <div key={mon} className="space-y-1.5">
                      <div className="flex h-2.5 overflow-hidden rounded-full bg-superficie">
                        {TRAMOS.map((t, i) =>
                          r[t] > 0 ? (
                            <motion.div
                              key={t}
                              initial={{ width: 0 }}
                              animate={{ width: `${(r[t] / total) * 100}%` }}
                              transition={{ duration: 0.7, delay: 0.1 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                              className={COLOR_TRAMO[t]}
                              title={`${NOMBRE_TRAMO[t]}: ${formatImporte(r[t], mon)}`}
                            />
                          ) : null
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <BadgeMoneda moneda={mon} />
                        {TRAMOS.filter((t) => r[t] > 0).map((t) => (
                          <span key={t} className="inline-flex items-center gap-1">
                            <span className={cn("size-2 rounded-full", COLOR_TRAMO[t])} />
                            {NOMBRE_TRAMO[t]} <b className="tabular-nums text-foreground">{formatImporte(r[t], mon)}</b>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {pendientes.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">No hay facturas pendientes.</p>
            ) : (
              <ul className="divide-y divide-linea/70">
                {pendientes.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/admin/compras/documentos/${d.id}`}
                      className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm transition-colors hover:bg-superficie/60"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{numeroDocumento(d)}</span>
                          <BadgeSaldoDoc {...d} />
                        </div>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {formatFecha(d.fecha)} · vence {formatFecha(d.vencimiento)}
                          {d.comprometido > 0 && ` · ${formatImporte(d.comprometido, d.moneda)} en orden de pago`}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-heading tabular-nums">{formatImporte(d.saldo, d.moneda)}</div>
                        {d.saldo < d.total && (
                          <div className="text-[11px] text-muted-foreground tabular-nums">de {formatImporte(d.total, d.moneda)}</div>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Estado de cuenta */}
          <Panel
            titulo="Estado de cuenta"
            icono={History}
            delay={0.1}
            accion={
              monedas.length > 1 ? (
                <Filtros id="ficha-moneda" valor={moneda} onChange={setMoneda} opciones={monedas.map((m) => ({ valor: m, etiqueta: m }))} />
              ) : (
                <BadgeMoneda moneda={moneda} />
              )
            }
          >
            {movsMoneda.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Sin movimientos todavía.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-linea text-[10px] uppercase tracking-editorial text-muted-foreground">
                      <th className="px-4 py-2 text-left font-normal">Fecha</th>
                      <th className="px-2 py-2 text-left font-normal">Movimiento</th>
                      <th className="px-2 py-2 text-right font-normal">Debe</th>
                      <th className="px-2 py-2 text-right font-normal">Haber</th>
                      <th className="px-4 py-2 text-right font-normal">Saldo</th>
                    </tr>
                  </thead>
                  <AnimatePresence mode="wait">
                    <motion.tbody
                      key={moneda}
                      initial="hidden"
                      animate="visible"
                      variants={staggerContainerFast}
                      className="divide-y divide-linea/60"
                    >
                      {movsMoneda.map((m) => (
                        <motion.tr
                          key={m.clave}
                          variants={fadeInUp}
                          className={cn(m.tipo === "aplicacion" && "bg-superficie/40 text-muted-foreground", m.anulado && "opacity-60")}
                        >
                          <td className="px-4 py-2 whitespace-nowrap tabular-nums">{formatFecha(m.fecha)}</td>
                          <td className="px-2 py-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {m.href ? (
                                <Link href={m.href} className={cn("hover:text-bordo-800 hover:underline", m.anulado && "line-through")}>
                                  {m.descripcion}
                                </Link>
                              ) : (
                                <span>{m.descripcion}</span>
                              )}
                              {m.anulado && <span className="text-[11px] text-rose-700">anulado</span>}
                              {m.contado && <span className="text-[11px] text-emerald-700">contado</span>}
                              <LinkAsiento id={m.asiento_id} className="px-1.5 py-0 text-[10px]" />
                            </div>
                            {m.detalle && !m.contado && (
                              <div className="text-[11px] text-muted-foreground">
                                {m.detalle.startsWith("Vence ") ? `Vence ${formatFecha(m.detalle.slice(6))}` : m.detalle}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{m.debe ? formatImporte(m.debe) : ""}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{m.haber ? formatImporte(m.haber) : ""}</td>
                          <td className={cn("px-4 py-2 text-right font-medium tabular-nums", m.saldo < 0 && "text-emerald-700")}>
                            {m.tipo === "aplicacion" ? "" : formatImporte(m.saldo)}
                          </td>
                        </motion.tr>
                      ))}
                    </motion.tbody>
                  </AnimatePresence>
                </table>
              </div>
            )}
            <p className="border-t border-linea px-4 py-2 text-[11px] text-muted-foreground">
              Debe = facturas y notas de débito · Haber = notas de crédito y pagos. Saldo positivo: le debemos.
            </p>
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <Panel titulo="Saldos a favor" icono={Wallet} delay={0.15}>
            {notasCredito.length + anticipos.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Sin anticipos ni notas de crédito sin aplicar.</p>
            ) : (
              <ul className="divide-y divide-linea/70">
                {anticipos.map((a) => (
                  <li key={`p${a.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/compras/pagos/${a.id}`} className="font-medium hover:text-bordo-800">
                        Anticipo {a.numero}
                      </Link>
                      <div className="text-xs text-muted-foreground">Pagado {formatFecha(a.fecha_pago)}</div>
                    </div>
                    <span className="font-heading tabular-nums">{formatImporte(a.saldo, a.moneda)}</span>
                    {puedeOperar && (
                      <Boton
                        variante="secundario"
                        className="h-8 px-3 text-xs"
                        onClick={() =>
                          setAplicar({ tipo: "anticipo", id: a.id, nombre: `anticipo ${a.numero}`, moneda: a.moneda, disponible: a.saldo })
                        }
                      >
                        Aplicar
                      </Boton>
                    )}
                  </li>
                ))}
                {notasCredito.map((n) => (
                  <li key={`n${n.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/compras/documentos/${n.id}`} className="font-medium hover:text-bordo-800">
                        {numeroDocumento(n)}
                      </Link>
                      <div className="text-xs text-muted-foreground">{formatFecha(n.fecha)}</div>
                    </div>
                    <span className="font-heading tabular-nums">{formatImporte(n.saldo, n.moneda)}</span>
                    {puedeOperar && (
                      <Boton
                        variante="secundario"
                        className="h-8 px-3 text-xs"
                        onClick={() =>
                          setAplicar({ tipo: "nota_credito", id: n.id, nombre: numeroDocumento(n), moneda: n.moneda, disponible: n.saldo })
                        }
                      >
                        Aplicar
                      </Boton>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel titulo="Órdenes de pago pendientes" icono={HandCoins} delay={0.2}>
            {pagosPendientes.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">No hay órdenes de pago sin pagar.</p>
            ) : (
              <ul className="divide-y divide-linea/70">
                {pagosPendientes.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/admin/compras/pagos/${o.id}`}
                      className="group flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-superficie/60"
                    >
                      <span className="font-medium">{o.numero}</span>
                      <BadgeEstadoPago estado={o.estado} />
                      <span className="ml-auto font-heading tabular-nums">{formatImporte(o.importe, o.moneda)}</span>
                      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel titulo="Órdenes de compra abiertas" icono={ShoppingCart} delay={0.25}>
            {ordenesAbiertas.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">No hay órdenes de compra abiertas.</p>
            ) : (
              <ul className="divide-y divide-linea/70">
                {ordenesAbiertas.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/admin/compras/ordenes/${o.id}`}
                      className="group flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-superficie/60"
                    >
                      <span className="font-medium">{o.numero}</span>
                      <BadgeEstadoOrden estado={o.estado} />
                      <span className="ml-auto font-heading tabular-nums">{formatImporte(o.total, o.moneda)}</span>
                      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {p.notas && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...easeSmooth, delay: 0.3 }}
              className="rounded-2xl border border-linea bg-white p-4 text-sm text-muted-foreground"
            >
              <div className="mb-1 flex items-center gap-2 font-heading text-xs uppercase tracking-editorial text-foreground">
                <FileText className="size-3.5" /> Notas
              </div>
              <p className="whitespace-pre-line">{p.notas}</p>
            </motion.div>
          )}
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            Condiciones: {p.condiciones ? `${p.condiciones.moneda} · ${p.condiciones.plazo_dias} días` : "sin cargar (30 días por defecto)"}
          </div>
        </div>
      </div>

      <ProveedorDialog open={editar} onOpenChange={setEditar} proveedor={p} catalogo={catalogo} />
      {aplicar && (
        <AplicarDialog
          open={!!aplicar}
          onOpenChange={(o) => !o && setAplicar(null)}
          origen={{ tipo: aplicar.tipo, id: aplicar.id, nombre: aplicar.nombre }}
          proveedorId={p.id}
          moneda={aplicar.moneda}
          disponible={aplicar.disponible}
        />
      )}
    </div>
  );
}
