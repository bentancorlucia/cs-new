"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { springSmooth } from "@/lib/motion";
import { formatearMoneda, formatearMonedaCompacta } from "@/lib/tesoreria/conversion";
import { KpiCard } from "./kpi-card";
import type { ReporteTienda } from "@/types/reportes";

const PALETA = [
  "#730d32",
  "#f7b643",
  "#0d7377",
  "#c97064",
  "#4a5d6c",
  "#a64161",
  "#8a8b3d",
  "#d9a679",
  "#3d5a80",
  "#b56576",
];

const ESTADO_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  pendiente_verificacion: "Pendiente verif.",
  pagado: "Pagado",
  encargado: "Encargado",
  preparando: "Preparando",
  listo_retiro: "Listo retiro",
  retirado: "Retirado",
  cancelado: "Cancelado",
};

const METODO_LABELS: Record<string, string> = {
  mercadopago: "MercadoPago",
  efectivo: "Efectivo",
  mercadopago_qr: "MP QR",
  sin_metodo: "Sin método",
};

interface Props {
  data: ReporteTienda;
}

export function TabGeneral({ data }: Props) {
  const onlinePedidos = data.onlineVsPos.pedidosOnline;
  const posPedidos = data.onlineVsPos.pedidosPos;
  const promocodeSpans = computePromocodeSpans(data.serie);

  return (
    <div className="space-y-5">
      {/* Aviso de items sin costo */}
      {data.itemsSinCosto > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/40 p-3 text-xs font-body text-amber-900 dark:text-amber-200"
        >
          <strong>{data.itemsSinCosto}</strong> items en el rango no tienen datos
          de costo (PPP). Se excluyen del cálculo de COGS y margen.
        </motion.div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <KpiCard
          index={0}
          label="Ventas totales"
          value={formatearMoneda(data.ventas.valor, "UYU")}
          delta={data.ventas}
        />
        <KpiCard
          index={1}
          label="COGS"
          value={formatearMoneda(data.cogs.valor, "UYU")}
          delta={data.cogs}
        />
        <KpiCard
          index={2}
          label="Margen bruto"
          value={formatearMoneda(data.margen.valor, "UYU")}
          delta={data.margen}
          tone={data.margen.valor < 0 ? "negative" : "positive"}
        />
        <KpiCard
          index={3}
          label="Margen %"
          value={
            data.ventas.valor > 0
              ? `${data.margenPct.valor.toFixed(1)}%`
              : "—"
          }
          delta={data.margenPct}
        />
        <KpiCard
          index={4}
          label="Pedidos"
          value={data.pedidos.valor.toLocaleString("es-UY")}
          delta={data.pedidos}
        />
        <KpiCard
          index={5}
          label="Ticket promedio"
          value={formatearMoneda(data.ticketPromedio.valor, "UYU")}
          delta={data.ticketPromedio}
        />
        <KpiCard
          index={6}
          label="% ventas a socios"
          value={`${data.ventasSocioPct.valor.toFixed(1)}%`}
          delta={data.ventasSocioPct}
        />
        <KpiCard
          index={7}
          label="Online vs POS"
          value={`${onlinePedidos} / ${posPedidos}`}
          hint="pedidos online · pos"
        />
      </div>

      {/* Evolución temporal */}
      <EvolucionChart serie={data.serie} promocodeSpans={promocodeSpans} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Método de pago">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={data.porMetodoPago.map((m) => ({
                  name: METODO_LABELS[m.clave] || m.clave,
                  value: m.total,
                }))}
                dataKey="value"
                nameKey="name"
                outerRadius={85}
                innerRadius={45}
                paddingAngle={2}
              >
                {data.porMetodoPago.map((_, i) => (
                  <Cell key={i} fill={PALETA[i % PALETA.length]} />
                ))}
              </Pie>
              <Tooltip formatter={((v: number) => formatearMoneda(v, "UYU")) as never} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Online vs POS">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={[
                { canal: "Online", facturacion: data.onlineVsPos.online, pedidos: data.onlineVsPos.pedidosOnline },
                { canal: "POS", facturacion: data.onlineVsPos.pos, pedidos: data.onlineVsPos.pedidosPos },
              ]}
              margin={{ top: 5, right: 10, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="canal" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatearMonedaCompacta(Number(v), "UYU")} />
              <Tooltip formatter={((v: number) => formatearMoneda(v, "UYU")) as never} />
              <Bar dataKey="facturacion" name="Facturación" fill="#730d32" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Top productos */}
      <ChartCard title="Top 10 productos">
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left py-2 font-heading">Producto</th>
                <th className="text-right py-2 font-heading">Cantidad</th>
                <th className="text-right py-2 font-heading">Facturación</th>
                <th className="text-right py-2 font-heading">COGS</th>
                <th className="text-right py-2 font-heading">Margen</th>
                <th className="text-right py-2 font-heading">%</th>
              </tr>
            </thead>
            <tbody>
              {data.topProductos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-6 text-muted-foreground">
                    Sin ventas en el rango seleccionado
                  </td>
                </tr>
              ) : (
                data.topProductos.map((p, i) => (
                  <motion.tr
                    key={p.producto_id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...springSmooth, delay: i * 0.02 }}
                    className="border-b border-border/50 hover:bg-muted/40"
                  >
                    <td className="py-2 font-body">
                      <div className="font-medium text-foreground">{p.nombre}</div>
                      {p.sku && <div className="text-[10px] text-muted-foreground">{p.sku}</div>}
                    </td>
                    <td className="py-2 text-right font-mono">{p.cantidad}</td>
                    <td className="py-2 text-right font-mono">{formatearMoneda(p.facturacion, "UYU")}</td>
                    <td className="py-2 text-right font-mono text-muted-foreground">
                      {formatearMoneda(p.cogs, "UYU")}
                    </td>
                    <td
                      className={`py-2 text-right font-mono ${
                        p.margen < 0 ? "text-rose-600" : "text-emerald-700 dark:text-emerald-400"
                      }`}
                    >
                      {formatearMoneda(p.margen, "UYU")}
                    </td>
                    <td className="py-2 text-right font-mono text-muted-foreground">
                      {p.margenPct == null ? "—" : `${p.margenPct.toFixed(1)}%`}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Margen por categoría">
          <ResponsiveContainer width="100%" height={Math.max(200, data.margenPorCategoria.length * 32 + 40)}>
            <BarChart
              data={data.margenPorCategoria}
              layout="vertical"
              margin={{ top: 5, right: 10, bottom: 0, left: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatearMonedaCompacta(Number(v), "UYU")} />
              <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10 }} width={110} />
              <Tooltip formatter={((v: number) => formatearMoneda(v, "UYU")) as never} />
              <Bar dataKey="margen" name="Margen" fill="#0d7377" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Pedidos por estado">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={data.porEstado.map((e) => ({
                estado: ESTADO_LABELS[e.clave] || e.clave,
                cantidad: e.cantidad,
              }))}
              margin={{ top: 5, right: 10, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="estado" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="cantidad" name="Pedidos" fill="#f7b643" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springSmooth}
      className="rounded-2xl border border-border bg-card p-4 sm:p-5"
    >
      <h3 className="text-xs uppercase tracking-wider font-heading text-muted-foreground mb-3">
        {title}
      </h3>
      {children}
    </motion.div>
  );
}

