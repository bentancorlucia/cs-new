"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ChevronRight,
  Plus,
  Landmark,
  Receipt,
  ArrowRightLeft,
  FolderTree,
  Archive,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { staggerContainer, fadeInUp, springSmooth } from "@/lib/motion";
import { useDocumentTitle } from "@/hooks/use-document-title";

interface CuentaFinanciera {
  id: number;
  nombre: string;
  tipo: string;
  moneda: string;
  saldo_actual: number;
  color: string | null;
  activa: boolean;
}

interface DashboardStats {
  saldoTotalUYU: number;
  ingresosMes: number;
  egresosMes: number;
  resultadoMes: number;
  cuentas: CuentaFinanciera[];
}

function AnimatedCounter({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) return;
    const duration = 800;
    const steps = 30;
    const increment = value / steps;
    let current = 0;
    let step = 0;

    const interval = setInterval(() => {
      step++;
      current = Math.min(Math.round(increment * step), value);
      setDisplay(current);
      if (step >= steps) clearInterval(interval);
    }, duration / steps);

    return () => clearInterval(interval);
  }, [value]);

  return <span className="tabular-nums">{display.toLocaleString("es-UY")}</span>;
}

const statCards = [
  {
    key: "saldoTotalUYU" as const,
    label: "Saldo Total (UYU)",
    icon: Wallet,
    color: "text-bordo-700",
    bg: "bg-bordo-50",
    prefix: "$",
  },
  {
    key: "ingresosMes" as const,
    label: "Ingresos del Mes",
    icon: TrendingUp,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    prefix: "$",
  },
  {
    key: "egresosMes" as const,
    label: "Egresos del Mes",
    icon: TrendingDown,
    color: "text-red-600",
    bg: "bg-red-50",
    prefix: "$",
  },
  {
    key: "resultadoMes" as const,
    label: "Resultado del Mes",
    icon: ArrowUpRight,
    color: "text-blue-600",
    bg: "bg-blue-50",
    prefix: "$",
  },
];

const quickLinks = [
  {
    label: "Cuentas",
    href: "/tesoreria/cuentas",
    description: "Gestionar cuentas financieras",
    icon: Landmark,
  },
  {
    label: "Movimientos",
    href: "/tesoreria/movimientos",
    description: "Ver todos los movimientos",
    icon: Receipt,
  },
  {
    label: "Categorías",
    href: "/tesoreria/categorias",
    description: "Categorías de ingresos y egresos",
    icon: FolderTree,
  },
  {
    label: "Transferencias",
    href: "/tesoreria/transferencias",
    description: "Transferencias entre cuentas",
    icon: ArrowRightLeft,
  },
  {
    label: "Caja Chica",
    href: "/tesoreria/caja-chica",
    description: "Gestión de caja chica",
    icon: Archive,
  },
];

const tipoBadgeColors: Record<string, string> = {
  bancaria: "bg-blue-100 text-blue-700",
  mercadopago: "bg-sky-100 text-sky-700",
  caja_chica: "bg-amber-100 text-amber-700",
  virtual: "bg-gray-100 text-gray-700",
};

const tipoLabels: Record<string, string> = {
  bancaria: "Bancaria",
  mercadopago: "MercadoPago",
  caja_chica: "Caja Chica",
  virtual: "Virtual",
};

function formatCurrency(monto: number, moneda: string): string {
  const prefix = moneda === "USD" ? "U$" : "$";
  return `${prefix}${Math.abs(monto).toLocaleString("es-UY")}`;
}

