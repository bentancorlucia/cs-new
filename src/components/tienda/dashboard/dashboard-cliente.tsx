"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  Hammer,
  Loader2,
  Package,
  PackageCheck,
  RefreshCw,
  Store,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth, fadeInUp, springBouncy, springSmooth, staggerContainer, staggerContainerFast } from "@/lib/motion";
import { NOMBRE_CANAL, NOMBRE_ESTADO_PEDIDO, formatPct } from "@/lib/reportes/etiquetas";
import { EnteroAnimado, ImporteAnimado } from "@/components/contabilidad/reportes/importe-animado";
import { TituloReporte } from "@/components/contabilidad/reportes/titulo-reporte";
import type { Canal, DashboardTienda } from "@/types/reportes";

// ─── Gráfico ─────────────────────────────────────────────

type Periodo = "7d" | "1m" | "3m" | "6m" | "1a";
type Bucket = "dia" | "semana" | "mes";

const PERIODOS: { id: Periodo; label: string; dias: number; bucket: Bucket }[] = [
  { id: "7d", label: "7 d", dias: 7, bucket: "dia" },
  { id: "1m", label: "30 d", dias: 30, bucket: "dia" },
  { id: "3m", label: "3 m", dias: 91, bucket: "semana" },
  { id: "6m", label: "6 m", dias: 182, bucket: "semana" },
  { id: "1a", label: "1 año", dias: 365, bucket: "mes" },
];

export const COLOR_CANAL: Record<Canal, string> = {
  online: "#730d32",
  pos: "#f7b643",
  disciplina: "#0d7377",
};

const CANALES: Canal[] = ["online", "pos", "disciplina"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function lunesDe(ymd: string): string {
  const d = new Date(ymd + "T00:00:00Z");
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (dia - 1));
  return d.toISOString().slice(0, 10);
}

function etiqueta(clave: string, bucket: Bucket, larga = false): string {
  if (bucket === "mes") {
    const [y, m] = clave.split("-");
    return larga ? `${MESES[Number(m) - 1]} ${y}` : MESES[Number(m) - 1];
  }
  const [, m, d] = clave.split("-");
  if (bucket === "semana") return larga ? `Semana del ${Number(d)} ${MESES[Number(m) - 1]}` : `${Number(d)} ${MESES[Number(m) - 1]}`;
  return larga ? `${d}/${m}` : `${Number(d)}/${Number(m)}`;
}

type PuntoSerie = { clave: string; online: number; pos: number; disciplina: number };

function agrupar(serie: DashboardTienda["serie"], periodo: Periodo): { puntos: PuntoSerie[]; bucket: Bucket } {
  const p = PERIODOS.find((x) => x.id === periodo)!;
  const dias = serie.slice(-p.dias);
  const mapa = new Map<string, PuntoSerie>();
  for (const d of dias) {
    const clave = p.bucket === "dia" ? d.fecha : p.bucket === "semana" ? lunesDe(d.fecha) : d.fecha.slice(0, 7);
    const b = mapa.get(clave) ?? { clave, online: 0, pos: 0, disciplina: 0 };
    b.online += d.online;
    b.pos += d.pos;
    b.disciplina += d.disciplina;
    mapa.set(clave, b);
  }
  return { puntos: [...mapa.values()], bucket: p.bucket };
}

