"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Plus,
  Truck,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
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
import { fadeInUp } from "@/lib/motion";
import { toast } from "sonner";
import { useDocumentTitle } from "@/hooks/use-document-title";

interface Proveedor {
  id: number;
  nombre: string;
  rut: string | null;
  razon_social: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  contacto_email: string | null;
  saldo_cuenta_corriente: number;
  activo: boolean;
  created_at: string;
}

export default function AdminProveedoresPage() {
  useDocumentTitle("Proveedores");
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const fetchProveedores = useCallback(async () => {
    setLoading(true);
    const supabase = createBrowserClient();
    const limit = 20;
    const offset = (page - 1) * limit;

    let query = supabase
      .from("proveedores")
      .select("*", { count: "exact" })
      .order("nombre", { ascending: true })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(
        `nombre.ilike.%${search}%,rut.ilike.%${search}%,razon_social.ilike.%${search}%`
      );
    }
    if (estado === "activo") query = query.eq("activo", true);
    if (estado === "inactivo") query = query.eq("activo", false);
    if (estado === "con_deuda") query = query.gt("saldo_cuenta_corriente", 0);

    const { data, count } = await query;
    setProveedores((data as unknown as Proveedor[]) || []);
    setTotal(count || 0);
    setTotalPages(Math.ceil((count || 0) / limit));
    setLoading(false);
  }, [search, estado, page]);

  useEffect(() => {
    fetchProveedores();
  }, [fetchProveedores]);

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
    const res = await fetch(`/api/admin/proveedores/${deleteId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Proveedor eliminado");
      setDeleteId(null);
      fetchProveedores();
    } else {
      const data = await res.json();
      toast.error(data.error || "Error al eliminar");
    }
  }

  function formatCurrency(n: number) {
    return `$${Math.abs(n).toLocaleString("es-UY")}`;
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
            Proveedores
          </h1>
          <p className="mt-1 text-sm text-muted-foreground font-body">
            {total > 0 && `${total} proveedores · `}Gestión de proveedores y cuentas corrientes
          </p>
        </div>
        <Link href="/admin/proveedores/nuevo">
          <Button className="w-full sm:w-auto">
            <Plus className="size-4" />
            Nuevo proveedor
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
            placeholder="Buscar por nombre, RUT o razón social..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={estado || "todos"}
          onValueChange={(v) => {
            setEstado(!v || v === "todos" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="activo">Activos</SelectItem>
            <SelectItem value="inactivo">Inactivos</SelectItem>
            <SelectItem value="con_deuda">Con deuda</SelectItem>
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
                <TableHead className="font-heading uppercase tracking-editorial text-xs min-w-[180px]">Proveedor</TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-xs hidden md:table-cell">RUT</TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-xs hidden lg:table-cell">Contacto</TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-xs text-right">Saldo CC</TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-xs text-center hidden sm:table-cell">Estado</TableHead>
                <TableHead className="w-12 font-heading uppercase tracking-editorial text-xs"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="ml-auto h-4 w-20" /></TableCell>
                    <TableCell className="hidden sm:table-cell"><Skeleton className="mx-auto h-5 w-16 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                  </TableRow>
                ))
              ) : proveedores.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-16 text-center text-muted-foreground"
                  >
                    <Truck className="mx-auto mb-3 size-12 opacity-15" />
                    <p className="font-body text-sm">No se encontraron proveedores</p>
                    <Link href="/admin/proveedores/nuevo" className="mt-3 inline-block text-sm text-bordo-700 hover:text-bordo-800 font-medium">
                      Agregar primer proveedor
                    </Link>
                  </TableCell>
                </TableRow>
              ) : (
                <AnimatePresence>
                  {proveedores.map((prov) => (
                    <motion.tr
                      key={prov.id}
                      variants={fadeInUp}
                      initial="hidden"
                      animate="visible"
                      className="group border-b border-linea last:border-0 transition-colors hover:bg-superficie/50"
                    >
                      <TableCell className="py-3">
                        <Link
                          href={`/admin/proveedores/${prov.id}`}
                          className="font-body text-sm font-medium hover:text-bordo-700 transition-colors"
                        >
                          {prov.nombre}
                        </Link>
                        {prov.razon_social && (
                          <p className="text-xs text-muted-foreground font-body">
                            {prov.razon_social}
                          </p>
                        )}
                        {/* Mobile: show RUT + status */}
                        <div className="flex items-center gap-2 mt-0.5 md:hidden">
                          {prov.rut && (
                            <span className="text-xs text-muted-foreground font-body">
                              RUT: {prov.rut}
                            </span>
                          )}
                        </div>
                        <div className="sm:hidden mt-1">
                          {prov.activo ? (
                            <Badge variant="secondary" className="text-[9px] py-0 h-4">Activo</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] py-0 h-4">Inactivo</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground font-body hidden md:table-cell">
                        {prov.rut || "—"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell py-3">
                        {prov.contacto_nombre && (
                          <p className="text-sm font-body">{prov.contacto_nombre}</p>
                        )}
                        {prov.contacto_telefono && (
                          <p className="text-xs text-muted-foreground font-body">
                            {prov.contacto_telefono}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right py-3">
                        {prov.saldo_cuenta_corriente > 0 ? (
                          <span className="inline-flex items-center gap-1 font-body text-sm font-semibold text-amber-600 tabular-nums">
                            {formatCurrency(prov.saldo_cuenta_corriente)}
                            <ArrowUpRight className="size-3" />
                          </span>
                        ) : (
                          <span className="text-muted-foreground font-body text-sm">$0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center hidden sm:table-cell">
                        {prov.activo ? (
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
                              render={<Link href={`/admin/proveedores/${prov.id}`} />}
                            >
                              <Edit className="size-3.5 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDeleteId(prov.id)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="size-3.5 mr-2" />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </motion.tr>
                  ))}
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

      {/* Delete dialog */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar proveedor</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Estás seguro de que querés eliminar este proveedor? Esta acción no
            se puede deshacer.
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