export default function TesoreriaDashboard() {
  useDocumentTitle("Tesorería");
  const [stats, setStats] = useState<DashboardStats>({
    saldoTotalUYU: 0,
    ingresosMes: 0,
    egresosMes: 0,
    resultadoMes: 0,
    cuentas: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      const supabase = createBrowserClient();

      const mesInicio = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
      )
        .toISOString()
        .split("T")[0];
      const mesFin = new Date(
        new Date().getFullYear(),
        new Date().getMonth() + 1,
        0
      )
        .toISOString()
        .split("T")[0];

      const [cuentasResult, ingresosResult, egresosResult] = await Promise.all([
        supabase
          .from("cuentas_financieras")
          .select("id, nombre, tipo, moneda, saldo_actual, color, activa")
          .eq("activa", true)
          .order("nombre"),
        supabase
          .from("movimientos_financieros")
          .select("monto")
          .eq("tipo", "ingreso")
          .gte("fecha", mesInicio)
          .lte("fecha", mesFin),
        supabase
          .from("movimientos_financieros")
          .select("monto")
          .eq("tipo", "egreso")
          .gte("fecha", mesInicio)
          .lte("fecha", mesFin),
      ]);

      const cuentas = (cuentasResult.data as CuentaFinanciera[] | null) || [];

      const saldoTotalUYU = cuentas
        .filter((c) => c.moneda === "UYU")
        .reduce((sum, c) => sum + (c.saldo_actual || 0), 0);

      const ingresos =
        (ingresosResult.data as { monto: number }[] | null) || [];
      const ingresosMes = ingresos.reduce(
        (sum, m) => sum + (m.monto || 0),
        0
      );

      const egresos =
        (egresosResult.data as { monto: number }[] | null) || [];
      const egresosMes = egresos.reduce((sum, m) => sum + (m.monto || 0), 0);

      setStats({
        saldoTotalUYU: Math.round(saldoTotalUYU),
        ingresosMes: Math.round(ingresosMes),
        egresosMes: Math.round(egresosMes),
        resultadoMes: Math.round(ingresosMes - egresosMes),
        cuentas,
      });
      setLoading(false);
    }

    fetchStats();
  }, []);

  return (
    <div className="space-y-6 lg:space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
            Tesorería
          </h1>
          <p className="mt-1 font-body text-sm text-muted-foreground">
            Gestión financiera del club
          </p>
        </div>
        <Link
          href="/tesoreria/movimientos"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-bordo-800 px-4 py-2.5 text-sm font-body font-medium text-white hover:bg-bordo-700 transition-colors w-full sm:w-auto"
        >
          <Plus className="size-4" />
          Movimiento
        </Link>
      </motion.div>

      {/* Stats Cards */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
      >
        {statCards.map((card) => {
          const Icon = card.icon;
          const value = stats[card.key] as number;
          return (
            <motion.div key={card.key} variants={fadeInUp} transition={springSmooth}>
              <Card className="relative overflow-hidden border-linea h-full">
                <CardContent className="p-4 sm:p-5 lg:p-6">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="font-body text-[11px] sm:text-xs text-muted-foreground mb-1 truncate">
                        {card.label}
                      </p>
                      <p className="font-display text-xl sm:text-2xl lg:text-3xl uppercase tracking-tightest text-foreground">
                        {loading ? (
                          <span className="inline-block w-14 h-7 bg-superficie animate-pulse rounded" />
                        ) : (
                          <>
                            {card.prefix}
                            <AnimatedCounter value={Math.abs(value)} />
                          </>
                        )}
                      </p>
                    </div>
                    <div className={`p-1.5 sm:p-2 rounded-lg ${card.bg} shrink-0`}>
                      <Icon className={`size-4 sm:size-5 ${card.color}`} strokeWidth={1.5} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Saldos por Cuenta + Accesos Rápidos */}
      <div className="grid lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Saldos por Cuenta */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="lg:col-span-2"
        >
          <Card className="border-linea h-full">
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-sm sm:text-base uppercase tracking-editorial">
                Saldos por Cuenta
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-14 bg-superficie animate-pulse rounded"
                    />
                  ))}
                </div>
              ) : stats.cuentas.length === 0 ? (
                <div className="h-48 sm:h-64 lg:h-72 flex items-center justify-center text-muted-foreground text-sm font-body">
                  No hay cuentas registradas
                </div>
              ) : (
                <div className="space-y-1">
                  {stats.cuentas.map((cuenta) => (
                    <Link
                      key={cuenta.id}
                      href={`/tesoreria/cuentas/${cuenta.id}`}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-superficie transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="size-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: cuenta.color || "#730d32",
                          }}
                        />
                        <div className="min-w-0">
                          <p className="font-body text-sm font-medium text-foreground truncate">
                            {cuenta.nombre}
                          </p>
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-body font-medium ${
                                tipoBadgeColors[cuenta.tipo] ||
                                "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {tipoLabels[cuenta.tipo] || cuenta.tipo}
                            </span>
                            <span className="font-body text-xs text-muted-foreground">
                              {cuenta.moneda}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span
                          className={`font-display text-sm sm:text-base tracking-tightest ${
                            cuenta.saldo_actual >= 0
                              ? "text-foreground"
                              : "text-red-600"
                          }`}
                        >
                          {formatCurrency(cuenta.saldo_actual, cuenta.moneda)}
                        </span>
                        <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Accesos Rápidos */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <Card className="border-linea h-full">
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-sm sm:text-base uppercase tracking-editorial">
                Accesos rápidos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {quickLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-superficie transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon className="size-4 text-muted-foreground shrink-0" strokeWidth={1.5} />
                      <div className="min-w-0">
                        <p className="font-body text-sm font-medium text-foreground">
                          {link.label}
                        </p>
                        <p className="font-body text-xs text-muted-foreground">
                          {link.description}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
