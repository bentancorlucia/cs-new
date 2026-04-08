"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Search,
  Users,
  Phone,
  Mail,
  User,
  ChevronLeft,
  ChevronRight,
  Filter,
  Download,
  Link2,
  Unlink,
  Calendar,
  Tag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { Button } from "@/components/ui/button";
import { staggerContainerFast, fadeInUp, springSmooth } from "@/lib/motion";
import { useDocumentTitle } from "@/hooks/use-document-title";

interface DisciplinaInfo {
  id: number;
  nombre: string;
  slug: string;
  descripcion: string | null;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  contacto_email: string | null;
  activa: boolean;
}

interface SocioDisciplina {
  id: number;
  nombre: string;
  apellido: string;
  cedula: string;
  activo: boolean;
  perfil_id: string | null;
  fecha_nacimiento: string | null;
  telefono: string | null;
  pd_categoria: string | null;
  pd_activa: boolean;
  pd_fecha_ingreso: string | null;
}

const LIMIT = 20;

export default function DisciplinaPadronPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-muted-foreground font-body">
          Cargando...
        </div>
      }
    >
      <DisciplinaPadronContent />
    </Suspense>
  );
}

function DisciplinaPadronContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [disciplina, setDisciplina] = useState<DisciplinaInfo | null>(null);
  const [socios, setSocios] = useState<SocioDisciplina[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [activo, setActivo] = useState(searchParams.get("activo") || "todos");
  const [page, setPage] = useState(
    parseInt(searchParams.get("page") || "1")
  );

  const totalPages = Math.ceil(total / LIMIT);

  useDocumentTitle(disciplina ? `${disciplina.nombre} - Padrón` : "Disciplina");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (activo !== "todos") params.set("activo", activo);
      params.set("page", String(page));
      params.set("limit", String(LIMIT));

      const res = await fetch(
        `/api/disciplinas/${id}/padron?${params.toString()}`
      );
      if (!res.ok) {
        setSocios([]);
        setTotal(0);
        return;
      }
      const data = await res.json();
      setDisciplina(data.disciplina || null);
      setSocios(data.socios || []);
      setTotal(data.total || 0);
    } catch {
      setSocios([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [id, search, activo, page]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, activo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const exportCSV = () => {
    if (!socios.length) return;
    const headers = [
      "Apellido",
      "Nombre",
      "Cedula",
      "Estado socio",
      "Categoria",
      "Fecha ingreso",
      "Vinculado",
    ];
    const rows = socios.map((s) => [
      s.apellido,
      s.nombre,
      s.cedula || "",
      s.activo ? "Activo" : "Inactivo",
      s.pd_categoria || "",
      s.pd_fecha_ingreso || "",
      s.perfil_id ? "Si" : "No",
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `padron-${disciplina?.slug || id}-${new Date().toISOString().split("T")[0]}.csv`;
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
        className="space-y-4"
      >
        <Link
          href="/secretaria/disciplinas"
          className="inline-flex items-center gap-1.5 text-sm font-body text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Disciplinas
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            {disciplina ? (
              <>
                <div className="flex items-center gap-3">
                  <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
                    {disciplina.nombre}
                  </h1>
                  <Badge variant={disciplina.activa ? "default" : "secondary"}>
                    {disciplina.activa ? "Activa" : "Inactiva"}
                  </Badge>
                </div>
                {disciplina.descripcion && (
                  <p className="mt-1 font-body text-sm text-muted-foreground max-w-lg">
                    {disciplina.descripcion}
                  </p>
                )}
                <p className="mt-1 font-body text-sm text-muted-foreground">
                  {total} socio{total !== 1 ? "s" : ""} en el padrón
                </p>
              </>
            ) : loading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            ) : (
              <h1 className="font-display text-2xl uppercase tracking-tightest text-foreground">
                Disciplina no encontrada
              </h1>
            )}
          </div>

          {/* Contact info + Export */}
          <div className="flex flex-col gap-2 items-start sm:items-end">
            {disciplina?.contacto_nombre && (
              <div className="flex items-center gap-3 text-sm font-body text-muted-foreground">
                <User className="size-3.5 shrink-0" />
                <span>{disciplina.contacto_nombre}</span>
                {disciplina.contacto_telefono && (
                  <>
                    <Phone className="size-3.5 shrink-0" />
                    <span>{disciplina.contacto_telefono}</span>
                  </>
                )}
                {disciplina.contacto_email && (
                  <>
                    <Mail className="size-3.5 shrink-0" />
                    <span>{disciplina.contacto_email}</span>
                  </>
                )}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={exportCSV}
              disabled={socios.length === 0}
            >
              <Download className="size-4" />
              Exportar CSV
            </Button>
          </div>
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
            placeholder="Buscar por nombre o cedula..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 font-body"
          />
        </div>
        <Select value={activo} onValueChange={(v) => v && setActivo(v)}>
          <SelectTrigger className="sm:w-[140px] font-body">
            <Filter className="size-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="true">Activos</SelectItem>
            <SelectItem value="false">Inactivos</SelectItem>
          </SelectContent>
        </Select>
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
                    Cedula
                  </TableHead>
                  <TableHead className="font-heading uppercase tracking-editorial text-xs hidden md:table-cell">
                    Categoria
                  </TableHead>
                  <TableHead className="font-heading uppercase tracking-editorial text-xs hidden lg:table-cell">
                    Ingreso
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
                      <TableCell className="hidden md:table-cell">
                        <Skeleton className="h-5 w-20" />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Skeleton className="h-5 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-5 w-16" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : socios.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-16 text-muted-foreground font-body"
                    >
                      <Users className="mx-auto mb-3 size-12 opacity-15" />
                      <p className="text-sm">
                        {search || activo !== "todos"
                          ? "No se encontraron socios con esos filtros"
                          : "No hay socios en esta disciplina"}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {socios.map((socio, index) => (
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
                            {/* Mobile extras */}
                            <div className="sm:hidden mt-0.5">
                              <p className="font-body text-xs text-muted-foreground">
                                CI: {socio.cedula}
                              </p>
                            </div>
                            <div className="md:hidden mt-1 flex flex-wrap gap-1">
                              {socio.pd_categoria && (
                                <Badge
                                  variant="secondary"
                                  className="text-[9px] font-body py-0 h-4"
                                >
                                  {socio.pd_categoria}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell font-body text-sm text-muted-foreground">
                          {socio.cedula}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {socio.pd_categoria ? (
                            <Badge variant="secondary" className="text-[10px] font-body">
                              {socio.pd_categoria}
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell font-body text-sm text-muted-foreground">
                          {socio.pd_fecha_ingreso
                            ? new Date(
                                socio.pd_fecha_ingreso
                              ).toLocaleDateString("es-UY", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                              })
                            : "—"}
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge
                            variant={socio.activo ? "default" : "secondary"}
                          >
                            {socio.activo ? "Activo" : "Inactivo"}
                          </Badge>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
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
