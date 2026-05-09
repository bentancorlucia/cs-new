"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Plus,
  Tag,
  Edit,
  Trash2,
  MoreHorizontal,
  Calendar,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { fadeInUp } from "@/lib/motion";
import { toast } from "sonner";
import { useDocumentTitle } from "@/hooks/use-document-title";

interface Promocode {
  id: number;
  codigo: string;
  descripcion: string | null;
  tipo_descuento: "porcentaje" | "monto_fijo";
  valor: number;
  fecha_inicio: string;
  fecha_fin: string;
  acumulable_con_precio_socio: boolean;
  monto_minimo: number | null;
  usos_max: number | null;
  usos_actuales: number;
  activo: boolean;
  created_at: string;
}

function formatFecha(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("es-UY", { day: "2-digit", month: "short", year: "numeric" });
}

type EstadoTone = "vigente" | "programado" | "expirado" | "inactivo" | "agotado";

function getEstado(p: Promocode): { label: string; tone: EstadoTone } {
  const now = Date.now();
  if (!p.activo) return { label: "Inactivo", tone: "inactivo" };
  const inicio = new Date(p.fecha_inicio).getTime();
  const fin = new Date(p.fecha_fin).getTime();
  if (now < inicio) return { label: "Programado", tone: "programado" };
  if (now > fin) return { label: "Expirado", tone: "expirado" };
  if (p.usos_max != null && p.usos_actuales >= p.usos_max) {
    return { label: "Agotado", tone: "agotado" };
  }
  return { label: "Vigente", tone: "vigente" };
}

const estadoStyles: Record<EstadoTone, string> = {
  vigente:
    "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
  programado:
    "bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/20",
  expirado:
    "bg-zinc-100 text-zinc-600 ring-1 ring-inset ring-zinc-500/20",
  inactivo:
    "bg-zinc-100 text-zinc-500 ring-1 ring-inset ring-zinc-400/20",
  agotado:
    "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20",
};

