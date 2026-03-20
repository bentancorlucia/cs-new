"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Package,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightSmall,
  Clock,
  CreditCard,
  Truck,
  CheckCircle,
  XCircle,
  ArrowRight,
  Eye,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fadeInUp, staggerContainer, staggerContainerFast, springSmooth } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type EstadoPedido = "pendiente" | "pendiente_verificacion" | "pagado" | "preparando" | "listo_retiro" | "retirado" | "cancelado";

interface Pedido {
  id: number;
  numero_pedido: string;
  tipo: "online" | "pos";
  estado: EstadoPedido;
  total: number;
  nombre_cliente: string | null;
  created_at: string;
  perfiles: { nombre: string; apellido: string; telefono: string | null } | null;
}

const tabs: { key: EstadoPedido | ""; label: string; icon: any; color: string }[] = [
  { key: "", label: "Todos", icon: Package, color: "bg-muted text-foreground" },
  { key: "pendiente_verificacion", label: "Por conciliar", icon: Building2, color: "bg-orange-100 text-orange-700" },
  { key: "pagado", label: "Pagados", icon: CreditCard, color: "bg-emerald-100 text-emerald-700" },
  { key: "preparando", label: "Preparando", icon: Package, color: "bg-amber-100 text-amber-700" },
  { key: "listo_retiro", label: "Listo", icon: Truck, color: "bg-blue-100 text-blue-700" },
  { key: "retirado", label: "Retirados", icon: CheckCircle, color: "bg-muted text-muted-foreground" },
  { key: "cancelado", label: "Cancelados", icon: XCircle, color: "bg-red-50 text-red-600" },
];

const nextEstado: Record<string, EstadoPedido> = {
  pagado: "preparando",
  preparando: "listo_retiro",
  listo_retiro: "retirado",
};

const nextLabel: Record<string, string> = {
  pagado: "Preparar",
  preparando: "Listo",
  listo_retiro: "Retirado",
};

