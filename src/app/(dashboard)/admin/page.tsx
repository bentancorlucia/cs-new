"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  DollarSign,
  ShoppingCart,
  Package,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  RefreshCw,
  Clock,
  CreditCard,
  Truck,
  CheckCircle,
  XCircle,
  Building2,
  Eye,
  BarChart3,
  Zap,
  Store,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fadeInUp,
  staggerContainer,
  staggerContainerFast,
  springBouncy,
  springSmooth,
  easeSmooth,
  scaleIn,
} from "@/lib/motion";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { useDocumentTitle } from "@/hooks/use-document-title";

// ─── Types ──────────────────────────────────────────────

interface DashboardData {
  stats: {
    ventasHoy: number;
    ventasSemana: number;
    ventasMes: number;
    pedidosPendientes: number;
    productosActivos: number;
    stockBajo: number;
    pedidosHoy: number;
  };
  chartData: { fecha: string; online: number; pos: number; total: number }[];
  pedidosRecientes: {
    id: number;
    numero_pedido: string;
    tipo: "online" | "pos";
    estado: string;
    total: number;
    moneda: string;
    nombre_cliente: string | null;
    created_at: string;
    perfiles: { nombre: string; apellido: string } | null;
  }[];
  topProductos: { nombre: string; cantidad: number; total: number; stock: number }[];
  alertasStock: { id: number; nombre: string; stock_actual: number; stock_minimo: number; sku: string | null }[];
}

// ─── Helpers ────────────────────────────────────────────

function formatMoney(n: number) {
  return n.toLocaleString("es-UY", { style: "currency", currency: "UYU", maximumFractionDigits: 0 });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-UY", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatChartDay(fecha: string) {
  const d = new Date(fecha + "T12:00:00");
  return d.toLocaleDateString("es-UY", { weekday: "short", day: "numeric" });
}

const estadoBadge: Record<string, { label: string; className: string; icon: any }> = {
  pendiente: { label: "Pendiente", className: "bg-gray-100 text-gray-600", icon: Clock },
  pendiente_verificacion: { label: "Por conciliar", className: "bg-orange-50 text-orange-700", icon: Building2 },
  pagado: { label: "Pagado", className: "bg-emerald-50 text-emerald-700", icon: CreditCard },
  preparando: { label: "Preparando", className: "bg-amber-50 text-amber-700", icon: Package },
  listo_retiro: { label: "Listo retiro", className: "bg-blue-50 text-blue-700", icon: Truck },
  retirado: { label: "Retirado", className: "bg-gray-50 text-gray-500", icon: CheckCircle },
  cancelado: { label: "Cancelado", className: "bg-red-50 text-red-600", icon: XCircle },
};

// ─── Animated Number ────────────────────────────────────

function AnimatedNumber({ value, prefix = "" }: { value: number; prefix?: string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const duration = 800;
    const start = performance.now();
    const from = display;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span className="tabular-nums">
      {prefix}{display.toLocaleString("es-UY")}
    </span>
  );
}

// ─── Stat Card ──────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  prefix = "",
  trend,
  color,
  href,
}: {
  icon: any;
  label: string;
  value: number;
  prefix?: string;
  trend?: string;
  color: string;
  href?: string;
}) {
  const content = (
    <motion.div
      variants={fadeInUp}
      whileHover={{ y: -2, transition: springBouncy }}
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white p-5 shadow-card transition-shadow hover:shadow-card-hover",
        href && "cursor-pointer"
      )}
    >
      <div className="flex flex-1 items-start justify-between">
        <div className="space-y-2">
          <p className="font-body text-sm text-muted-foreground">{label}</p>
          <p className="font-display text-3xl font-bold tracking-tight text-foreground">
            <AnimatedNumber value={value} prefix={prefix} />
          </p>
          {trend && (
            <p className="flex items-center gap-1 font-body text-xs text-emerald-600">
              <TrendingUp className="h-3 w-3" />
              {trend}
            </p>
          )}
        </div>
        <div className={cn("rounded-xl p-2.5", color)}>
          <Icon className="h-5 w-5" strokeWidth={1.8} />
        </div>
      </div>
    </motion.div>
  );

  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

// ─── Custom Tooltip ─────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-xl border bg-white/95 px-4 py-3 shadow-elevated backdrop-blur-sm"
    >
      <p className="mb-1 font-heading text-xs font-medium uppercase tracking-editorial text-muted-foreground">
        {label}
      </p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="font-body text-sm" style={{ color: p.color }}>
          {p.dataKey === "online" ? "Online" : p.dataKey === "pos" ? "POS" : "Total"}: {formatMoney(p.value)}
        </p>
      ))}
    </motion.div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────

