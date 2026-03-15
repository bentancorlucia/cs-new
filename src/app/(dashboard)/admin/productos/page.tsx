"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Plus,
  Package,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  MoreHorizontal,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createBrowserClient } from "@/lib/supabase/client";
import { staggerContainerFast, fadeInUp } from "@/lib/motion";
import { toast } from "sonner";

interface Producto {
  id: number;
  nombre: string;
  slug: string;
  precio: number;
  precio_socio: number | null;
  sku: string | null;
  stock_actual: number;
  stock_minimo: number;
  activo: boolean;
  destacado: boolean;
  created_at: string;
  categorias_producto: { id: number; nombre: string } | null;
  producto_imagenes: { url: string; es_principal: boolean }[];
}

export default function AdminProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const fetchProductos = useCallback(async () => {
    setLoading(true);
    const supabase = createBrowserClient();
    const limit = 20;
    const offset = (page - 1) * limit;

    let query = supabase
      .from("productos")
      .select(
        "*, categorias_producto(id, nombre), producto_imagenes(url, es_principal)",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`nombre.ilike.%${search}%,sku.ilike.%${search}%`);
    }
    if (estado === "activo") query = query.eq("activo", true);
    if (estado === "inactivo") query = query.eq("activo", false);
    if (estado === "agotado") query = query.eq("stock_actual", 0);

    const { data, count } = await query;
    setProductos((data as unknown as Producto[]) || []);
    setTotal(count || 0);
    setTotalPages(Math.ceil((count || 0) / limit));
    setLoading(false);
  }, [search, estado, page]);

  useEffect(() => {
    fetchProductos();
  }, [fetchProductos]);

  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  async function handleDelete() {
    if (!deleteId) return;
    const res = await fetch(`/api/admin/productos/${deleteId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Producto eliminado");
      setDeleteId(null);
      fetchProductos();
    } else {
      toast.error("Error al eliminar");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
            Productos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground font-body">
            {total > 0 && `${total} productos · `}Gestión del catálogo de la tienda
          </p>
        </div>
        <Link href="/admin/productos/nuevo">
          <Button className="w-full sm:w-auto">
            <Plus className="size-4" />
            Nuevo producto
          </Button>
        </Link>
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
            placeholder="Buscar por nombre o SKU..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={estado || "todos"} onValueChange={(v) => { setEstado(!v || v === "todos" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="activo">Activos</SelectItem>
            <SelectItem value="inactivo">Inactivos</SelectItem>
            <SelectItem value="agotado">Agotados</SelectItem>
          </SelectContent>
        </Select>
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
                <TableHead className="w-12 font-heading uppercase tracking-editorial text-xs"></TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-xs min-w-[200px]">Producto</TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-xs hidden md:table-cell">Categoría</TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-xs text-right">Precio</TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-xs text-center hidden sm:table-cell">Stock</TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-xs text-center hidden lg:table-cell">Estado</TableHead>
                <TableHead className="w-12 font-heading uppercase tracking-editorial text-xs"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="size-10 rounded-lg" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="ml-auto h-4 w-16" /></TableCell>
                    <TableCell className="hidden sm:table-cell"><Skeleton className="mx-auto h-4 w-12" /></TableCell>
                    <TableCell className="hidden lg:table-cell"><Skeleton className="mx-auto h-5 w-16 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  </TableRow>
                ))
              ) : productos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-16 text-center text-muted-foreground">
                    <Package className="mx-auto mb-3 size-12 opacity-15" />
                    <p className="font-body text-sm">No se encontraron productos</p>
                    <Link href="/admin/productos/nuevo" className="mt-3 inline-block text-sm text-bordo-700 hover:text-bordo-800 font-medium">
                      Crear primer producto
                    </Link>
                  </TableCell>
                </TableRow>
              ) : (
                <AnimatePresence>
                  {productos.map((prod) => {
                    const img = prod.producto_imagenes?.find((i) => i.es_principal) ?? prod.producto_imagenes?.[0];
                    const stockBajo = prod.stock_actual <= prod.stock_minimo && prod.stock_actual > 0;
                    return (
                      <motion.tr
                        key={prod.id}
                        variants={fadeInUp}
                        initial="hidden"
                        animate="visible"
                        className="group border-b border-linea last:border-0 transition-colors hover:bg-superficie/50"
                      >
                        <TableCell className="py-3">
                          <div className="relative size-10 overflow-hidden rounded-lg bg-muted shrink-0">
                            {img ? (
                              <Image
                                src={img.url}
                                alt={prod.nombre}
                                fill
                                className="object-cover"
                                sizes="40px"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center">
                                <Package className="size-4 opacity-30" />
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="min-w-0">
                            <Link
                              href={`/admin/productos/${prod.id}`}
                              className="font-body text-sm font-medium hover:text-bordo-700 transition-colors line-clamp-1"
                            >
                              {prod.nombre}
                            </Link>
                            <div className="flex items-center gap-2 mt-0.5">
                              {prod.sku && (
                                <span className="text-xs text-muted-foreground font-body">
                                  SKU: {prod.sku}
                                </span>
                              )}
                              {/* Show category inline on mobile */}
                              {prod.categorias_producto && (
                                <span className="text-xs text-muted-foreground font-body md:hidden">
                                  · {prod.categorias_producto.nombre}
                                </span>
                              )}
                            </div>
                            {/* Mobile-only: stock + status */}
                            <div className="flex items-center gap-2 mt-1 sm:hidden">
                              <span className={`text-xs font-body ${prod.stock_actual === 0 ? "text-destructive font-medium" : stockBajo ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                                Stock: {prod.stock_actual}
                              </span>
                              {!prod.activo && (
                                <Badge variant="outline" className="text-[9px] py-0 h-4">Inactivo</Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground font-body hidden md:table-cell">
                          {prod.categorias_producto?.nombre || "—"}
                        </TableCell>
                        <TableCell className="text-right py-3">
                          <span className="font-body text-sm font-medium">
                            ${prod.precio.toLocaleString("es-UY")}
                          </span>
                          {prod.precio_socio && (
                            <p className="text-xs text-muted-foreground font-body">
                              Socio: ${prod.precio_socio.toLocaleString("es-UY")}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-center hidden sm:table-cell">
                          <span className={`font-body text-sm ${stockBajo ? "text-amber-600 font-medium" : prod.stock_actual === 0 ? "text-destructive font-medium" : ""}`}>
                            {prod.stock_actual}
                          </span>
                          {stockBajo && <AlertTriangle className="ml-1 inline size-3 text-amber-500" />}
                        </TableCell>
                        <TableCell className="text-center hidden lg:table-cell">
                          {prod.activo ? (
                            <Badge variant="secondary">Activo</Badge>
                          ) : (
                            <Badge variant="outline">Inactivo</Badge>
                          )}
                        </TableCell>
                        <TableCell className="py-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity">
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              }
                            />
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                render={<Link href={`/admin/productos/${prod.id}`} />}
                              >
                                <Edit className="size-3.5 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setDeleteId(prod.id)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="size-3.5 mr-2" />
                                Eliminar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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

      {/* Delete dialog */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar producto</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Estás seguro de que querés eliminar este producto? Esta acción no se
            puede deshacer.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