type Metrica = "todo" | "montos" | "cantidad";
type TipoGrafico = "area" | "barras";

const METRICA_OPTS: { id: Metrica; label: string }[] = [
  { id: "todo", label: "Todo" },
  { id: "montos", label: "Montos" },
  { id: "cantidad", label: "Cantidad" },
];

const TIPO_OPTS: { id: TipoGrafico; label: string }[] = [
  { id: "area", label: "Área" },
  { id: "barras", label: "Barras" },
];

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-border bg-card p-0.5 text-[11px]">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`relative px-2.5 py-1 rounded-full font-heading transition-colors ${
            value === o.id
              ? "text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {value === o.id && (
            <motion.span
              layoutId={`seg-${options.map((x) => x.id).join("")}`}
              className="absolute inset-0 rounded-full bg-primary"
              transition={springSmooth}
            />
          )}
          <span className="relative z-10">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function EvolucionChart({
  serie,
  promocodeSpans,
}: {
  serie: ReporteTienda["serie"];
  promocodeSpans: { x1: string; x2: string }[];
}) {
  const [metrica, setMetrica] = useState<Metrica>("todo");
  const [tipo, setTipo] = useState<TipoGrafico>("area");

  const showMontos = metrica !== "cantidad";
  const showCantidad = metrica !== "montos";
  const refAxis = showMontos ? "money" : "cant";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springSmooth}
      className="rounded-2xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-xs uppercase tracking-wider font-heading text-muted-foreground">
          Evolución temporal
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={metrica} options={METRICA_OPTS} onChange={setMetrica} />
          <Segmented value={tipo} options={TIPO_OPTS} onChange={setTipo} />
        </div>
      </div>

      {promocodeSpans.length > 0 && (
        <div className="flex items-center gap-2 mb-2 text-[11px] text-muted-foreground font-body">
          <span className="inline-block h-3 w-5 rounded-sm bg-[#0d7377]/15 border border-[#0d7377]/40" />
          Período con promocodes activos
        </div>
      )}

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={serie} margin={{ top: 5, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="gVentas" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#730d32" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#730d32" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="gCogs" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f7b643" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#f7b643" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
          {showMontos && (
            <YAxis
              yAxisId="money"
              tick={{ fontSize: 10 }}
              tickFormatter={(v) => formatearMonedaCompacta(Number(v), "UYU")}
            />
          )}
          {showCantidad && (
            <YAxis
              yAxisId="cant"
              orientation={showMontos ? "right" : "left"}
              tick={{ fontSize: 10 }}
              allowDecimals={false}
            />
          )}
          {promocodeSpans.map((s, i) => (
            <ReferenceArea
              key={i}
              yAxisId={refAxis}
              x1={s.x1}
              x2={s.x2}
              fill="#0d7377"
              fillOpacity={0.08}
              stroke="#0d7377"
              strokeOpacity={0.25}
              strokeDasharray="4 3"
            />
          ))}
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload as
                | { cantidad?: number; promocodesActivos?: string[] }
                | undefined;
              return (
                <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                  <p className="font-heading mb-1">{label}</p>
                  {showMontos &&
                    payload
                      .filter((p) => p.dataKey === "ventas" || p.dataKey === "cogs")
                      .map((p, i) => (
                        <p key={i} style={{ color: p.color }}>
                          {p.name}: {formatearMoneda(Number(p.value), "UYU")}
                        </p>
                      ))}
                  {showCantidad && (
                    <p className="text-foreground">Pedidos: {row?.cantidad ?? 0}</p>
                  )}
                  {row?.promocodesActivos && row.promocodesActivos.length > 0 && (
                    <p className="text-[#0d7377] mt-1">
                      Promocodes: {row.promocodesActivos.join(", ")}
                    </p>
                  )}
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />

          {showMontos && tipo === "area" && (
            <Area
              yAxisId="money"
              type="monotone"
              dataKey="ventas"
              name="Ventas"
              stroke="#730d32"
              fill="url(#gVentas)"
              strokeWidth={2}
            />
          )}
          {showMontos && tipo === "area" && (
            <Area
              yAxisId="money"
              type="monotone"
              dataKey="cogs"
              name="COGS"
              stroke="#f7b643"
              fill="url(#gCogs)"
              strokeWidth={2}
            />
          )}
          {showMontos && tipo === "barras" && (
            <Bar
              yAxisId="money"
              dataKey="ventas"
              name="Ventas"
              fill="#730d32"
              radius={[4, 4, 0, 0]}
            />
          )}
          {showMontos && tipo === "barras" && (
            <Bar
              yAxisId="money"
              dataKey="cogs"
              name="COGS"
              fill="#f7b643"
              radius={[4, 4, 0, 0]}
            />
          )}

          {showCantidad && tipo === "barras" && (
            <Bar
              yAxisId="cant"
              dataKey="cantidad"
              name="Cantidad de pedidos"
              fill="#4a5d6c"
              fillOpacity={metrica === "cantidad" ? 0.85 : 0.35}
              barSize={metrica === "cantidad" ? undefined : 10}
              radius={[3, 3, 0, 0]}
            />
          )}
          {showCantidad && tipo === "area" && (
            <Line
              yAxisId="cant"
              type="monotone"
              dataKey="cantidad"
              name="Cantidad de pedidos"
              stroke="#4a5d6c"
              strokeWidth={2}
              dot={{ r: 2 }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

/** Runs contiguos de la serie donde hubo promocodes activos. */
function computePromocodeSpans(
  serie: ReporteTienda["serie"]
): { x1: string; x2: string }[] {
  const spans: { x1: string; x2: string }[] = [];
  let inicio: string | null = null;
  let anterior: string | null = null;

  for (const punto of serie) {
    const activo = punto.promocodesActivos.length > 0;
    if (activo) {
      if (inicio == null) inicio = punto.fecha;
      anterior = punto.fecha;
    } else if (inicio != null && anterior != null) {
      spans.push({ x1: inicio, x2: anterior });
      inicio = null;
      anterior = null;
    }
  }
  if (inicio != null && anterior != null) {
    spans.push({ x1: inicio, x2: anterior });
  }
  return spans;
}
