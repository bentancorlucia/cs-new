"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Shield,
  X,
  Plus,
  ChevronLeft,
  ChevronRight,
  Users,
  Loader2,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase/client";
import { useDocumentTitle } from "@/hooks/use-document-title";

interface Perfil {
  id: string;
  nombre: string;
  apellido: string;
  cedula: string | null;
  es_socio: boolean;
}

interface PerfilConRoles extends Perfil {
  roles: string[];
}

const ROLES_DISPONIBLES = [
  { nombre: "super_admin", label: "Super Admin", color: "bg-red-100 text-red-800 border-red-200" },
  { nombre: "tienda", label: "Tienda", color: "bg-blue-100 text-blue-800 border-blue-200" },
  { nombre: "secretaria", label: "Secretaría", color: "bg-purple-100 text-purple-800 border-purple-200" },
  { nombre: "eventos", label: "Eventos", color: "bg-amber-100 text-amber-800 border-amber-200" },
  { nombre: "scanner", label: "Scanner", color: "bg-cyan-100 text-cyan-800 border-cyan-200" },
  { nombre: "tesorero", label: "Tesorero", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  { nombre: "socio", label: "Socio", color: "bg-green-100 text-green-800 border-green-200" },
  { nombre: "no_socio", label: "No Socio", color: "bg-gray-100 text-gray-700 border-gray-200" },
];

function getRolColor(rolNombre: string) {
  return ROLES_DISPONIBLES.find((r) => r.nombre === rolNombre)?.color || "bg-gray-100 text-gray-700 border-gray-200";
}

function getRolLabel(rolNombre: string) {
  return ROLES_DISPONIBLES.find((r) => r.nombre === rolNombre)?.label || rolNombre;
}

const LIMIT = 20;

export default function RolesPage() {
  useDocumentTitle("Roles");
  const [perfiles, setPerfiles] = useState<PerfilConRoles[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroRol, setFiltroRol] = useState("todos");
  const [page, setPage] = useState(1);

  // Dialog state for adding role
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedPerfil, setSelectedPerfil] = useState<PerfilConRoles | null>(null);
  const [rolToAdd, setRolToAdd] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  // Dialog state for removing role
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [rolToRemove, setRolToRemove] = useState("");

  const totalPages = Math.ceil(total / LIMIT);

  const fetchPerfiles = useCallback(async () => {
    setLoading(true);
    const supabase = createBrowserClient();

    // First get profiles with count
    let query = supabase
      .from("perfiles")
      .select("id, nombre, apellido, cedula, es_socio", { count: "exact" });

    if (search) {
      const s = search.replace(/%/g, "\\%").replace(/_/g, "\\_");
      query = query.or(
        `nombre.ilike.%${s}%,apellido.ilike.%${s}%,cedula.ilike.%${s}%`
      );
    }

    query = query
      .order("apellido", { ascending: true })
      .range((page - 1) * LIMIT, page * LIMIT - 1);

    const { data: perfilesData, count } = await query;
    setTotal(count || 0);

    if (!perfilesData || perfilesData.length === 0) {
      setPerfiles([]);
      setLoading(false);
      return;
    }

    // Get roles for these profiles
    const perfilIds = perfilesData.map((p) => p.id);
    const { data: rolesData } = await supabase
      .from("perfil_roles")
      .select("perfil_id, roles(nombre)")
      .in("perfil_id", perfilIds);

    // Build role map
    const roleMap: Record<string, string[]> = {};
    if (rolesData) {
      for (const row of rolesData as unknown as { perfil_id: string; roles: { nombre: string } | null }[]) {
        if (row.roles?.nombre) {
          if (!roleMap[row.perfil_id]) roleMap[row.perfil_id] = [];
          roleMap[row.perfil_id].push(row.roles.nombre);
        }
      }
    }

    let result: PerfilConRoles[] = perfilesData.map((p) => ({
      ...p,
      roles: roleMap[p.id] || [],
    }));

    // Client-side role filter
    if (filtroRol !== "todos") {
      if (filtroRol === "sin_roles") {
        result = result.filter((p) => p.roles.length === 0);
      } else {
        result = result.filter((p) => p.roles.includes(filtroRol));
      }
    }

    setPerfiles(result);
    setLoading(false);
  }, [search, filtroRol, page]);

  useEffect(() => {
    setPage(1);
  }, [search, filtroRol]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPerfiles();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchPerfiles]);

  const handleAddRole = async () => {
    if (!selectedPerfil || !rolToAdd) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/roles/asignar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perfil_id: selectedPerfil.id, rol_nombre: rolToAdd }),
      });
      if (res.ok) {
        setAddDialogOpen(false);
        setRolToAdd("");
        setSelectedPerfil(null);
        fetchPerfiles();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveRole = async () => {
    if (!selectedPerfil || !rolToRemove) return;
    setActionLoading(true);
    try {
      const res = await fetch("/api/roles/quitar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perfil_id: selectedPerfil.id, rol_nombre: rolToRemove }),
      });
      if (res.ok) {
        setRemoveDialogOpen(false);
        setRolToRemove("");
        setSelectedPerfil(null);
        fetchPerfiles();
      }
    } finally {
      setActionLoading(false);
    }
  };

  const openAddDialog = (perfil: PerfilConRoles) => {
    setSelectedPerfil(perfil);
    setRolToAdd("");
    setAddDialogOpen(true);
  };

  const openRemoveDialog = (perfil: PerfilConRoles, rol: string) => {
    setSelectedPerfil(perfil);
    setRolToRemove(rol);
    setRemoveDialogOpen(true);
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
            Gestión de Roles
          </h1>
          <p className="mt-1 font-body text-sm text-muted-foreground">
            {total} perfiles registrados
          </p>
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
        <Select value={filtroRol} onValueChange={(v) => v && setFiltroRol(v)}>
          <SelectTrigger className="sm:w-[180px] font-body">
            <Shield className="size-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Filtrar por rol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="sin_roles">Sin roles</SelectItem>
            {ROLES_DISPONIBLES.map((r) => (
              <SelectItem key={r.nombre} value={r.nombre}>
                {r.label}
              </SelectItem>
            ))}
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
                    Cédula
                  </TableHead>
                  <TableHead className="font-heading uppercase tracking-editorial text-xs">
                    Roles
                  </TableHead>
                  <TableHead className="font-heading uppercase tracking-editorial text-xs w-[80px]">
                    Acción
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell className="hidden sm:table-cell"><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-8" /></TableCell>
                    </TableRow>
                  ))
                ) : perfiles.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center py-16 text-muted-foreground font-body"
                    >
                      <Users className="mx-auto mb-3 size-12 opacity-15" />
                      <p className="text-sm">No se encontraron perfiles</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  <AnimatePresence mode="popLayout">
                      {perfiles.map((perfil, i) => (
                        <motion.tr
                          key={perfil.id}
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.04 + 0.05 }}
                          layout
                          className="border-b border-linea last:border-0 hover:bg-superficie/50 transition-colors"
                        >
                          <TableCell className="py-3">
                            <div>
                              <p className="font-body text-sm font-medium text-foreground">
                                {perfil.apellido}, {perfil.nombre}
                              </p>
                              {perfil.es_socio && (
                                <p className="font-body text-xs text-muted-foreground">
                                  Socio
                                </p>
                              )}
                              {/* Mobile: show cedula */}
                              {perfil.cedula && (
                                <p className="sm:hidden font-body text-xs text-muted-foreground mt-0.5">
                                  CI: {perfil.cedula}
                                </p>
                              )}
                              {/* Mobile: show roles */}
                              <div className="sm:hidden mt-1.5 flex flex-wrap gap-1">
                                {perfil.roles.length > 0 ? (
                                  perfil.roles.map((rol) => (
                                    <button
                                      key={rol}
                                      onClick={() => openRemoveDialog(perfil, rol)}
                                      className={`inline-flex items-center gap-0.5 text-[10px] font-body font-medium px-1.5 py-0.5 rounded-md border transition-colors hover:opacity-75 ${getRolColor(rol)}`}
                                    >
                                      {getRolLabel(rol)}
                                      <X className="size-2.5" />
                                    </button>
                                  ))
                                ) : (
                                  <span className="text-xs text-muted-foreground">Sin roles</span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell font-body text-sm text-muted-foreground">
                            {perfil.cedula || "—"}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <div className="flex flex-wrap gap-1">
                              {perfil.roles.length > 0 ? (
                                perfil.roles.map((rol) => (
                                  <button
                                    key={rol}
                                    onClick={() => openRemoveDialog(perfil, rol)}
                                    className={`group inline-flex items-center gap-1 text-[11px] font-body font-medium px-2 py-0.5 rounded-md border transition-all hover:opacity-75 ${getRolColor(rol)}`}
                                  >
                                    {getRolLabel(rol)}
                                    <X className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </button>
                                ))
                              ) : (
                                <span className="text-sm text-muted-foreground">—</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => openAddDialog(perfil)}
                            >
                              <Plus className="size-4" />
                            </Button>
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

      {/* Add Role Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-tightest">
              Agregar Rol
            </DialogTitle>
            <DialogDescription className="font-body">
              {selectedPerfil && (
                <>Asignar rol a <strong>{selectedPerfil.nombre} {selectedPerfil.apellido}</strong></>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={rolToAdd} onValueChange={(v) => v && setRolToAdd(v)}>
              <SelectTrigger className="font-body">
                <SelectValue placeholder="Seleccionar rol..." />
              </SelectTrigger>
              <SelectContent>
                {ROLES_DISPONIBLES
                  .filter((r) => !selectedPerfil?.roles.includes(r.nombre))
                  .map((r) => (
                    <SelectItem key={r.nombre} value={r.nombre}>
                      {r.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddRole} disabled={!rolToAdd || actionLoading}>
              {actionLoading && <Loader2 className="size-4 animate-spin" />}
              Asignar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Role Dialog */}
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-tightest">
              Quitar Rol
            </DialogTitle>
            <DialogDescription className="font-body">
              {selectedPerfil && rolToRemove && (
                <>
                  ¿Quitar el rol <Badge className={`${getRolColor(rolToRemove)} mx-1`}>{getRolLabel(rolToRemove)}</Badge> de <strong>{selectedPerfil.nombre} {selectedPerfil.apellido}</strong>?
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleRemoveRole} disabled={actionLoading}>
              {actionLoading && <Loader2 className="size-4 animate-spin" />}
              Quitar rol
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
