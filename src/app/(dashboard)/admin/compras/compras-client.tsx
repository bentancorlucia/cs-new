"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Plus,
  FileText,
  ChevronLeft,
  ChevronRight,
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
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useSearchParams } from "next/navigation";

interface Compra {
  id: number;
  numero_compra: string;
  estado: string;
  subtotal: number;
  total: number;
  fecha_compra: string;
  created_at: string;
  proveedores: { id: number; nombre: string } | null;
}

const estadoColor: Record<string, string> = {
  borrador: "outline",
  confirmada: "secondary",
  recibida: "default",
  cancelada: "destructive",
};

export default function AdminComprasPage() {
  const searchParams = useSearchParams();
  const initialProveedor = searchParams.get("proveedor_id") || "";

  const [compras, setCompras] = useState<Compra[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("");
  const [proveedorFilter, setProveedorFilter] = useState(initialProveedor);
  const [proveedores, setProveedores] = useState<
    { id: number; nombre: string }[]
  >([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Fetch proveedores for filter
  useEffect(() => {
    async function load() {
      const supabase = createBrowserClient();
      const { data } = await supabase
        .from("proveedores")
        .select("id, nombre")
        .eq("activo", true)
        .order("nombre");
      setProveedores((data as any) || []);
    }
    load();
  }, []);

  const fetchCompras = useCallback(async () => {
    setLoading(true);
    const supabase = createBrowserClient();
    const limit = 20;
    const offset = (page - 1) * limit;

    let query = supabase
      .from("compras_proveedor")
      .select("*, proveedores(id, nombre)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.ilike("numero_compra", `%${search}%`);
    }
    if (estado) {
      query = query.eq("estado", estado as "borrador" | "confirmada" | "recibida" | "cancelada");
    }
    if (proveedorFilter) {
      query = query.eq("proveedor_id", parseInt(proveedorFilter));
    }

    const { data, count } = await query;
    setCompras((data as unknown as Compra[]) || []);
    setTotalPages(Math.ceil((count || 0) / limit));
    setLoading(false);
  }, [search, estado, proveedorFilter, page]);

  useEffect(() => {
    fetchCompras();
  }, [fetchCompras]);

  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  function formatCurrency(n: number) {
    return `$${n.toLocaleString("es-UY")}`;
  }

  function formatDate(d: string) {
    try {
      return format(new Date(d), "dd/MM/yy", { locale: es });
    } catch {
      return d;
    }
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold">Compras</h1>
          <p className="text-sm text-muted-foreground">
            Compras a proveedores y recepción de mercadería
          </p>
        </div>
        <Link href="/admin/compras/nueva">
          <Button>
            <Plus className="size-4" />
            Nueva compra
          </Button>
        </Link>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mb-4 flex flex-col gap-3 sm:flex-row"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por número de compra..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={proveedorFilter || "todos"}
          onValueChange={(v) => {
            setProveedorFilter(!v || v === "todos" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Proveedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los proveedores</SelectItem>
            {proveedores.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={estado || "todos"}
          onValueChange={(v) => {
            setEstado(!v || v === "todos" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="borrador">Borrador</SelectItem>
            <SelectItem value="confirmada">Confirmada</SelectItem>
            <SelectItem value="recibida">Recibida</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-center">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="ml-auto h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="mx-auto h-5 w-20 rounded-full" /></TableCell>
                </TableRow>
              ))
            ) : compras.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                  <FileText className="mx-auto mb-2 size-10 opacity-20" />
                  No se encontraron compras
                </TableCell>
              </TableRow>
            ) : (
              <AnimatePresence>
                {compras.map((c) => (
                  <motion.tr
                    key={c.id}
                    variants={fadeInUp}
                    initial="hidden"
                    animate="visible"
                    className="group border-b transition-colors hover:bg-muted/50"
                  >
                    <TableCell>
                      <Link
                        href={`/admin/compras/${c.id}`}
                        className="font-medium text-bordo hover:underline"
                      >
                        {c.numero_compra}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.proveedores ? (
                        <Link
                          href={`/admin/proveedores/${c.proveedores.id}`}
                          className="hover:text-bordo"
                        >
                          {c.proveedores.nombre}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(c.fecha_compra)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(c.total)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={(estadoColor[c.estado] as any) || "outline"}>
                        {c.estado}
                      </Badge>
                    </TableCell>
                  </motion.tr>
                ))}
              </AnimatePresence>
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