const estadoBadge: Record<EstadoPedido, { label: string; className: string }> = {
  pendiente: { label: "Pendiente", className: "bg-gray-100 text-gray-600 border-gray-200" },
  pendiente_verificacion: { label: "Por conciliar", className: "bg-orange-50 text-orange-700 border-orange-200" },
  pagado: { label: "Pagado", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  preparando: { label: "Preparando", className: "bg-amber-50 text-amber-700 border-amber-200" },
  listo_retiro: { label: "Listo retiro", className: "bg-blue-50 text-blue-700 border-blue-200" },
  retirado: { label: "Retirado", className: "bg-gray-50 text-gray-500 border-gray-200" },
  cancelado: { label: "Cancelado", className: "bg-red-50 text-red-600 border-red-200" },
};

export default function AdminPedidosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<EstadoPedido | "">("");
  const [tipo, setTipo] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const fetchPedidos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      if (estado) params.set("estado", estado);
      if (tipo) params.set("tipo", tipo);
      if (search) params.set("search", search);

      const res = await fetch(`/api/admin/pedidos?${params.toString()}`);
      if (!res.ok) throw new Error("Error al cargar pedidos");

      const json = await res.json();
      setPedidos(json.data || []);
      setTotal(json.pagination?.total || 0);
      setTotalPages(json.pagination?.totalPages || 1);
      if (json.counts) setCounts(json.counts);
    } catch {
      setPedidos([]);
      setTotal(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [search, estado, tipo, page]);

  useEffect(() => {
    fetchPedidos();
  }, [fetchPedidos]);

  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  function getNombre(pedido: Pedido) {
    if (pedido.perfiles) return `${pedido.perfiles.nombre} ${pedido.perfiles.apellido}`;
    return pedido.nombre_cliente || "—";
  }

  async function avanzarEstado(pedido: Pedido) {
    const next = nextEstado[pedido.estado];
    if (!next) return;
    setUpdatingId(pedido.id);
    try {
      const res = await fetch(`/api/admin/pedidos/${pedido.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: next }),
      });
      if (res.ok) {
        setPedidos((prev) =>
          prev.map((p) => (p.id === pedido.id ? { ...p, estado: next } : p))
        );
        toast.success(`${pedido.numero_pedido} → ${estadoBadge[next].label}`);
      } else {
        toast.error("Error al actualizar");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setUpdatingId(null);
    }
  }

  function formatFecha(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = diffMs / (1000 * 60 * 60);

    if (diffH < 1) return `hace ${Math.max(1, Math.floor(diffMs / 60000))} min`;
    if (diffH < 24) return `hace ${Math.floor(diffH)}h`;
    if (diffH < 48) return "ayer";
    return d.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit" });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
          Pedidos
        </h1>
      </motion.div>

      {/* Tab filters */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.05 }}
        className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide"
      >
        {tabs.map((tab) => {
          const isActive = estado === tab.key;
          const count = tab.key ? counts[tab.key] : total;
          return (
            <button
              key={tab.key}
              onClick={() => { setEstado(tab.key as EstadoPedido | ""); setPage(1); }}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all",
                isActive
                  ? "bg-bordo-800 text-white shadow-sm"
                  : "bg-superficie hover:bg-superficie/80 text-texto-secondary"
              )}
            >
              <tab.icon className="size-3.5" />
              {tab.label}
              {count !== undefined && count > 0 && (
                <span
                  className={cn(
                    "ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums leading-none",
                    isActive ? "bg-white/20 text-white" : "bg-black/5 text-texto-secondary"
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </motion.div>

      {/* Search + tipo filter */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar pedido o cliente..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={tipo || "todos"} onValueChange={(v) => { setTipo(!v || v === "todos" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-24 h-9 text-xs">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="online">Online</SelectItem>
            <SelectItem value="pos">POS</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      {/* Orders list */}
      <motion.div
        variants={staggerContainerFast}
        initial="hidden"
        animate="visible"
        className="space-y-2"
      >
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-linea bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-8 w-20 rounded-lg" />
              </div>
            </div>
          ))
        ) : pedidos.length === 0 ? (
          <motion.div
            variants={fadeInUp}
            className="rounded-xl border border-dashed border-linea py-16 text-center"
          >
            <Package className="mx-auto mb-3 size-12 opacity-15" />
            <p className="text-sm text-muted-foreground">No se encontraron pedidos</p>
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout">
            {pedidos.map((pedido) => {
              const badge = estadoBadge[pedido.estado];
              const next = nextEstado[pedido.estado];
              const isUpdating = updatingId === pedido.id;

              return (
                <motion.div
                  key={pedido.id}
                  variants={fadeInUp}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={springSmooth}
                  layout
                  className="group rounded-xl border border-linea bg-white transition-shadow hover:shadow-sm"
                >
                  <div className="flex items-center gap-3 p-3 sm:p-4">
                    {/* Left: order info */}
                    <Link
                      href={`/admin/pedidos/${pedido.id}`}
                      className="flex-1 min-w-0"
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-sm font-semibold text-foreground truncate">
                          {pedido.numero_pedido}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none",
                            badge.className
                          )}
                        >
                          {badge.label}
                        </span>
                        {pedido.tipo === "pos" && (
                          <span className="text-[10px] font-medium text-muted-foreground bg-muted rounded px-1 py-0.5">
                            POS
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{getNombre(pedido)}</span>
                        <span className="text-linea">·</span>
                        <span className="shrink-0">{formatFecha(pedido.created_at)}</span>
                      </div>
                    </Link>

                    {/* Right: total + action */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold tabular-nums">
                        ${pedido.total.toLocaleString("es-UY")}
                      </span>

                      {pedido.estado === "pendiente_verificacion" ? (
                        <Link href={`/admin/pedidos/${pedido.id}`}>
                          <Button
                            size="sm"
                            className="h-8 gap-1 text-xs bg-orange-600 hover:bg-orange-700"
                          >
                            Verificar
                            <ArrowRight className="size-3" />
                          </Button>
                        </Link>
                      ) : next ? (
                        <Button
                          size="sm"
                          onClick={(e) => { e.preventDefault(); avanzarEstado(pedido); }}
                          disabled={isUpdating}
                          className="h-8 gap-1 text-xs"
                        >
                          {isUpdating ? (
                            <span className="size-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          ) : (
                            <>
                              {nextLabel[pedido.estado]}
                              <ArrowRight className="size-3" />
                            </>
                          )}
                        </Button>
                      ) : (
                        <Link href={`/admin/pedidos/${pedido.id}`}>
                          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground">
                            <Eye className="size-3.5" />
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </motion.div>

      {/* Pagination */}
      {totalPages > 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-between pt-2"
        >
          <p className="text-xs text-muted-foreground hidden sm:block">
            {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} de {total}
          </p>
          <div className="flex items-center gap-2 mx-auto sm:mx-0">
            <Button variant="outline" size="sm" className="h-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums px-1">
              {page}/{totalPages}
            </span>
            <Button variant="outline" size="sm" className="h-8" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
