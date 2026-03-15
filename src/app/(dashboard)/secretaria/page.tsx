"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Users,
  AlertTriangle,
  UserPlus,
  DollarSign,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import { createBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { staggerContainer, fadeInUp, springSmooth } from "@/lib/motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface DashboardStats {
  totalActivos: number;
  totalMorosos: number;
  altasMes: number;
  cuotasCobradas: number;
  cuotasPendientes: number;
  sociosPorDisciplina: { nombre: string; cantidad: number }[];
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
    key: "totalActivos",
    label: "Socios Activos",
    icon: Users,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  {
    key: "totalMorosos",
    label: "Morosos",
    icon: AlertTriangle,
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
  {
    key: "altasMes",
    label: "Altas del Mes",
    icon: UserPlus,
    color: "text-bordo-700",
    bg: "bg-bordo-50",
  },
  {
    key: "cuotasCobradas",
    label: "Cuotas Cobradas (mes)",
    icon: DollarSign,
    color: "text-blue-600",
    bg: "bg-blue-50",
    prefix: "$",
  },
] as const;

const quickLinks = [
  {
    label: "Ver todos los socios",
    href: "/secretaria/socios",
    descriptionKey: "totalActivos" as const,
    descriptionSuffix: "activos",
  },
  {
    label: "Socios morosos",
    href: "/secretaria/socios?estado=moroso",
    descriptionKey: "totalMorosos" as const,
    descriptionSuffix: "pendientes",
  },
  {
    label: "Nuevo socio",
    href: "/secretaria/socios/nuevo",
    description: "Alta de socio",
  },
  {
    label: "Disciplinas",
    href: "/secretaria/disciplinas",
    description: "Gestionar deportes",
  },
];

export default function SecretariaDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalActivos: 0,
    totalMorosos: 0,
    altasMes: 0,
    cuotasCobradas: 0,
    cuotasPendientes: 0,
    sociosPorDisciplina: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      const supabase = createBrowserClient();

      const [
        activosResult,
        morososResult,
        altasResult,
        disciplinasResult,
        pagosResult,
      ] = await Promise.all([
        supabase
          .from("perfiles")
          .select("*", { count: "exact", head: true })
          .eq("es_socio", true)
          .eq("estado_socio", "activo"),
        supabase
          .from("perfiles")
          .select("*", { count: "exact", head: true })
          .eq("es_socio", true)
          .eq("estado_socio", "moroso"),
        supabase
          .from("perfiles")
          .select("*", { count: "exact", head: true })
          .eq("es_socio", true)
          .gte(
            "fecha_alta_socio",
            new Date(
              new Date().getFullYear(),
              new Date().getMonth(),
              1
            ).toISOString()
          ),
        supabase
          .from("disciplinas")
          .select("id, nombre, perfil_disciplinas(id)")
          .eq("activa", true)
          .order("nombre"),
        supabase
          .from("pagos_socios")
          .select("monto")
          .eq("periodo_mes", new Date().getMonth() + 1)
          .eq("periodo_anio", new Date().getFullYear()),
      ]);

      const pagos = pagosResult.data as unknown as { monto: number }[] | null;
      const cuotasCobradas =
        pagos?.reduce((sum, p) => sum + (p.monto || 0), 0) || 0;

      const discs = disciplinasResult.data as unknown as
        | { nombre: string; perfil_disciplinas: unknown[] }[]
        | null;
      const sociosPorDisciplina =
        discs?.map((d) => ({
          nombre: d.nombre,
          cantidad: d.perfil_disciplinas?.length || 0,
        })) || [];

      setStats({
        totalActivos: activosResult.count || 0,
        totalMorosos: morososResult.count || 0,
        altasMes: altasResult.count || 0,
        cuotasCobradas,
        cuotasPendientes: 0,
        sociosPorDisciplina,
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
            Secretaría
          </h1>
          <p className="mt-1 font-body text-sm text-muted-foreground">
            Gestión de socios y disciplinas del club
          </p>
        </div>
        <Link
          href="/secretaria/socios/nuevo"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-bordo-800 px-4 py-2.5 text-sm font-body font-medium text-white hover:bg-bordo-700 transition-colors w-full sm:w-auto"
        >
          <UserPlus className="size-4" />
          Nuevo socio
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
          const value =
            stats[card.key as keyof DashboardStats] as number;
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
                            {"prefix" in card && card.prefix}
                            <AnimatedCounter value={value} />
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

      {/* Chart + Quick Links */}
      <div className="grid lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Socios por Disciplina Chart */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="lg:col-span-2"
        >
          <Card className="border-linea h-full">
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-sm sm:text-base uppercase tracking-editorial">
                Socios por Disciplina
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-48 sm:h-64 lg:h-72 bg-superficie animate-pulse rounded" />
              ) : stats.sociosPorDisciplina.length === 0 ? (
                <div className="h-48 sm:h-64 lg:h-72 flex items-center justify-center text-muted-foreground text-sm font-body">
                  No hay datos de disciplinas
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={stats.sociosPorDisciplina}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="nombre"
                      tick={{ fontSize: 10, fill: "#6b7280" }}
                      axisLine={{ stroke: "#e5e7eb" }}
                      interval={0}
                      angle={-35}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#6b7280" }}
                      axisLine={{ stroke: "#e5e7eb" }}
                      allowDecimals={false}
                      width={35}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                        fontSize: 13,
                      }}
                    />
                    <Bar
                      dataKey="cantidad"
                      fill="#730d32"
                      radius={[4, 4, 0, 0]}
                      name="Socios"
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick Links */}
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
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-superficie transition-colors group"
                >
                  <div className="min-w-0">
                    <p className="font-body text-sm font-medium text-foreground">
                      {link.label}
                    </p>
                    <p className="font-body text-xs text-muted-foreground">
                      {"descriptionKey" in link
                        ? `${stats[link.descriptionKey as keyof DashboardStats]} ${link.descriptionSuffix}`
                        : link.description}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
                </Link>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
