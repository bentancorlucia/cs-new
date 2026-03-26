"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Plus,
  Landmark,
  CreditCard,
  Banknote,
  Wallet,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { staggerContainer, fadeInUp, springSmooth } from "@/lib/motion";
import { toast } from "sonner";
import { useDocumentTitle } from "@/hooks/use-document-title";

interface CuentaDetalle {
  id: number;
  nombre: string;
  tipo: "bancaria" | "mercadopago" | "caja_chica" | "virtual";
  moneda: "UYU" | "USD";
  banco: string | null;
  numero_cuenta: string | null;
  saldo_actual: number;
  saldo_inicial: number;
  descripcion: string | null;
  color: string | null;
  activa: boolean;
  created_at: string;
}

interface Movimiento {
  id: number;
  tipo: "ingreso" | "egreso";
  monto: number;
  moneda: string;
  fecha: string;
  descripcion: string;
  referencia: string | null;
  conciliado: boolean;
  categorias_financieras: {
    id: number;
    nombre: string;
    color: string | null;
  } | null;
}

const TIPO_CONFIG = {
  bancaria: {
    label: "Bancaria",
    icon: Landmark,
    badgeBg: "bg-blue-100 text-blue-700",
  },
  mercadopago: {
    label: "MercadoPago",
    icon: CreditCard,
    badgeBg: "bg-sky-100 text-sky-700",
  },
  caja_chica: {
    label: "Caja Chica",
    icon: Banknote,
    badgeBg: "bg-amber-100 text-amber-700",
  },
  virtual: {
    label: "Virtual",
    icon: Wallet,
    badgeBg: "bg-gray-100 text-gray-700",
  },
};

const MONEDA_SYMBOL: Record<string, string> = {
  UYU: "$",
  USD: "U$S",
};

function AnimatedCounter({ value, prefix = "" }: { value: number; prefix?: string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) {
      setDisplay(0);
      return;
    }
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

  return (
    <span className="tabular-nums">
      {prefix}
      {display.toLocaleString("es-UY")}
    </span>
  );
}

