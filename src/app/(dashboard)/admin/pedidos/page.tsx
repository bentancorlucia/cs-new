"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Package,
  ChevronLeft,
  ChevronRight,
  Eye,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase/client";
import { fadeInUp } from "@/lib/motion";
import { cn } from "@/lib/utils";

type EstadoPedido = "pendiente" | "pagado" | "preparando" | "listo_retiro" | "retirado" | "cancelado";

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

const estadoConfig: Record<EstadoPedido, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pendiente: { label: "Pendiente", variant: "outline" },
  pagado: { label: "Pagado", variant: "default" },
  preparando: { label: "Preparando", variant: "secondary" },
  listo_retiro: { label: "Listo retiro", variant: "secondary" },
  retirado: { label: "Retirado", variant: "outline" },
  cancelado: { label: "Cancelado", variant: "destructive" },
};

export default function AdminPedidosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("");
  const [tipo, setTipo] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchPedidos = useCallback(async () => {
    setLoading(true);
    const supabase = createBrowserClient();
    const limit = 20;
    const offset = (page - 1) * limit;

    let query = supabase
      .from("pedidos")
      .select("*, perfiles(nombre, apellido, telefono)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (estado) query = query.eq("estado", estado);
    if (tipo) query = query.eq("tipo", tipo);
    if (search) {
      query = query.or(`numero_pedido.ilike.%${search}%,nombre_cliente.ilike.%${search}%`);
    }

    const { data, count } = await query;
    setPedidos((data as unknown as Pedido[]) || []);
    setTotal(count || 0);
    setTotalPages(Math.ceil((count || 0) / limit));
    setLoading(false);
  }, [search, estado, tipo, page]);

  useEffect(() => {
    fetchPedidos();
  }, [fetchPedidos]);

  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  function getNombreCliente(pedido: Pedido) {
    if (pedido.perfiles) return `${pedido.perfiles.nombre} ${pedido.perfiles.apellido}`;
    return pedido.nombre_cliente || "—";
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
          Pedidos
        </h1>
        <p className="mt-1 text-sm text-muted-foreground font-body">
          {total > 0 && `${total} pedidos · `}Gestión de pedidos online y POS
        </p>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="flex flex-col gap-3 sm:flex-row"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por número o cliente..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={estado || "todos"} onValueChange={(v) => { setEstado(!v || v === "todos" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pendiente">Pendiente</SelectItem>
              <SelectItem value="pagado">Pagado</SelectItem>
              <SelectItem value="preparando">Preparando</SelectItem>
              <SelectItem value="listo_retiro">Listo retiro</SelectItem>
              <SelectItem value="retirado">Retirado</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tipo || "todos"} onValueChange={(v) => { setTipo(!v || v === "todos" ? "" : v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-28">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="pos">POS</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="rounded-xl border border-linea bg-white overflow-hidden"
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-heading uppercase tracking-editorial text-xs min-w-[120px]">Pedido</TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-xs min-w-[140px]">Cliente</TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-xs text-center hidden sm:table-cell">Tipo</TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-xs text-right">Total</TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-xs text-center">Estado</TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-xs hidden md:table-cell">Fecha</TableHead>
                <TableHead className="w-12 font-heading uppercase tracking-editorial text-xs"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell className="hidden sm:table-cell"><Skeleton className="mx-auto h-5 w-12 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="ml-auto h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="mx-auto h-5 w-16 rounded-full" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  </TableRow>
                ))
              ) : pedidos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-16 text-center text-muted-foreground">
                    <Package className="mx-auto mb-3 size-12 opacity-15" />
                    <p className="font-body text-sm">No se encontraron pedidos</p>
                  </TableCell>
                </TableRow>
              ) : (
                <AnimatePresence>
                  {pedidos.map((pedido) => {
                    const cfg = estadoConfig[pedido.estado];
                    return (
                      <motion.tr
                        key={pedido.id}
                        variants={fadeInUp}
                        initial="hidden"
                        animate="visible"
                        className="border-b border-linea last:border-0 transition-colors hover:bg-superficie/50"
                      >
                        <TableCell className="py-3">
                          <Link
                            href={`/admin/pedidos/${pedido.id}`}
                            className="font-mono text-sm font-medium hover:text-bordo-700 transition-colors"
                          >
                            {pedido.numero_pedido}
                          </Link>
                          {/* Show date on mobile under pedido number */}
                          <p className="text-[11px] text-muted-foreground font-body md:hidden mt-0.5">
                            {new Date(pedido.created_at).toLocaleDateString("es-UY", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "2-digit",
                            })}
                          </p>
                        </TableCell>
                        <TableCell className="text-sm font-body py-3">
                          <span className="line-clamp-1">{getNombreCliente(pedido)}</span>
                          {/* Show type on mobile */}
                          <span className="sm:hidden text-[11px] text-muted-foreground">
                            {pedido.tipo.toUpperCase()}
                          </span>
                        </TableCell>
                        <TableCell className="text-center hidden sm:table-cell">
                          <Badge variant="outline" className="text-[10px]">
                            {pedido.tipo.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-body text-sm font-medium tabular-nums py-3">
                          ${pedido.total.toLocaleString("es-UY")}
                        </TableCell>
                        <TableCell className="text-center py-3">
                          <Badge variant={cfg.variant}>{cfg.label}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground font-body hidden md:table-cell">
                          {new Date(pedido.created_at).toLocaleDateString("es-UY", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="py-3">
                          <Link href={`/admin/pedidos/${pedido.id}`}>
                            <Button variant="ghost" size="icon-sm">
                              <Eye className="size-3.5" />
                            </Button>
                          </Link>
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground font-body hidden sm:block">
            Mostrando {(page - 1) * 20 + 1}-{Math.min(page * 20, total)} de {total}
          </p>
          <div className="flex items-center gap-2 mx-auto sm:mx-0">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="size-4" />
              <span className="hidden sm:inline">Anterior</span>
            </Button>
            <span className="text-sm text-muted-foreground font-body tabular-nums px-2">
              {page} / {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <span className="hidden sm:inline">Siguiente</span>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