function compacto(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString("es-UY", { maximumFractionDigits: 1 })} M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toLocaleString("es-UY", { maximumFractionDigits: 1 })} k`;
  return v.toLocaleString("es-UY", { maximumFractionDigits: 0 });
}

function TooltipCanales({
  active,
  payload,
  label,
  bucket,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number | string }[];
  label?: string;
  bucket: Bucket;
}) {
  if (!active || !payload?.length || !label) return null;
  const valor = (k: Canal) => Number(payload.find((p) => p.dataKey === k)?.value ?? 0);
  const total = CANALES.reduce((s, c) => s + valor(c), 0);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="min-w-[200px] rounded-xl border border-linea bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm"
    >
      <p className="mb-2 text-xs font-heading capitalize text-muted-foreground">{etiqueta(label, bucket, true)}</p>
      <div className="space-y-1">
        {CANALES.map((c) => (
          <div key={c} className="flex items-center justify-between gap-4 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: COLOR_CANAL[c] }} />
              {NOMBRE_CANAL[c]}
            </span>
            <span className="tabular-nums">{formatImporte(valor(c), "UYU")}</span>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between gap-4 border-t border-linea pt-1.5 text-sm font-heading">
          <span>Total</span>
          <span className="tabular-nums">{formatImporte(total, "UYU")}</span>
        </div>
      </div>
    </motion.div>
  );
}

function GraficoCanales({ serie }: { serie: DashboardTienda["serie"] }) {
  const [periodo, setPeriodo] = useState<Periodo>("1m");
  const { puntos, bucket } = useMemo(() => agrupar(serie, periodo), [serie, periodo]);
  const totales = useMemo(
    () =>
      Object.fromEntries(CANALES.map((c) => [c, puntos.reduce((s, p) => s + p[c], 0)])) as Record<Canal, number>,
    [puntos]
  );
  const total = CANALES.reduce((s, c) => s + totales[c], 0);

  return (
    <motion.section
      variants={fadeInUp}
      transition={springSmooth}
      className="rounded-2xl border border-linea bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-heading text-sm text-foreground">Ventas netas por canal</h2>
          <p className="text-xs text-muted-foreground">Online, POS y pedidos de disciplinas, a fecha contable</p>
        </div>
        <div className="inline-flex self-start rounded-full border border-linea bg-superficie p-0.5 text-xs">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriodo(p.id)}
              className={cn(
                "relative rounded-full px-3 py-1 font-heading transition-colors",
                periodo === p.id ? "text-white" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {periodo === p.id && (
                <motion.span layoutId="periodo-dashboard" className="absolute inset-0 rounded-full bg-bordo-800" transition={springBouncy} />
              )}
              <span className="relative z-10">{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {CANALES.map((c) => (
          <div key={c} className="rounded-xl bg-superficie/70 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="size-2 rounded-full" style={{ background: COLOR_CANAL[c] }} />
              {NOMBRE_CANAL[c]}
            </div>
            <div className="mt-0.5 truncate font-display text-sm tracking-tightest sm:text-base">
              <ImporteAnimado valor={totales[c]} moneda="UYU" />
            </div>
            <div className="text-[10px] text-muted-foreground">{formatPct(total > 0 ? (totales[c] / total) * 100 : null, 0)}</div>
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={periodo}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={easeSmooth}
          className="mt-4 h-64 sm:h-72"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={puntos} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
              <defs>
                {CANALES.map((c) => (
                  <linearGradient key={c} id={`grad-${c}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLOR_CANAL[c]} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={COLOR_CANAL[c]} stopOpacity={0.03} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8e4de" />
              <XAxis
                dataKey="clave"
                tickFormatter={(v: string) => etiqueta(v, bucket)}
                tick={{ fontSize: 11, fill: "#6b7280" }}
                tickLine={false}
                axisLine={false}
                minTickGap={16}
              />
              <YAxis tickFormatter={compacto} tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} width={48} />
              <Tooltip content={<TooltipCanales bucket={bucket} />} />
              {CANALES.map((c) => (
                <Area
                  key={c}
                  type="monotone"
                  dataKey={c}
                  stackId="1"
                  stroke={COLOR_CANAL[c]}
                  strokeWidth={2}
                  fill={`url(#grad-${c})`}
                  animationDuration={700}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      </AnimatePresence>
    </motion.section>
  );
}

// ─── Tarjetas ────────────────────────────────────────────

function Kpi({
  label,
  icon: Icon,
  valor,
  pie,
  tono = "text-foreground",
  fondo = "bg-superficie",
  href,
  destacado,
}: {
  label: string;
  icon: LucideIcon;
  valor: React.ReactNode;
  pie: React.ReactNode;
  tono?: string;
  fondo?: string;
  href?: string;
  destacado?: boolean;
}) {
  const tarjeta = (
    <motion.div
      variants={fadeInUp}
      transition={springSmooth}
      whileHover={{ y: -2 }}
      whileTap={href ? { scale: 0.98 } : undefined}
      className={cn(
        "h-full rounded-2xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md",
        destacado ? "border-bordo-200" : "border-linea"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground font-body">{label}</p>
          <p className={cn("mt-1 whitespace-nowrap font-display text-xl tracking-tightest sm:text-2xl", tono)}>{valor}</p>
          <div className="mt-0.5 text-[10px] text-muted-foreground">{pie}</div>
        </div>
        <div className={cn("shrink-0 rounded-lg p-2", fondo)}>
          <Icon className={cn("size-4", tono)} strokeWidth={1.75} />
        </div>
      </div>
    </motion.div>
  );
  return href ? (
    <Link href={href} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bordo-300">
      {tarjeta}
    </Link>
  ) : (
    tarjeta
  );
}

const ESTILO_ESTADO: Record<string, string> = {
  pendiente: "bg-gray-100 text-gray-600",
  pendiente_verificacion: "bg-orange-50 text-orange-700",
  pagado: "bg-emerald-50 text-emerald-700",
  encargado: "bg-purple-50 text-purple-700",
  preparando: "bg-amber-50 text-amber-700",
  listo_retiro: "bg-blue-50 text-blue-700",
  retirado: "bg-gray-50 text-gray-500",
  cancelado: "bg-red-50 text-red-600",
};

function horaCorta(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-UY", {
    timeZone: "America/Montevideo",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Panel ───────────────────────────────────────────────

export function DashboardCliente({ data, error }: { data: DashboardTienda | null; error: string | null }) {
  const router = useRouter();
  const [actualizando, startTransition] = useTransition();

  const acciones = (
    <div className="flex flex-wrap gap-2">
      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
        <Button
          variant="outline"
          size="lg"
          className="rounded-full"
          disabled={actualizando}
          onClick={() => startTransition(() => router.refresh())}
        >
          <RefreshCw className={cn("size-4", actualizando && "animate-spin")} />
          Actualizar
        </Button>
      </motion.div>
      <Link href="/admin/reportes" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "rounded-full")}>
        <BarChart3 className="size-4" />
        Reportes
      </Link>
      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
        <Link href="/admin/pos" className={cn(buttonVariants({ size: "lg" }), "rounded-full")}>
          <Store className="size-4" />
          Abrir POS
        </Link>
      </motion.div>
    </div>
  );

  if (!data) {
    return (
      <div className="space-y-6">
        <TituloReporte etiqueta="Tienda" titulo="Panel de la tienda" descripcion="Ventas, pedidos y stock al día.">
          {acciones}
        </TituloReporte>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          role="alert"
        >
          No se pudo armar el panel: {error ?? "error desconocido"}
        </motion.div>
      </div>
    );
  }

  const { ventas, pendientes, stock } = data;
  const margenMes = ventas.mes.ventas > 0 ? (ventas.mes.margen / ventas.mes.ventas) * 100 : null;
  const maxTop = Math.max(1, ...data.topProductosMes.map((p) => p.facturacion));

  return (
    <motion.div
      className={cn("space-y-6 transition-opacity", actualizando && "opacity-60")}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={easeSmooth}
    >
      <TituloReporte etiqueta="Tienda" titulo="Panel de la tienda" descripcion="Ventas netas a fecha contable, sin donaciones. Mismos números que los reportes.">
        {acciones}
      </TituloReporte>

      {/* Control contable del mes */}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...easeSmooth, delay: 0.2 }}>
        <Link
          href="/admin/reportes"
          className={cn(
            "group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-heading transition-colors",
            data.controlMes.cuadra
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
              : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
          )}
        >
          {data.controlMes.cuadra ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
          {data.controlMes.cuadra
            ? "Las ventas del mes cuadran con la contabilidad"
            : `Las ventas del mes no cuadran con la contabilidad (diferencia ${formatImporte(data.controlMes.diferencia, "UYU")})`}
          <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </motion.div>

      {/* Ventas */}
      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi
          label="Ventas de hoy"
          icon={Wallet}
          tono="text-bordo-800"
          fondo="bg-bordo-50"
          destacado
          valor={<ImporteAnimado valor={ventas.hoy.ventas} moneda="UYU" />}
          pie={
            <>
              <EnteroAnimado valor={ventas.hoy.pedidos} /> pedidos · margen {formatImporte(ventas.hoy.margen, "UYU")}
            </>
          }
        />
        <Kpi
          label="Últimos 7 días"
          icon={CalendarDays}
          valor={<ImporteAnimado valor={ventas.semana.ventas} moneda="UYU" />}
          pie={
            <>
              <EnteroAnimado valor={ventas.semana.pedidos} /> pedidos · margen {formatImporte(ventas.semana.margen, "UYU")}
            </>
          }
        />
        <Kpi
          label="Mes en curso"
          icon={TrendingUp}
          tono="text-emerald-700"
          fondo="bg-emerald-50"
          valor={<ImporteAnimado valor={ventas.mes.ventas} moneda="UYU" />}
          pie={
            <>
              <EnteroAnimado valor={ventas.mes.pedidos} /> pedidos · margen {formatPct(margenMes)}
            </>
          }
        />
        <Kpi
          label="Encargues sin entregar"
          icon={Hammer}
          tono="text-purple-700"
          fondo="bg-purple-50"
          href="/admin/pedidos"
          valor={<ImporteAnimado valor={data.encarguesPendientes.importe} moneda="UYU" />}
          pie={
            <>
              <EnteroAnimado valor={data.encarguesPendientes.pedidos} /> pedidos · seña, no es venta
            </>
          }
        />
      </motion.div>

      {/* Pedidos pendientes + stock */}
      <motion.div variants={staggerContainerFast} initial="hidden" animate="visible" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi
          label="Por verificar"
          icon={Building2}
          tono="text-orange-600"
          fondo="bg-orange-50"
          href="/admin/pedidos"
          valor={<EnteroAnimado valor={pendientes.verificacion} />}
          pie="Transferencias a conciliar"
        />
        <Kpi
          label="Para preparar"
          icon={Package}
          tono="text-amber-600"
          fondo="bg-amber-50"
          href="/admin/pedidos"
          valor={<EnteroAnimado valor={pendientes.preparar} />}
          pie="Pagados o preparando"
        />
        <Kpi
          label="Encargados"
          icon={Clock}
          tono="text-purple-700"
          fondo="bg-purple-50"
          href="/admin/pedidos"
          valor={<EnteroAnimado valor={pendientes.encargados} />}
          pie="En fabricación"
        />
        <Kpi
          label="Para retirar"
          icon={PackageCheck}
          tono="text-blue-700"
          fondo="bg-blue-50"
          href="/admin/pedidos"
          valor={<EnteroAnimado valor={pendientes.retirar} />}
          pie="Listos para el cliente"
        />
        <Kpi
          label="Stock bajo"
          icon={AlertTriangle}
          tono={stock.bajo + stock.agotados > 0 ? "text-red-600" : "text-foreground"}
          fondo={stock.bajo + stock.agotados > 0 ? "bg-red-50" : "bg-superficie"}
          href="/admin/stock"
          valor={<EnteroAnimado valor={stock.bajo} />}
          pie={
            <>
              <EnteroAnimado valor={stock.agotados} /> agotados · {data.productosActivos} activos
            </>
          }
        />
      </motion.div>

      <motion.div variants={staggerContainer} initial="hidden" animate="visible">
        <GraficoCanales serie={data.serie} />
      </motion.div>

      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid gap-4 lg:grid-cols-5">
        {/* Últimos pedidos */}
        <motion.section variants={fadeInUp} transition={springSmooth} className="rounded-2xl border border-linea bg-white shadow-sm lg:col-span-3">
          <div className="flex items-center justify-between border-b border-linea px-4 py-3 sm:px-5">
            <h2 className="font-heading text-sm">Últimos pedidos</h2>
            <Link href="/admin/pedidos" className="group inline-flex items-center gap-1 text-xs text-bordo-800 hover:text-bordo-900">
              Ver todos <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
          {data.pedidosRecientes.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">Todavía no hay pedidos.</p>
          ) : (
            <motion.ul variants={staggerContainerFast} initial="hidden" animate="visible" className="divide-y divide-linea">
              {data.pedidosRecientes.map((p) => (
                <motion.li key={p.id} variants={fadeInUp} transition={springSmooth}>
                  <Link
                    href={`/admin/pedidos/${p.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-superficie/60 sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-heading text-sm">{p.numero_pedido ?? `#${p.id}`}</span>
                        <span className="rounded-full bg-superficie px-1.5 py-0.5 text-[10px] text-muted-foreground">{NOMBRE_CANAL[p.tipo]}</span>
                        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", ESTILO_ESTADO[p.estado] ?? "bg-gray-100 text-gray-600")}>
                          {NOMBRE_ESTADO_PEDIDO[p.estado] ?? p.estado}
                        </span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.cliente ?? "Sin nombre"} · {horaCorta(p.created_at)}
                      </p>
                    </div>
                    <span className="shrink-0 font-heading text-sm tabular-nums">{formatImporte(p.importe, "UYU")}</span>
                  </Link>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </motion.section>

        <div className="space-y-4 lg:col-span-2">
          {/* Top del mes */}
          <motion.section variants={fadeInUp} transition={springSmooth} className="rounded-2xl border border-linea bg-white p-4 shadow-sm sm:p-5">
            <h2 className="font-heading text-sm">Más vendidos del mes</h2>
            <p className="text-xs text-muted-foreground">Por facturación neta (descuentos y devoluciones incluidos)</p>
            {data.topProductosMes.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Sin ventas este mes.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {data.topProductosMes.map((p, i) => (
                  <li key={p.producto_id}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate">{p.nombre}</span>
                      <span className="shrink-0 tabular-nums font-heading">{formatImporte(p.facturacion, "UYU")}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-superficie">
                      <motion.div
                        className="h-full rounded-full bg-bordo-800"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(2, (p.facturacion / maxTop) * 100)}%` }}
                        transition={{ ...easeSmooth, delay: 0.2 + i * 0.06 }}
                      />
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {p.unidades} u. · margen {formatPct(p.margenPct, 0)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </motion.section>

          {/* Alertas de stock */}
          <motion.section variants={fadeInUp} transition={springSmooth} className="rounded-2xl border border-linea bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-sm">Alertas de stock</h2>
              <Link href="/admin/stock" className="group inline-flex items-center gap-1 text-xs text-bordo-800 hover:text-bordo-900">
                Stock <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            {stock.alertas.length === 0 ? (
              <p className="flex items-center gap-2 py-4 text-sm text-emerald-700">
                <CheckCircle2 className="size-4" /> Todo por encima del mínimo.
              </p>
            ) : (
              <motion.ul variants={staggerContainerFast} initial="hidden" animate="visible" className="mt-2 divide-y divide-linea">
                {stock.alertas.map((a) => (
                  <motion.li key={a.id} variants={fadeInUp} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate">{a.nombre}</span>
                      {a.sku && <span className="text-[10px] text-muted-foreground">{a.sku}</span>}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] tabular-nums font-heading",
                        a.stock === 0 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
                      )}
                    >
                      {a.stock === 0 ? "Agotado" : `${a.stock} / mín. ${a.stockMinimo}`}
                    </span>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </motion.section>
        </div>
      </motion.div>

      {actualizando && (
        <div className="fixed bottom-4 right-4 z-30 inline-flex items-center gap-2 rounded-full bg-foreground px-3 py-1.5 text-xs text-white shadow-lg">
          <Loader2 className="size-3.5 animate-spin" /> Actualizando…
        </div>
      )}
    </motion.div>
  );
}
