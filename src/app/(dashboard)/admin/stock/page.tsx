"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  AlertTriangle,
  Package,
  TrendingDown,
  TrendingUp,
  ArrowDownUp,
  PackageX,
  BarChart3,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase/client";
import { fadeInUp, staggerContainer, springSmooth } from "@/lib/motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ProductoStock {
  id: number;
  nombre: string;
  sku: string | null;
  stock_actual: number;
  stock_minimo: number;
  stock_reservado: number;
  activo: boolean;
}

interface Movimiento {
  id: number;
  tipo: string;
  cantidad: number;
  stock_anterior: number;
  stock_nuevo: number;
  motivo: string | null;
  referencia_tipo: string | null;
  referencia_id: number | null;
  created_at: string;
  nombre_cliente?: string | null;
}

export default function AdminStockPage() {
  const [productos, setProductos] = useState<ProductoStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [soloStockBajo, setSoloStockBajo] = useState(false);

  const [ajusteProduct, setAjusteProduct] = useState<ProductoStock | null>(null);
  const [ajusteCantidad, setAjusteCantidad] = useState("");
  const [ajusteMotivo, setAjusteMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  const [historialProduct, setHistorialProduct] = useState<ProductoStock | null>(null);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loadingMov, setLoadingMov] = useState(false);

  const fetchProductos = useCallback(async () => {
    const supabase = createBrowserClient();
    let query = supabase
      .from("productos")
      .select("id, nombre, sku, stock_actual, stock_minimo, activo")
      .order("nombre");

    if (search) {
      query = query.or(`nombre.ilike.%${search}%,sku.ilike.%${search}%`);
    }

    const { data } = await query;
    let result = (data as unknown as ProductoStock[]) || [];

    // Obtener stock reservado (pedidos pendiente_verificacion)
    const { data: reservados } = await supabase
      .from("pedido_items")
      .select("producto_id, cantidad, pedidos!inner(estado)")
      .eq("pedidos.estado", "pendiente_verificacion");

    const reservadoMap: Record<number, number> = {};
    if (reservados) {
      for (const item of reservados) {
        reservadoMap[item.producto_id] = (reservadoMap[item.producto_id] || 0) + item.cantidad;
      }
    }

    result = result.map((p) => ({ ...p, stock_reservado: reservadoMap[p.id] || 0 }));

    if (soloStockBajo) {
      result = result.filter((p) => p.stock_actual <= p.stock_minimo);
    }
    setProductos(result);
    setLoading(false);
  }, [search, soloStockBajo]);

  useEffect(() => {
    fetchProductos();
  }, [fetchProductos]);

  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  async function handleAjuste() {
    if (!ajusteProduct || !ajusteCantidad || !ajusteMotivo) {
      toast.error("Completá todos los campos");
      return;
    }
    setSaving(true);

    const res = await fetch("/api/admin/stock/ajuste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        producto_id: ajusteProduct.id,
        cantidad: parseInt(ajusteCantidad),
        motivo: ajusteMotivo,
      }),
    });

    if (res.ok) {
      toast.success("Stock ajustado");
      setAjusteProduct(null);
      setAjusteCantidad("");
      setAjusteMotivo("");
      fetchProductos();
    } else {
      const err = await res.json();
      toast.error(err.error || "Error");
    }
    setSaving(false);
  }

  async function openHistorial(prod: ProductoStock) {
    setHistorialProduct(prod);
    setLoadingMov(true);
    const supabase = createBrowserClient();
    const { data } = await supabase
      .from("stock_movimientos")
      .select("*")
      .eq("producto_id", prod.id)
      .order("created_at", { ascending: false })
      .limit(20);

    // Para ventas, traer nombre del cliente del pedido
    const movs: Movimiento[] = data || [];
    const ventaMovs = movs.filter((m) => m.referencia_tipo === "pedido" && m.referencia_id);
    if (ventaMovs.length > 0) {
      const pedidoIds = [...new Set(ventaMovs.map((m) => m.referencia_id!))];
      const { data: pedidos } = await supabase
        .from("pedidos")
        .select("id, nombre_cliente, perfiles!perfil_id(nombre, apellido)")
        .in("id", pedidoIds);

      if (pedidos) {
        const pedidoMap = new Map(pedidos.map((p: any) => [p.id, p]));
        for (const mov of movs) {
          if (mov.referencia_tipo === "pedido" && mov.referencia_id) {
            const ped = pedidoMap.get(mov.referencia_id) as any;
            if (ped) {
              mov.nombre_cliente = ped.perfiles
                ? `${ped.perfiles.nombre} ${ped.perfiles.apellido}`
                : ped.nombre_cliente || null;
            }
          }
        }
      }
    }
    setMovimientos(movs);
    setLoadingMov(false);
  }

  const stockBajoCount = productos.filter(
    (p) => p.stock_actual <= p.stock_minimo && p.stock_actual > 0
  ).length;
  const agotadoCount = productos.filter((p) => p.stock_actual === 0).length;
  const reservadoTotal = productos.reduce((sum, p) => sum + p.stock_reservado, 0);

  const statsCards = [
    {
      label: "Total productos",
      value: productos.length,
      icon: Package,
      color: "text-foreground",
      bg: "bg-superficie",
    },
    {
      label: "Stock bajo",
      value: stockBajoCount,
      icon: AlertTriangle,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "Agotados",
      value: agotadoCount,
      icon: PackageX,
      color: "text-destructive",
      bg: "bg-red-50",
    },
    {
      label: "Uds. reservadas",
      value: reservadoTotal,
      icon: Clock,
      color: "text-orange-600",
      bg: "bg-orange-50",
      tooltip: "Unidades en pedidos con transferencia pendiente de verificación",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
          Stock
        </h1>
        <p className="mt-1 text-sm text-muted-foreground font-body">
          Control de inventario y movimientos
        </p>
      </motion.div>

      {/* Stats */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4"
      >
        {statsCards.map((card) => {
          const Icon = card.icon;
          return (
            <motion.div key={card.label} variants={fadeInUp} transition={springSmooth} title={"tooltip" in card ? (card as any).tooltip : undefined}>
              <Card className="border-linea">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-body text-[11px] sm:text-xs text-muted-foreground mb-1">
                        {card.label}
                      </p>
                      <p className={cn("font-display text-xl sm:text-2xl uppercase tracking-tightest", card.color)}>
                        {loading ? (
                          <span className="inline-block w-10 h-7 bg-superficie animate-pulse rounded" />
                        ) : (
                          card.value
                        )}
                      </p>
                    </div>
                    <div className={cn("p-1.5 sm:p-2 rounded-lg", card.bg)}>
                      <Icon className={cn("size-4 sm:size-5", card.color)} strokeWidth={1.5} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar producto..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant={soloStockBajo ? "default" : "outline"}
          size="sm"
          onClick={() => setSoloStockBajo(!soloStockBajo)}
          className="w-full sm:w-auto"
        >
          <AlertTriangle className="size-3.5" />
          Solo stock bajo
        </Button>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="rounded-xl border border-linea bg-white overflow-hidden"
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-heading uppercase tracking-editorial text-xs min-w-[180px]">Producto</TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-xs text-center">Stock</TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-xs text-center hidden sm:table-cell">Mínimo</TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-xs text-center hidden sm:table-cell">Estado</TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-xs w-auto"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="mx-auto h-4 w-10" /></TableCell>
                    <TableCell className="hidden sm:table-cell"><Skeleton className="mx-auto h-4 w-10" /></TableCell>
                    <TableCell className="hidden sm:table-cell"><Skeleton className="mx-auto h-5 w-14 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  </TableRow>
                ))
              ) : productos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-16 text-center text-muted-foreground">
                    <Package className="mx-auto mb-3 size-12 opacity-15" />
                    <p className="font-body text-sm">No se encontraron productos</p>
                  </TableCell>
                </TableRow>
              ) : (
                <AnimatePresence>
                  {productos.map((prod) => {
                    const bajo = prod.stock_actual <= prod.stock_minimo && prod.stock_actual > 0;
                    const agotado = prod.stock_actual === 0;
                    return (
                      <motion.tr
                        key={prod.id}
                        variants={fadeInUp}
                        initial="hidden"
                        animate="visible"
                        className="border-b border-linea last:border-0 transition-colors hover:bg-superficie/50"
                      >
                        <TableCell className="py-3">
                          <div>
                            <span className="font-body text-sm font-medium">{prod.nombre}</span>
                            {prod.sku && (
                              <p className="text-xs text-muted-foreground font-body">
                                SKU: {prod.sku}
                              </p>
                            )}
                            {/* Mobile: show estado inline */}
                            <div className="sm:hidden mt-1 flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-muted-foreground font-body">
                                Mín: {prod.stock_minimo}
                              </span>
                              {prod.stock_reservado > 0 && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] text-orange-600 font-body">
                                  <Clock className="size-2.5" />
                                  {prod.stock_reservado} res.
                                </span>
                              )}
                              {agotado ? (
                                <Badge variant="destructive" className="text-[9px] py-0 h-4">Agotado</Badge>
                              ) : bajo ? (
                                <Badge className="bg-amber-100 text-amber-700 text-[9px] py-0 h-4">Bajo</Badge>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div>
                            <span
                              className={cn(
                                "font-display text-lg tabular-nums",
                                agotado && "text-destructive",
                                bajo && "text-amber-600"
                              )}
                            >
                              {prod.stock_actual}
                            </span>
                            {prod.stock_reservado > 0 && (
                              <p className="flex items-center justify-center gap-0.5 text-[10px] text-orange-600 font-body mt-0.5" title={`${prod.stock_reservado} uds. reservadas en transferencias pendientes`}>
                                <Clock className="size-2.5" />
                                {prod.stock_reservado} reserv.
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground font-body hidden sm:table-cell">
                          {prod.stock_minimo}
                        </TableCell>
                        <TableCell className="text-center hidden sm:table-cell">
                          {agotado ? (
                            <Badge variant="destructive">Agotado</Badge>
                          ) : bajo ? (
                            <Badge className="bg-amber-100 text-amber-700">Bajo</Badge>
                          ) : (
                            <Badge variant="secondary">OK</Badge>
                          )}
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => {
                                setAjusteProduct(prod);
                                setAjusteCantidad("");
                                setAjusteMotivo("");
                              }}
                            >
                              <ArrowDownUp className="size-3" />
                              <span className="hidden sm:inline">Ajustar</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={() => openHistorial(prod)}
                            >
                              <BarChart3 className="size-3 sm:hidden" />
                              <span className="hidden sm:inline">Historial</span>
                            </Button>
                          </div>
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              )}
            </TableBody>
          </Table>
        </div>
      </motion.div>

      {/* Ajuste dialog */}
      <Dialog open={ajusteProduct !== null} onOpenChange={() => setAjusteProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar stock: {ajusteProduct?.nombre}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Stock actual: <strong>{ajusteProduct?.stock_actual}</strong>
          </p>
          <div className="space-y-3">
            <div>
              <Label>Cantidad (positivo = entrada, negativo = salida)</Label>
              <Input
                type="number"
                value={ajusteCantidad}
                onChange={(e) => setAjusteCantidad(e.target.value)}
                placeholder="ej: 10 o -5"
              />
              {ajusteCantidad && ajusteProduct && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Nuevo stock:{" "}
                  <strong>
                    {ajusteProduct.stock_actual + parseInt(ajusteCantidad || "0")}
                  </strong>
                </p>
              )}
            </div>
            <div>
              <Label>Motivo *</Label>
              <Textarea
                value={ajusteMotivo}
                onChange={(e) => setAjusteMotivo(e.target.value)}
                placeholder="Motivo del ajuste..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAjusteProduct(null)}>
              Cancelar
            </Button>
            <Button onClick={handleAjuste} disabled={saving}>
              {saving ? "Guardando..." : "Confirmar ajuste"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Historial dialog */}
      <Dialog open={historialProduct !== null} onOpenChange={() => setHistorialProduct(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Historial: {historialProduct?.nombre}</DialogTitle>
          </DialogHeader>
          {loadingMov ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : movimientos.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No hay movimientos registrados
            </p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {movimientos.map((mov) => (
                <div
                  key={mov.id}
                  className="flex items-center justify-between rounded-lg border p-3 text-sm"
                >
                  <div className="flex items-center gap-2">
                    {mov.cantidad > 0 ? (
                      <TrendingUp className="size-4 text-emerald-600 shrink-0" />
                    ) : (
                      <TrendingDown className="size-4 text-destructive shrink-0" />
                    )}
                    <div className="min-w-0">
                      <span className="font-medium capitalize">{mov.tipo}</span>
                      {mov.nombre_cliente && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {mov.nombre_cliente}
                        </p>
                      )}
                      {!mov.nombre_cliente && mov.motivo && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {mov.motivo}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <span
                      className={cn(
                        "font-mono font-bold",
                        mov.cantidad > 0 ? "text-emerald-600" : "text-destructive"
                      )}
                    >
                      {mov.cantidad > 0 ? "+" : ""}
                      {mov.cantidad}
                    </span>
                    <p className="text-[10px] text-muted-foreground">
                      {mov.stock_anterior} → {mov.stock_nuevo}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