export default function CuentaDetallePage() {
  useDocumentTitle("Cuenta");
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [cuenta, setCuenta] = useState<CuentaDetalle | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loadingCuenta, setLoadingCuenta] = useState(true);
  const [loadingMovimientos, setLoadingMovimientos] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalMovimientos, setTotalMovimientos] = useState(0);

  const fetchCuenta = useCallback(async () => {
    setLoadingCuenta(true);
    try {
      const res = await fetch(`/api/tesoreria/cuentas/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          toast.error("Cuenta no encontrada");
          router.push("/tesoreria/cuentas");
          return;
        }
        throw new Error("Error al cargar cuenta");
      }
      const data = await res.json();
      setCuenta(data.cuenta);
    } catch {
      toast.error("Error al cargar la cuenta");
      router.push("/tesoreria/cuentas");
    } finally {
      setLoadingCuenta(false);
    }
  }, [id, router]);

  const fetchMovimientos = useCallback(async () => {
    setLoadingMovimientos(true);
    try {
      const limit = 20;
      const offset = (page - 1) * limit;
      const res = await fetch(
        `/api/tesoreria/movimientos?cuenta_id=${id}&limit=${limit}&offset=${offset}`
      );
      if (!res.ok) throw new Error("Error al cargar movimientos");
      const data = await res.json();
      setMovimientos(data.movimientos || []);
      setTotalMovimientos(data.total || 0);
      setTotalPages(Math.ceil((data.total || 0) / limit));
    } catch {
      toast.error("Error al cargar los movimientos");
    } finally {
      setLoadingMovimientos(false);
    }
  }, [id, page]);

  useEffect(() => {
    fetchCuenta();
  }, [fetchCuenta]);

  useEffect(() => {
    fetchMovimientos();
  }, [fetchMovimientos]);

  if (loadingCuenta || !cuenta) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const tipoConfig = TIPO_CONFIG[cuenta.tipo];
  const TipoIcon = tipoConfig.icon;
  const symbol = MONEDA_SYMBOL[cuenta.moneda] || "$";

  const ingresosTotal = movimientos
    .filter((m) => m.tipo === "ingreso")
    .reduce((sum, m) => sum + m.monto, 0);
  const egresosTotal = movimientos
    .filter((m) => m.tipo === "egreso")
    .reduce((sum, m) => sum + m.monto, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6 lg:space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Link
          href="/tesoreria/cuentas"
          className="inline-flex items-center gap-1.5 text-sm font-body text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="size-4" />
          Volver a cuentas
        </Link>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div
                className="size-3 rounded-full shrink-0"
                style={{ backgroundColor: cuenta.color || "#730d32" }}
              />
              <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
                {cuenta.nombre}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <Badge
                variant="secondary"
                className={`text-[10px] font-body ${tipoConfig.badgeBg}`}
              >
                <TipoIcon className="size-3 mr-1" />
                {tipoConfig.label}
              </Badge>
              <Badge variant="outline" className="text-[10px] font-body">
                {cuenta.moneda}
              </Badge>
              {!cuenta.activa && (
                <Badge variant="outline" className="text-[10px] font-body text-red-600 border-red-200">
                  Inactiva
                </Badge>
              )}
              {cuenta.banco && (
                <span className="font-body text-xs text-muted-foreground">
                  {cuenta.banco}
                  {cuenta.numero_cuenta && ` \u00B7 ${cuenta.numero_cuenta}`}
                </span>
              )}
            </div>
            {cuenta.descripcion && (
              <p className="mt-2 font-body text-sm text-muted-foreground">
                {cuenta.descripcion}
              </p>
            )}
          </div>

          <Link href="/tesoreria/movimientos">
            <Button className="w-full sm:w-auto">
              <Plus className="size-4" />
              Movimiento
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* Balance + Summary Cards */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4"
      >
        {/* Saldo Actual */}
        <motion.div variants={fadeInUp} transition={springSmooth} className="sm:col-span-1">
          <Card className="relative overflow-hidden border-linea h-full">
            <div
              className="absolute top-0 left-0 w-full h-1"
              style={{ backgroundColor: cuenta.color || "#730d32" }}
            />
            <CardContent className="p-5">
              <p className="font-body text-xs text-muted-foreground mb-1">
                Saldo actual
              </p>
              <p className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
                <AnimatedCounter value={cuenta.saldo_actual} prefix={`${symbol} `} />
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Ingresos (this page) */}
        <motion.div variants={fadeInUp} transition={springSmooth}>
          <Card className="border-linea h-full">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-1">
                <ArrowDownRight className="size-3.5 text-emerald-600" />
                <p className="font-body text-xs text-muted-foreground">
                  Ingresos (pagina)
                </p>
              </div>
              <p className="font-display text-xl uppercase tracking-tightest text-emerald-700">
                <AnimatedCounter value={ingresosTotal} prefix={`${symbol} `} />
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Egresos (this page) */}
        <motion.div variants={fadeInUp} transition={springSmooth}>
          <Card className="border-linea h-full">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-1">
                <ArrowUpRight className="size-3.5 text-red-600" />
                <p className="font-body text-xs text-muted-foreground">
                  Egresos (pagina)
                </p>
              </div>
              <p className="font-display text-xl uppercase tracking-tightest text-red-700">
                <AnimatedCounter value={egresosTotal} prefix={`${symbol} `} />
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Movements Table */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.5 }}
      >
        <Card className="border-linea">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="font-heading text-sm uppercase tracking-editorial">
              Movimientos
              {totalMovimientos > 0 && (
                <span className="ml-2 text-muted-foreground font-body text-xs normal-case">
                  ({totalMovimientos} total)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingMovimientos ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : movimientos.length === 0 ? (
              <div className="py-12 text-center">
                <p className="font-body text-sm text-muted-foreground">
                  No hay movimientos registrados para esta cuenta
                </p>
                <Link
                  href="/tesoreria/movimientos"
                  className="mt-3 inline-block text-sm text-bordo-700 hover:text-bordo-800 font-body font-medium"
                >
                  Registrar primer movimiento
                </Link>
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-linea overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="font-heading uppercase tracking-editorial text-[10px]">
                          Fecha
                        </TableHead>
                        <TableHead className="font-heading uppercase tracking-editorial text-[10px] min-w-[180px]">
                          Descripcion
                        </TableHead>
                        <TableHead className="font-heading uppercase tracking-editorial text-[10px] hidden sm:table-cell">
                          Categoria
                        </TableHead>
                        <TableHead className="font-heading uppercase tracking-editorial text-[10px] hidden md:table-cell">
                          Referencia
                        </TableHead>
                        <TableHead className="font-heading uppercase tracking-editorial text-[10px] text-right">
                          Monto
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <AnimatePresence>
                        {movimientos.map((mov) => {
                          const isIngreso = mov.tipo === "ingreso";
                          return (
                            <motion.tr
                              key={mov.id}
                              variants={fadeInUp}
                              initial="hidden"
                              animate="visible"
                              className="border-b border-linea last:border-0 transition-colors hover:bg-superficie/50"
                            >
                              <TableCell className="font-body text-sm text-muted-foreground whitespace-nowrap">
                                {new Date(mov.fecha).toLocaleDateString("es-UY", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "2-digit",
                                })}
                              </TableCell>
                              <TableCell className="font-body text-sm">
                                <div className="flex items-center gap-2">
                                  <div
                                    className={`size-1.5 rounded-full shrink-0 ${
                                      isIngreso ? "bg-emerald-500" : "bg-red-500"
                                    }`}
                                  />
                                  <span className="line-clamp-1">{mov.descripcion}</span>
                                </div>
                                {/* Mobile: category inline */}
                                {mov.categorias_financieras && (
                                  <span className="font-body text-xs text-muted-foreground sm:hidden">
                                    {mov.categorias_financieras.nombre}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="hidden sm:table-cell">
                                {mov.categorias_financieras ? (
                                  <div className="flex items-center gap-1.5">
                                    {mov.categorias_financieras.color && (
                                      <div
                                        className="size-2 rounded-full shrink-0"
                                        style={{
                                          backgroundColor:
                                            mov.categorias_financieras.color,
                                        }}
                                      />
                                    )}
                                    <span className="font-body text-xs text-muted-foreground">
                                      {mov.categorias_financieras.nombre}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="font-body text-xs text-muted-foreground">
                                    —
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="font-body text-xs text-muted-foreground hidden md:table-cell">
                                {mov.referencia || "—"}
                              </TableCell>
                              <TableCell className="text-right whitespace-nowrap">
                                <span
                                  className={`font-body text-sm font-medium ${
                                    isIngreso
                                      ? "text-emerald-700"
                                      : "text-red-700"
                                  }`}
                                >
                                  {isIngreso ? "+" : "-"}
                                  {symbol}{" "}
                                  {mov.monto.toLocaleString("es-UY")}
                                </span>
                              </TableCell>
                            </motion.tr>
                          );
                        })}
                      </AnimatePresence>
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground font-body hidden sm:block">
                      Mostrando {(page - 1) * 20 + 1}-
                      {Math.min(page * 20, totalMovimientos)} de{" "}
                      {totalMovimientos}
                    </p>
                    <div className="flex items-center gap-2 mx-auto sm:mx-0">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        <ChevronLeft className="size-4" />
                        <span className="hidden sm:inline">Anterior</span>
                      </Button>
                      <span className="text-sm text-muted-foreground font-body tabular-nums px-2">
                        {page} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        <span className="hidden sm:inline">Siguiente</span>
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