export default function AdminDashboardPage() {
  useDocumentTitle("Panel Tienda");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetch("/api/admin/dashboard");
      if (!res.ok) throw new Error("Error al cargar datos");
      const json = await res.json();
      setData(json);
    } catch {
      toast.error("No se pudieron cargar los datos del dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={easeSmooth}
      className="space-y-8 p-4 md:p-6 lg:p-8"
    >
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <motion.h1
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...easeSmooth, delay: 0.05 }}
            className="font-heading text-title-2 font-bold text-foreground"
          >
            Dashboard Tienda
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...easeSmooth, delay: 0.1 }}
            className="mt-1 font-body text-sm text-muted-foreground"
          >
            Resumen de ventas, pedidos y stock
          </motion.p>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...easeSmooth, delay: 0.15 }}
          className="flex gap-2"
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            Actualizar
          </Button>
          <Link href="/admin/pos" className={cn(buttonVariants({ size: "sm" }), "gap-2 bg-bordo-800 hover:bg-bordo-900")}>
            <Store className="h-4 w-4" />
            Abrir POS
          </Link>
        </motion.div>
      </div>

      {/* Stats Grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-2xl" />
          ))}
        </div>
      ) : data ? (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 gap-4 lg:grid-cols-4"
        >
          <StatCard
            icon={DollarSign}
            label="Ventas hoy"
            value={data.stats.ventasHoy}
            prefix="$ "
            trend={`${data.stats.pedidosHoy} pedido${data.stats.pedidosHoy !== 1 ? "s" : ""}`}
            color="bg-emerald-50 text-emerald-600"
          />
          <StatCard
            icon={TrendingUp}
            label="Ventas semana"
            value={data.stats.ventasSemana}
            prefix="$ "
            color="bg-blue-50 text-blue-600"
          />
          <StatCard
            icon={ShoppingCart}
            label="Pedidos pendientes"
            value={data.stats.pedidosPendientes}
            color="bg-amber-50 text-amber-600"
            href="/admin/pedidos"
          />
          <StatCard
            icon={AlertTriangle}
            label="Stock bajo"
            value={data.stats.stockBajo}
            color={data.stats.stockBajo > 0 ? "bg-red-50 text-red-600" : "bg-gray-50 text-gray-500"}
            href="/admin/stock"
          />
        </motion.div>
      ) : null}

      {/* Chart + Summary Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Chart */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ ...easeSmooth, delay: 0.2 }}
          className="rounded-2xl border bg-white p-5 shadow-card lg:col-span-2"
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-heading text-base font-semibold text-foreground">Ventas últimos 7 días</h2>
              <p className="font-body text-xs text-muted-foreground">Online vs POS</p>
            </div>
            {data && (
              <div className="flex items-center gap-4 font-body text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-bordo-600" /> Online
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-dorado-500" /> POS
                </span>
              </div>
            )}
          </div>
          {loading ? (
            <Skeleton className="h-[240px] rounded-xl" />
          ) : data ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data.chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradOnline" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#730d32" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#730d32" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradPos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f7b643" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#f7b643" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e4de" vertical={false} />
                <XAxis
                  dataKey="fecha"
                  tickFormatter={formatChartDay}
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 11, fill: "#6b7280" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="online"
                  stroke="#730d32"
                  strokeWidth={2}
                  fill="url(#gradOnline)"
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, fill: "#fff" }}
                />
                <Area
                  type="monotone"
                  dataKey="pos"
                  stroke="#f7b643"
                  strokeWidth={2}
                  fill="url(#gradPos)"
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 2, fill: "#fff" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : null}
        </motion.div>

        {/* Monthly Summary */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ ...easeSmooth, delay: 0.25 }}
          className="flex flex-col rounded-2xl border bg-white p-5 shadow-card"
        >
          <h2 className="mb-4 font-heading text-base font-semibold text-foreground">Resumen del mes</h2>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : data ? (
            <div className="flex flex-1 flex-col justify-between gap-4">
              <div className="rounded-xl bg-bordo-50/60 p-4">
                <p className="font-body text-xs text-bordo-700/70">Ventas del mes</p>
                <p className="mt-1 font-display text-2xl font-bold text-bordo-800">
                  <AnimatedNumber value={data.stats.ventasMes} prefix="$ " />
                </p>
              </div>
              <div className="rounded-xl bg-emerald-50/60 p-4">
                <p className="font-body text-xs text-emerald-700/70">Productos activos</p>
                <p className="mt-1 font-display text-2xl font-bold text-emerald-800">
                  <AnimatedNumber value={data.stats.productosActivos} />
                </p>
              </div>
              <div className="space-y-2">
                <p className="font-heading text-xs font-medium uppercase tracking-editorial text-muted-foreground">
                  Accesos rápidos
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Link href="/admin/productos" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9 justify-start gap-2 text-xs")}>
                    <Package className="h-3.5 w-3.5" /> Productos
                  </Link>
                  <Link href="/admin/pedidos" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9 justify-start gap-2 text-xs")}>
                    <ShoppingCart className="h-3.5 w-3.5" /> Pedidos
                  </Link>
                  <Link href="/admin/stock" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9 justify-start gap-2 text-xs")}>
                    <BarChart3 className="h-3.5 w-3.5" /> Stock
                  </Link>
                  <Link href="/admin/categorias" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9 justify-start gap-2 text-xs")}>
                    <Zap className="h-3.5 w-3.5" /> Categorías
                  </Link>
                </div>
              </div>
            </div>
          ) : null}
        </motion.div>
      </div>

      {/* Bottom Row: Recent Orders + Top Products + Stock Alerts */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Orders */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ ...easeSmooth, delay: 0.3 }}
          className="rounded-2xl border bg-white p-5 shadow-card lg:col-span-2"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-base font-semibold text-foreground">Pedidos recientes</h2>
            <Link href="/admin/pedidos" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-1 text-xs text-bordo-700")}>
              Ver todos <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : data?.pedidosRecientes.length ? (
            <motion.div
              variants={staggerContainerFast}
              initial="hidden"
              animate="visible"
              className="space-y-2"
            >
              <AnimatePresence>
                {data.pedidosRecientes.map((pedido) => {
                  const badge = estadoBadge[pedido.estado] || estadoBadge.pendiente;
                  const BadgeIcon = badge.icon;
                  const clientName =
                    pedido.perfiles
                      ? `${pedido.perfiles.nombre} ${pedido.perfiles.apellido}`
                      : pedido.nombre_cliente || "Sin nombre";

                  return (
                    <motion.div
                      key={pedido.id}
                      variants={fadeInUp}
                      layout
                      className="group flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-bordo-50/40"
                    >
                      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", badge.className)}>
                        <BadgeIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-heading text-sm font-medium text-foreground">
                            {pedido.numero_pedido}
                          </span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {pedido.tipo.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="truncate font-body text-xs text-muted-foreground">
                          {clientName} · {formatDate(pedido.created_at)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-heading text-sm font-semibold tabular-nums text-foreground">
                          {formatMoney(pedido.total)}
                        </p>
                        <Badge className={cn("text-[10px] border-0", badge.className)}>
                          {badge.label}
                        </Badge>
                      </div>
                      <Link
                        href={`/admin/pedidos/${pedido.id}`}
                        className="ml-1 opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        <Eye className="h-4 w-4 text-muted-foreground hover:text-bordo-700" />
                      </Link>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ShoppingCart className="h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 font-body text-sm text-muted-foreground">No hay pedidos aún</p>
            </div>
          )}
        </motion.div>

        {/* Top Products + Stock Alerts */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ ...easeSmooth, delay: 0.35 }}
          className="space-y-6"
        >
          {/* Top Products */}
          <div className="rounded-2xl border bg-white p-5 shadow-card">
            <h2 className="mb-4 font-heading text-base font-semibold text-foreground">
              Más vendidos del mes
            </h2>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 rounded-lg" />
                ))}
              </div>
            ) : data?.topProductos.length ? (
              <motion.div
                variants={staggerContainerFast}
                initial="hidden"
                animate="visible"
                className="space-y-2.5"
              >
                {data.topProductos.map((prod, i) => {
                  const maxQty = data.topProductos[0]?.cantidad || 1;
                  const pct = (prod.cantidad / maxQty) * 100;

                  return (
                    <motion.div key={prod.nombre} variants={fadeInUp} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 font-body text-sm text-foreground">
                          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-bordo-100 font-heading text-[10px] font-bold text-bordo-700">
                            {i + 1}
                          </span>
                          <span className="truncate max-w-[140px]">{prod.nombre}</span>
                        </span>
                        <span className="font-heading text-xs font-medium tabular-nums text-muted-foreground">
                          {prod.cantidad} uds
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-bordo-100/50">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.8, delay: 0.3 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                          className="h-full rounded-full bg-gradient-to-r from-bordo-600 to-bordo-400"
                        />
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            ) : (
              <p className="py-6 text-center font-body text-sm text-muted-foreground">
                Sin datos de ventas este mes
              </p>
            )}
          </div>

          {/* Stock Alerts */}
          <div className="rounded-2xl border bg-white p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-heading text-base font-semibold text-foreground">Alertas de stock</h2>
              {data && data.alertasStock.length > 0 && (
                <Badge className="border-0 bg-red-50 text-red-600 text-[10px]">
                  {data.stats.stockBajo} producto{data.stats.stockBajo !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 rounded-lg" />
                ))}
              </div>
            ) : data?.alertasStock.length ? (
              <motion.div
                variants={staggerContainerFast}
                initial="hidden"
                animate="visible"
                className="space-y-2"
              >
                {data.alertasStock.map((prod) => (
                  <motion.div
                    key={prod.id}
                    variants={fadeInUp}
                    className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-red-50/50"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-body text-sm text-foreground">{prod.nombre}</p>
                      {prod.sku && (
                        <p className="font-body text-[10px] text-muted-foreground">{prod.sku}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className={cn(
                        "font-heading text-sm font-semibold tabular-nums",
                        prod.stock_actual === 0 ? "text-red-600" : "text-amber-600"
                      )}>
                        {prod.stock_actual}
                      </span>
                      <span className="font-body text-[10px] text-muted-foreground"> / {prod.stock_minimo}</span>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <CheckCircle className="h-8 w-8 text-emerald-400" />
                <p className="mt-2 font-body text-sm text-muted-foreground">
                  Todo el stock está en orden
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
