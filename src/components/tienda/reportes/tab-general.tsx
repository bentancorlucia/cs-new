"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Ban, HandHeart, Hammer } from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { easeSmooth, fadeInUp, springSmooth, staggerContainer, staggerContainerFast } from "@/lib/motion";
import { formatImporte } from "@/lib/contabilidad/formato";
import { NOMBRE_CANAL, etiquetaBucket, formatPct, nombreMetodo } from "@/lib/reportes/etiquetas";
import { ImporteAnimado } from "@/components/contabilidad/reportes/importe-animado";
import { KpiCard } from "./kpi-card";
import { ControlContableCard } from "./control-contable";
import type { Canal, ReporteTienda, SerieVentas } from "@/types/reportes";

const fmt = (v: number) => formatImporte(v, "UYU");
const CANALES: Canal[] = ["online", "pos", "disciplina"];
const COLOR: Record<Canal, string> = { online: "#730d32", pos: "#f7b643", disciplina: "#0d7377" };

function compacto(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString("es-UY", { maximumFractionDigits: 1 })} M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toLocaleString("es-UY", { maximumFractionDigits: 1 })} k`;
  return v.toLocaleString("es-UY", { maximumFractionDigits: 0 });
}

export function Tarjeta({
  titulo,
  subtitulo,
  children,
  className,
}: {
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      variants={fadeInUp}
      transition={springSmooth}
      className={cn("reporte-tarjeta rounded-2xl border border-linea bg-white p-4 shadow-sm sm:p-5", className)}
    >
      <h2 className="font-heading text-sm text-foreground">{titulo}</h2>
      {subtitulo && <p className="text-xs text-muted-foreground">{subtitulo}</p>}
      <div className="mt-3">{children}</div>
    </motion.section>
  );
}

export function Barra({ pct, color = "bg-bordo-800", delay = 0 }: { pct: number; color?: string; delay?: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-superficie">
      <motion.div
        className={cn("h-full rounded-full", color)}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        transition={{ ...easeSmooth, delay }}
      />
    </div>
  );
}

function TooltipSerie({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload?: SerieVentas }[];
  label?: string;
}) {
  const s = payload?.[0]?.payload;
  if (!active || !s || !label) return null;
  return (
    <div className="min-w-[210px] rounded-xl border border-linea bg-white/95 px-4 py-3 text-sm shadow-lg backdrop-blur-sm">
      <p className="mb-1.5 text-xs font-heading text-muted-foreground">{etiquetaBucket(label)}</p>
      {CANALES.map((c) => (
        <div key={c} className="flex justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: COLOR[c] }} />
            {NOMBRE_CANAL[c]}
          </span>
          <span className="tabular-nums">{fmt(s[c])}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between gap-4 border-t border-linea pt-1 font-heading">
        <span>Ventas netas</span>
        <span className="tabular-nums">{fmt(s.ventas)}</span>
      </div>
      <div className="flex justify-between gap-4 text-muted-foreground">
        <span>Costo</span>
        <span className="tabular-nums">{fmt(s.costo)}</span>
      </div>
      <div className="flex justify-between gap-4 text-muted-foreground">
        <span>Pedidos</span>
        <span className="tabular-nums">{s.pedidos}</span>
      </div>
      {s.promocodesActivos.length > 0 && (
        <p className="mt-1 text-[11px] text-dorado-700">Promocodes: {s.promocodesActivos.join(", ")}</p>
      )}
    </div>
  );
}

/** Tramos consecutivos con algún promocode vigente (franjas del gráfico). */
function tramosPromo(serie: SerieVentas[]) {
  const tramos: { desde: string; hasta: string; codigos: string }[] = [];
  let actual: { desde: string; hasta: string; codigos: string } | null = null;
  for (const s of serie) {
    const cod = s.promocodesActivos.join(", ");
    if (cod && actual && actual.codigos === cod) actual.hasta = s.fecha;
    else {
      if (actual) tramos.push(actual);
      actual = cod ? { desde: s.fecha, hasta: s.fecha, codigos: cod } : null;
    }
  }
  if (actual) tramos.push(actual);
  return tramos;
}

export function TabGeneral({ data }: { data: ReporteTienda }) {
  const tramos = useMemo(() => tramosPromo(data.serie), [data.serie]);
  const maxCanal = Math.max(1, ...data.porCanal.map((c) => Math.abs(c.ventas)));
  const maxMetodo = Math.max(1, ...data.porMetodoPago.map((m) => Math.abs(m.ventas)));
  const maxCat = Math.max(1, ...data.margenPorCategoria.map((c) => Math.abs(c.margen)));
  const comp = data.composicion;

  return (
    <div className="space-y-5">
      <ControlContableCard
        controles={[data.control, data.controlCosto]}
        descripcion="Ventas netas = saldo de las cuentas de ventas (4.4.x) y costo = costo de ventas, en los asientos confirmados del período (centro Tienda y disciplinas)."
      />

      {data.unidadesSinCosto > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>{data.unidadesSinCosto}</strong> unidades vendidas no tienen costo en el kardex (o son encargues, que se
            costean por compras): cuentan a costo 0 y el margen queda <strong>sobreestimado</strong>. Cargá el costo en el
            inventario inicial o las recepciones.
          </span>
        </motion.div>
      )}

      {/* KPIs */}
      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Ventas netas" valor={data.ventas.valor} delta={data.ventas} tono="bordo" hint="sin donaciones" />
        <KpiCard label="Costo de lo vendido" valor={data.costo.valor} delta={data.costo} sentido="inverso" hint="kardex" />
        <KpiCard
          label="Margen bruto"
          valor={data.margen.valor}
          delta={data.margen}
          tono={data.margen.valor < 0 ? "negativo" : "positivo"}
        />
        <KpiCard label="Margen %" valor={data.margenPct.valor} formato="pct" delta={data.margenPct} />
        <KpiCard label="Pedidos vendidos" valor={data.pedidos.valor} formato="entero" delta={data.pedidos} />
        <KpiCard label="Ticket promedio" valor={data.ticketPromedio.valor} delta={data.ticketPromedio} hint="cobrado sin donación" />
        <KpiCard
          label="% a socios"
          valor={data.ventasSocioPct.valor}
          formato="pct"
          delta={data.ventasSocioPct}
          sentido="neutro"
          hint="de las ventas minoristas"
        />
        <KpiCard
          label="Ventas a disciplinas"
          valor={data.porCanal.find((c) => c.canal === "disciplina")?.ventas ?? 0}
          hint={`${data.porCanal.find((c) => c.canal === "disciplina")?.pedidos ?? 0} pedidos mayoristas`}
        />
      </motion.div>

      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid gap-4 lg:grid-cols-2">
        {/* Composición */}
        <Tarjeta titulo="De dónde salen las ventas netas" subtitulo="Cada importe a su fecha contable">
          <ul className="space-y-2 text-sm">
            {[
              { l: "Ventas de los pedidos del período", v: comp.ventasPedidos },
              { l: "+ Encargues entregados (se reconocen al retirarlos)", v: comp.encarguesEntregados },
              { l: "− Devoluciones", v: comp.devoluciones },
              { l: "+ Cambios: lo nuevo entregado", v: comp.cambios },
            ].map((x) => (
              <li key={x.l} className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">{x.l}</span>
                <span className={cn("shrink-0 whitespace-nowrap tabular-nums", x.v < 0 && "text-red-700")}>{fmt(x.v)}</span>
              </li>
            ))}
            <li className="flex items-baseline justify-between gap-3 border-t border-linea pt-2 font-heading">
              <span>= Ventas netas</span>
              <span className="tabular-nums text-bordo-800">
                <ImporteAnimado valor={comp.ventasNetas} moneda="UYU" />
              </span>
            </li>
          </ul>
        </Tarjeta>

        {/* Fuera de las ventas */}
        <Tarjeta titulo="Cobrado que no es venta" subtitulo="Se informa aparte para no inflar las ventas">
          <motion.ul variants={staggerContainerFast} initial="hidden" animate="visible" className="space-y-3 text-sm">
            {[
              {
                icon: Hammer,
                color: "text-purple-700 bg-purple-50",
                l: "Encargues sin entregar",
                d: `${data.encarguesPendientes.pedidos} pedidos del período · seña hasta que se retiran`,
                v: data.encarguesPendientes.importe,
              },
              {
                icon: HandHeart,
                color: "text-emerald-700 bg-emerald-50",
                l: "Donaciones para la Olla",
                d: `${data.donaciones.pedidos} pedidos · se transfieren, no son ingreso`,
                v: data.donaciones.importe,
              },
              {
                icon: Ban,
                color: "text-red-700 bg-red-50",
                l: "Ventas anuladas",
                d: `${data.anuladas.pedidos} pedidos del período cancelados · no cuentan`,
                v: data.anuladas.importe,
              },
            ].map((x) => (
              <motion.li key={x.l} variants={fadeInUp} className="flex items-center gap-3">
                <span className={cn("rounded-lg p-2", x.color)}>
                  <x.icon className="size-4" strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block">{x.l}</span>
                  <span className="block text-[11px] text-muted-foreground">{x.d}</span>
                </span>
                <span className="shrink-0 whitespace-nowrap tabular-nums font-heading">{fmt(x.v)}</span>
              </motion.li>
            ))}
          </motion.ul>
        </Tarjeta>
      </motion.div>

      {/* Evolución */}
      <motion.div variants={staggerContainer} initial="hidden" animate="visible">
        <Tarjeta
          titulo="Evolución"
          subtitulo={`Ventas netas por canal y costo, ${data.serie[0]?.fecha.includes("W") ? "por semana" : "por día"}${tramos.length ? " · franjas: promocodes vigentes" : ""}`}
        >
          <div className="h-64 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.serie} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8e4de" />
                <XAxis
                  dataKey="fecha"
                  tickFormatter={etiquetaBucket}
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={16}
                />
                <YAxis tickFormatter={compacto} tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} width={48} />
                <Tooltip content={<TooltipSerie />} />
                {tramos.map((t) => (
                  <ReferenceArea key={`${t.desde}-${t.codigos}`} x1={t.desde} x2={t.hasta} fill="#f7b643" fillOpacity={0.12} strokeOpacity={0} />
                ))}
                {CANALES.map((c) => (
                  <Area
                    key={c}
                    type="monotone"
                    dataKey={c}
                    stackId="v"
                    stroke={COLOR[c]}
                    fill={COLOR[c]}
                    fillOpacity={0.18}
                    strokeWidth={2}
                    animationDuration={700}
                  />
                ))}
                <Line type="monotone" dataKey="costo" stroke="#6b7280" strokeDasharray="4 4" dot={false} strokeWidth={1.5} animationDuration={700} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            {CANALES.map((c) => (
              <span key={c} className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: COLOR[c] }} />
                {NOMBRE_CANAL[c]}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="h-px w-4 border-t border-dashed border-gray-500" />
              Costo
            </span>
          </div>
        </Tarjeta>
      </motion.div>

      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid gap-4 lg:grid-cols-3">
        <Tarjeta titulo="Por canal" subtitulo="Sin mezclar online, POS y disciplinas">
          <ul className="space-y-3">
            {data.porCanal.map((c, i) => (
              <li key={c.canal}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: COLOR[c.canal] }} />
                    {NOMBRE_CANAL[c.canal]}
                  </span>
                  <span className="tabular-nums font-heading">{fmt(c.ventas)}</span>
                </div>
                <Barra pct={(Math.abs(c.ventas) / maxCanal) * 100} delay={i * 0.06} />
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {c.pedidos} pedidos · margen {fmt(c.margen)} ({formatPct(c.ventas ? (c.margen / c.ventas) * 100 : null)})
                </p>
              </li>
            ))}
          </ul>
        </Tarjeta>

        <Tarjeta titulo="Por cuenta contable" subtitulo="Socio o no socio según la cuenta de la venta">
          <ul className="divide-y divide-linea text-sm">
            {data.porCuenta.map((c) => (
              <li key={c.rol} className="flex items-baseline justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="font-mono text-[11px] text-muted-foreground">{c.codigo}</span> {c.nombre}
                </span>
                <span className={cn("shrink-0 tabular-nums", c.ventas < 0 && "text-red-700")}>{fmt(c.ventas)}</span>
              </li>
            ))}
            <li className="flex items-baseline justify-between gap-2 py-2 font-heading">
              <span>Total</span>
              <span className="tabular-nums">{fmt(data.ventas.valor)}</span>
            </li>
          </ul>
        </Tarjeta>

        <Tarjeta titulo="Por método de pago" subtitulo="Del pedido; devoluciones y cambios aparte">
          {data.porMetodoPago.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Sin ventas en el rango.</p>
          ) : (
            <ul className="space-y-3">
              {data.porMetodoPago.map((m, i) => (
                <li key={m.clave}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span>{nombreMetodo(m.clave)}</span>
                    <span className={cn("tabular-nums font-heading", m.ventas < 0 && "text-red-700")}>{fmt(m.ventas)}</span>
                  </div>
                  <Barra pct={(Math.abs(m.ventas) / maxMetodo) * 100} color={m.clave === "devoluciones" ? "bg-red-400" : "bg-dorado-400"} delay={i * 0.06} />
                  {m.clave !== "devoluciones" && <p className="mt-0.5 text-[10px] text-muted-foreground">{m.pedidos} pedidos</p>}
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </motion.div>

      {/* Top productos */}
      <motion.div variants={staggerContainer} initial="hidden" animate="visible">
        <Tarjeta titulo="Productos más vendidos" subtitulo="Facturación con el descuento del pedido prorrateado; devoluciones y cambios incluidos">
          {data.topProductos.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sin ventas en el rango.</p>
          ) : (
            <div className="reporte-scroll -mx-4 overflow-x-auto sm:mx-0">
              <table className="reporte-tabla w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-linea text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2 font-heading sm:px-2">Producto</th>
                    <th className="px-2 py-2 text-right font-heading">Unid.</th>
                    <th className="px-2 py-2 text-right font-heading">Facturación</th>
                    <th className="px-2 py-2 text-right font-heading">Costo</th>
                    <th className="px-2 py-2 text-right font-heading">Margen</th>
                    <th className="px-4 py-2 text-right font-heading sm:px-2">Margen %</th>
                  </tr>
                </thead>
                <motion.tbody variants={staggerContainerFast} initial="hidden" animate="visible" className="divide-y divide-linea">
                  {data.topProductos.map((p) => (
                    <motion.tr key={p.producto_id} variants={fadeInUp} className="transition-colors hover:bg-superficie/60">
                      <td className="px-4 py-2 sm:px-2">
                        <span className="block">{p.nombre}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {p.categoria}
                          {p.sku ? ` · ${p.sku}` : ""}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{p.unidades}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{fmt(p.facturacion)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{fmt(p.costo)}</td>
                      <td className={cn("px-2 py-2 text-right tabular-nums", p.margen < 0 && "text-red-700")}>{fmt(p.margen)}</td>
                      <td className="px-4 py-2 text-right tabular-nums sm:px-2">{formatPct(p.margenPct)}</td>
                    </motion.tr>
                  ))}
                </motion.tbody>
              </table>
            </div>
          )}
        </Tarjeta>
      </motion.div>

      {/* Margen por categoría */}
      <motion.div variants={staggerContainer} initial="hidden" animate="visible">
        <Tarjeta titulo="Margen por categoría" subtitulo="Mismo prorrateo de descuentos que la venta">
          {data.margenPorCategoria.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Sin ventas en el rango.</p>
          ) : (
            <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {data.margenPorCategoria.map((c, i) => (
                <li key={c.nombre}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate">{c.nombre}</span>
                    <span className={cn("shrink-0 tabular-nums font-heading", c.margen < 0 && "text-red-700")}>{fmt(c.margen)}</span>
                  </div>
                  <Barra pct={(Math.abs(c.margen) / maxCat) * 100} color={c.margen < 0 ? "bg-red-400" : "bg-emerald-600"} delay={i * 0.05} />
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {c.unidades} u. · facturación {fmt(c.facturacion)} · costo {fmt(c.costo)} · {formatPct(c.margenPct)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </motion.div>
    </div>
  );
}