function EstadoPill({ tone, label }: { tone: EstadoTone; label: string }) {
  const dotColor: Record<EstadoTone, string> = {
    vigente: "bg-emerald-500",
    programado: "bg-sky-500",
    expirado: "bg-zinc-400",
    inactivo: "bg-zinc-400",
    agotado: "bg-amber-500",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium tracking-tight ${estadoStyles[tone]}`}
    >
      <span className={`size-1.5 rounded-full ${dotColor[tone]}`} />
      {label}
    </span>
  );
}

export default function AdminPromocodesPage() {
  useDocumentTitle("Promocodes");
  const [items, setItems] = useState<Promocode[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState("");
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (estado) params.set("estado", estado);
      const res = await fetch(`/api/admin/promocodes?${params.toString()}`);
      if (!res.ok) throw new Error("Error al cargar");
      const json = await res.json();
      setItems(json.data || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [search, estado]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  async function handleDelete() {
    if (!deleteId) return;
    const res = await fetch(`/api/admin/promocodes/${deleteId}`, { method: "DELETE" });
    if (res.ok) {
      const json = await res.json();
      toast.success(json.data?.desactivado ? "Promocode desactivado (tiene pedidos asociados)" : "Promocode eliminado");
      setDeleteId(null);
      fetchItems();
    } else {
      toast.error("Error al eliminar");
    }
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
            Promocodes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground font-body">
            Códigos de descuento para la tienda online
          </p>
        </div>
        <Link href="/admin/promocodes/nuevo">
          <Button>
            <Plus className="size-4" />
            Nuevo promocode
          </Button>
        </Link>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="flex flex-col gap-3 sm:flex-row"
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por código..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 uppercase font-mono"
          />
        </div>
        <Select value={estado || "todos"} onValueChange={(v) => setEstado(!v || v === "todos" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="vigente">Vigentes</SelectItem>
            <SelectItem value="activo">Activos</SelectItem>
            <SelectItem value="inactivo">Inactivos</SelectItem>
            <SelectItem value="expirado">Expirados</SelectItem>
            <SelectItem value="agotado">Agotados</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="rounded-2xl border border-linea/80 bg-white overflow-hidden shadow-[0_1px_2px_0_rgba(0,0,0,0.03)]"
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-linea/70 bg-superficie/40">
                <TableHead className="font-heading uppercase tracking-editorial text-[10px] text-muted-foreground/70 py-3.5">Código</TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-[10px] text-muted-foreground/70 py-3.5">Descuento</TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-[10px] text-muted-foreground/70 py-3.5 hidden md:table-cell">Vigencia</TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-[10px] text-muted-foreground/70 py-3.5 text-center hidden sm:table-cell">Usos</TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-[10px] text-muted-foreground/70 py-3.5 text-center">Estado</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell className="hidden sm:table-cell"><Skeleton className="mx-auto h-4 w-12" /></TableCell>
                    <TableCell><Skeleton className="mx-auto h-5 w-16 rounded-full" /></TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-16 text-center text-muted-foreground">
                    <Tag className="mx-auto mb-3 size-12 opacity-15" />
                    <p className="font-body text-sm">No hay promocodes</p>
                    <Link href="/admin/promocodes/nuevo" className="mt-3 inline-block text-sm text-bordo-700 hover:text-bordo-800 font-medium">
                      Crear el primero
                    </Link>
                  </TableCell>
                </TableRow>
              ) : (
                <AnimatePresence>
                  {items.map((p) => {
                    const estado = getEstado(p);
                    return (
                      <motion.tr
                        key={p.id}
                        variants={fadeInUp}
                        initial="hidden"
                        animate="visible"
                        className="group border-b border-linea/60 last:border-0 transition-colors hover:bg-superficie/40"
                      >
                        <TableCell className="py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/admin/promocodes/${p.id}`}
                              className="font-mono text-sm font-semibold tracking-tight text-foreground transition-colors hover:text-bordo-700"
                            >
                              {p.codigo}
                            </Link>
                            {p.acumulable_con_precio_socio && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-inset ring-amber-600/30">
                                <span className="size-1 rounded-full bg-amber-500" />
                                Acumulable
                              </span>
                            )}
                          </div>
                          {p.descripcion && (
                            <p className="text-[11px] text-muted-foreground line-clamp-1 mt-1.5 ml-0.5">
                              {p.descripcion}
                            </p>
                          )}
                          {/* Mobile-only inline meta */}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 md:hidden">
                            <span className="inline-flex items-center gap-1 rounded-md bg-superficie/60 px-1.5 py-0.5 text-[10px] text-muted-foreground ring-1 ring-inset ring-linea/60">
                              <Calendar className="size-3 text-muted-foreground/70" />
                              <span className="tabular-nums">{formatFecha(p.fecha_inicio)}</span>
                              <span className="text-muted-foreground/40">→</span>
                              <span className="tabular-nums">{formatFecha(p.fecha_fin)}</span>
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-md bg-superficie/60 px-1.5 py-0.5 text-[10px] ring-1 ring-inset ring-linea/60 sm:hidden">
                              <TrendingUp className="size-3 text-muted-foreground/70" />
                              <span className="font-semibold tabular-nums text-foreground">{p.usos_actuales}</span>
                              <span className="text-muted-foreground/70">/{p.usos_max ?? "∞"}</span>
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-[15px] font-semibold tabular-nums text-foreground">
                            {p.tipo_descuento === "porcentaje"
                              ? `${Number(p.valor)}%`
                              : `$${Number(p.valor).toLocaleString("es-UY")}`}
                          </div>
                          {p.monto_minimo != null && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Mín ${Number(p.monto_minimo).toLocaleString("es-UY")}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="inline-flex items-center gap-2 rounded-lg bg-superficie/60 px-2.5 py-1.5 text-[12px] text-muted-foreground ring-1 ring-inset ring-linea/60">
                            <Calendar className="size-3.5 text-muted-foreground/70" />
                            <span className="tabular-nums font-medium text-foreground/80">{formatFecha(p.fecha_inicio)}</span>
                            <span className="text-muted-foreground/40">→</span>
                            <span className="tabular-nums font-medium text-foreground/80">{formatFecha(p.fecha_fin)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center hidden sm:table-cell">
                          <div className="inline-flex items-center gap-1.5 rounded-full bg-superficie/60 px-2.5 py-1 text-[12px] ring-1 ring-inset ring-linea/60">
                            <TrendingUp className="size-3 text-muted-foreground/70" />
                            <span className="font-semibold tabular-nums text-foreground">{p.usos_actuales}</span>
                            <span className="text-muted-foreground/70">
                              /{p.usos_max ?? "∞"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <EstadoPill tone={estado.tone} label={estado.label} />
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button variant="ghost" size="icon-sm" className="md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 transition-opacity">
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              }
                            />
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem render={<Link href={`/admin/promocodes/${p.id}`} />}>
                                <Edit className="size-3.5 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => setDeleteId(p.id)}
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

      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar promocode</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Si tiene pedidos asociados, se desactivará en lugar de eliminarse para
            preservar la auditoría.
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
