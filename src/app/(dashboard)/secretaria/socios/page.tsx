"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Search,
  UserPlus,
  Download,
  ChevronLeft,
  ChevronRight,
  Filter,
  Users,
  Link2,
  Unlink,
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

interface PadronSocio {
  id: number;
  nombre: string;
  apellido: string;
  cedula: string;
  activo: boolean;
  perfil_id: string | null;
  padron_disciplinas: {
    id: number;
    disciplinas: { nombre: string } | null;
  }[];
  perfiles: { id: string; nombre: string; apellido: string } | null;
}

interface Disciplina {
  id: number;
  nombre: string;
}

const LIMIT = 20;

export default function SociosListPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground font-body">Cargando...</div>}>
      <SociosListContent />
    </Suspense>
  );
}

function SociosListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [socios, setSocios] = useState<PadronSocio[]>([]);
  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [activo, setActivo] = useState(searchParams.get("activo") || "todos");
  const [disciplina, setDisciplina] = useState(
    searchParams.get("disciplina") || "todas"
  );
  const [vinculado, setVinculado] = useState(
    searchParams.get("vinculado") || "todos"
  );
  const [page, setPage] = useState(
    parseInt(searchParams.get("page") || "1")
  );

  const totalPages = Math.ceil(total / LIMIT);

  const fetchSocios = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (activo !== "todos") params.set("activo", activo);
      if (disciplina !== "todas") params.set("disciplina", disciplina);
      if (vinculado !== "todos") params.set("vinculado", vinculado);
      params.set("page", String(page));
      params.set("limit", String(LIMIT));

      const res = await fetch(`/api/padron?${params.toString()}`);
      if (!res.ok) {
        setSocios([]);
        setTotal(0);
        return;
      }
      const data = await res.json();
      setSocios((data.socios as PadronSocio[]) || []);
      setTotal(data.total || 0);
    } catch {
      setSocios([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, activo, disciplina, vinculado, page]);

  useEffect(() => {
    async function loadDisciplinas() {
      const supabase = createBrowserClient();
      const { data } = await supabase
        .from("disciplinas")
        .select("id, nombre")
        .eq("activa", true)
        .order("nombre");
      setDisciplinas(data || []);
    }
    loadDisciplinas();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchSocios();
    }, 300);
    return () => clearTimeout(timer);
  }, [search, activo, disciplina, vinculado, fetchSocios]);

  useEffect(() => {
    fetchSocios();
  }, [page, fetchSocios]);

  const exportCSV = () => {
    if (!socios.length) return;
    const headers = ["Apellido", "Nombre", "Cédula", "Estado", "Vinculado", "Disciplinas"];
    const rows = socios.map((s) => [
      s.apellido,
      s.nombre,
      s.cedula || "",
      s.activo ? "Activo" : "Inactivo",
      s.perfil_id ? "Sí" : "No",
      s.padron_disciplinas
        ?.map((pd) => pd.disciplinas?.nombre)
        .filter(Boolean)
        .join("; ") || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `socios-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
            Padrón de Socios
          </h1>
          <p className="mt-1 font-body text-sm text-muted-foreground">
            {total} socios registrados
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportCSV}
            className="flex-1 sm:flex-none"
          >
            <Download className="size-4" />
            <span className="hidden sm:inline">Exportar</span>
          </Button>
          <Link href="/secretaria/socios/nuevo" className="flex-1 sm:flex-none">
            <Button className="w-full">
              <UserPlus className="size-4" />
              Nuevo socio
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="flex flex-col gap-3 sm:flex-row"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o cédula..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 font-body"
          />
        </div>
        <div className="flex gap-2">
          <Select value={activo} onValueChange={(v) => v && setActivo(v)}>
            <SelectTrigger className="flex-1 sm:w-[130px] font-body">
              <Filter className="size-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="true">Activos</SelectItem>
              <SelectItem value="false">Inactivos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={disciplina} onValueChange={(v) => v && setDisciplina(v)}>
            <SelectTrigger className="flex-1 sm:w-[150px] font-body">
              <SelectValue placeholder="Disciplina" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {disciplinas.map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>
                  {d.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={vinculado} onValueChange={(v) => v && setVinculado(v)}>
            <SelectTrigger className="flex-1 sm:w-[140px] font-body">
              <SelectValue placeholder="Vinculación" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="true">Vinculados</SelectItem>
              <SelectItem value="false">Sin vincular</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        <div className="rounded-xl border border-linea overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-heading uppercase tracking-editorial text-xs min-w-[180px]">
                    Nombre
                  </TableHead>
                  <TableHead className="font-heading uppercase tracking-editorial text-xs hidden sm:table-cell">
                    Cédula
                  </TableHead>
                  <TableHead className="font-heading uppercase tracking-editorial text-xs hidden lg:table-cell">
                    Disciplinas
                  </TableHead>
                  <TableHead className="font-heading uppercase tracking-editorial text-xs">
                    Estado
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-5 w-32" />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Skeleton className="h-5 w-24" />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Skeleton className="h-5 w-28" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-16" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : socios.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center py-16 text-muted-foreground font-body"
                    >
                      <Users className="mx-auto mb-3 size-12 opacity-15" />
                      <p className="text-sm">No se encontraron socios</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  socios.map((socio, index) => {
                    const disciplinasNames =
                      socio.padron_disciplinas
                        ?.map((pd) => pd.disciplinas?.nombre)
                        .filter(Boolean) || [];

                    return (
                      <motion.tr
                        key={socio.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03, duration: 0.3 }}
                        onClick={() =>
                          router.push(`/secretaria/socios/${socio.id}`)
                        }
                        className="cursor-pointer border-b border-linea last:border-0 hover:bg-superficie/50 transition-colors"
                      >
                        <TableCell className="py-3">
                          <div>
                            <p className="font-body text-sm font-medium text-foreground">
                              {socio.apellido}, {socio.nombre}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {socio.perfil_id ? (
                                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600">
                                  <Link2 className="size-3" />
                                  Vinculado
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                  <Unlink className="size-3" />
                                  Sin vincular
                                </span>
                              )}
                            </div>
                            {/* Mobile: show cedula + disciplines */}
                            <div className="sm:hidden mt-0.5">
                              <p className="font-body text-xs text-muted-foreground">
                                CI: {socio.cedula}
                              </p>
                            </div>
                            <div className="lg:hidden mt-1 flex flex-wrap gap-1">
                              {disciplinasNames.slice(0, 2).map((name) => (
                                <Badge
                                  key={name}
                                  variant="secondary"
                                  className="text-[9px] font-body py-0 h-4"
                                >
                                  {name}
                                </Badge>
                              ))}
                              {disciplinasNames.length > 2 && (
                                <Badge variant="secondary" className="text-[9px] font-body py-0 h-4">
                                  +{disciplinasNames.length - 2}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell font-body text-sm text-muted-foreground">
                          {socio.cedula}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {disciplinasNames.length > 0 ? (
                              disciplinasNames.map((name) => (
                                <Badge
                                  key={name}
                                  variant="secondary"
                                  className="text-[10px] font-body"
                                >
                                  {name}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-sm text-muted-foreground">
                                —
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge variant={socio.activo ? "default" : "secondary"}>
                            {socio.activo ? "Activo" : "Inactivo"}
                          </Badge>
                        </TableCell>
                      </motion.tr>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex items-center justify-between mt-4"
          >
            <p className="font-body text-sm text-muted-foreground hidden sm:block">
              Mostrando {(page - 1) * LIMIT + 1}-
              {Math.min(page * LIMIT, total)} de {total}
            </p>
            <div className="flex gap-1 mx-auto sm:mx-0">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-2 rounded-lg border border-linea text-muted-foreground hover:text-foreground hover:bg-superficie transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="size-4" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`size-9 rounded-lg text-sm font-body transition-colors ${
                      page === pageNum
                        ? "bg-bordo-800 text-white"
                        : "border border-linea text-muted-foreground hover:text-foreground hover:bg-superficie"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-lg border border-linea text-muted-foreground hover:text-foreground hover:bg-superficie transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
