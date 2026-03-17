"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Search,
  Download,
  Upload,
  ArrowUpRight,
  ArrowDownRight,
  Receipt,
  Filter,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
import { staggerContainer, fadeInUp, springSmooth } from "@/lib/motion";
import { toast } from "sonner";
import { ImportarCSVDialog } from "@/components/tesoreria/importar-csv-dialog";

interface Cuenta {
  id: number;
  nombre: string;
  color: string;
  moneda: string;
}

interface Categoria {
  id: number;
  nombre: string;
  slug: string;
  color: string;
  tipo: "ingreso" | "egreso";
}

interface Movimiento {
  id: number;
  cuenta_id: number;
  categoria_id: number;
  tipo: "ingreso" | "egreso";
  monto: number;
  moneda: string;
  fecha: string;
  descripcion: string;
  referencia: string | null;
  notas: string | null;
  created_at: string;
  cuenta: { nombre: string; color: string };
  categoria: { nombre: string; color: string };
}

interface Totals {
  ingresos: number;
  egresos: number;
  neto: number;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function formatMonto(monto: number): string {
  return monto.toLocaleString("es-UY", { minimumFractionDigits: 0 });
}

function getFirstDayOfMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function getToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function TesoreriaMovimientosPage() {
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [totals, setTotals] = useState<Totals>({ ingresos: 0, egresos: 0, neto: 0 });

  // Filters
  const [cuentaFilter, setCuentaFilter] = useState("");
  const [tipoFilter, setTipoFilter] = useState("");
  const [categoriaFilter, setCategoriaFilter] = useState("");
  const [desde, setDesde] = useState(getFirstDayOfMonth);
  const [hasta, setHasta] = useState(getToday);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  // Create dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    cuenta_id: "",
    tipo: "egreso" as "ingreso" | "egreso",
    categoria_id: "",
    monto: "",
    moneda: "UYU",
    fecha: getToday(),
    descripcion: "",
    referencia: "",
    notas: "",
  });

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Fetch dropdown data
  useEffect(() => {
    async function fetchDropdowns() {
      const [cuentasRes, categoriasRes] = await Promise.all([
        fetch("/api/tesoreria/cuentas?activas=true"),
        fetch("/api/tesoreria/categorias?activas=true"),
      ]);
      if (cuentasRes.ok) {
        const res = await cuentasRes.json();
        setCuentas(Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : []);
      }
      if (categoriasRes.ok) {
        const res = await categoriasRes.json();
        setCategorias(Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : []);
      }
    }
    fetchDropdowns();
  }, []);

  // Fetch movimientos
  const fetchMovimientos = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (cuentaFilter) params.set("cuenta_id", cuentaFilter);
    if (tipoFilter) params.set("tipo", tipoFilter);
    if (categoriaFilter) params.set("categoria_id", categoriaFilter);
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    if (search) params.set("search", search);

    try {
      const res = await fetch(`/api/tesoreria/movimientos?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setMovimientos(data.movimientos || []);
        setTotal(data.total || 0);
        setTotalPages(Math.ceil((data.total || 0) / limit));
        if (data.totals) {
          setTotals(data.totals);
        }
      }
    } catch {
      toast.error("Error al cargar movimientos");
    } finally {
      setLoading(false);
    }
  }, [page, cuentaFilter, tipoFilter, categoriaFilter, desde, hasta, search]);

  useEffect(() => {
    fetchMovimientos();
  }, [fetchMovimientos]);

  // Filtered categories for the create form based on selected tipo
  const categoriasFiltered = categorias.filter(
    (c) => c.tipo === form.tipo
  );

  // Reset category when tipo changes in form
  function handleFormTipoChange(tipo: "ingreso" | "egreso") {
    setForm((prev) => ({ ...prev, tipo, categoria_id: "" }));
  }

  async function handleCreate() {
    if (!form.cuenta_id || !form.categoria_id || !form.monto || !form.descripcion) {
      toast.error("Completar los campos obligatorios");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/tesoreria/movimientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cuenta_id: Number(form.cuenta_id),
          tipo: form.tipo,
          categoria_id: Number(form.categoria_id),
          monto: parseFloat(form.monto),
          moneda: form.moneda,
          fecha: form.fecha,
          descripcion: form.descripcion,
          referencia: form.referencia || null,
          notas: form.notas || null,
        }),
      });

      if (res.ok) {
        toast.success("Movimiento creado correctamente");
        setDialogOpen(false);
        setForm({
          cuenta_id: "",
          tipo: "egreso",
          categoria_id: "",
          monto: "",
          moneda: "UYU",
          fecha: getToday(),
          descripcion: "",
          referencia: "",
          notas: "",
        });
        fetchMovimientos();
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error || "Error al crear movimiento");
      }
    } catch {
      toast.error("Error de conexion");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springSmooth}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
            Movimientos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground font-body">
            {total > 0 && `${total} movimientos · `}Ingresos y egresos de tesoreria
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            className="flex-1 sm:flex-none"
            onClick={() => setImportDialogOpen(true)}
          >
            <Upload className="size-4" />
            Importar CSV
          </Button>
          <Button
            className="flex-1 sm:flex-none bg-bordo-800 hover:bg-bordo-700 text-white"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="size-4" />
            Nuevo movimiento
          </Button>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="flex flex-wrap gap-3"
      >
        <Select
          value={cuentaFilter || "todas"}
          onValueChange={(v) => {
            setCuentaFilter(v === "todas" ? "" : v ?? "");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Cuenta" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las cuentas</SelectItem>
            {cuentas.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block size-2 rounded-full shrink-0"
                    style={{ backgroundColor: c.color }}
                  />
                  {c.nombre}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={tipoFilter || "todos"}
          onValueChange={(v) => {
            setTipoFilter(v === "todos" ? "" : v ?? "");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-36">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="ingreso">Ingreso</SelectItem>
            <SelectItem value="egreso">Egreso</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={categoriaFilter || "todas"}
          onValueChange={(v) => {
            setCategoriaFilter(v === "todas" ? "" : v ?? "");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las categorias</SelectItem>
            {categorias.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                <span className="flex items-center gap-2">
                  <span
                    className="inline-block size-2 rounded-full shrink-0"
                    style={{ backgroundColor: c.color }}
                  />
                  {c.nombre}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={desde}
            onChange={(e) => {
              setDesde(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-36"
          />
          <span className="text-sm text-muted-foreground font-body shrink-0">a</span>
          <Input
            type="date"
            value={hasta}
            onChange={(e) => {
              setHasta(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-36"
          />
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar descripcion o referencia..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
      </motion.div>

      {/* Totals bar */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="flex flex-wrap gap-3"
      >
        <Badge
          variant="secondary"
          className="bg-emerald-50 text-emerald-700 border-emerald-200 px-3 py-1.5 text-sm font-body"
        >
          <ArrowUpRight className="size-3.5 mr-1.5" />
          Ingresos: ${formatMonto(totals.ingresos)}
        </Badge>
        <Badge
          variant="secondary"
          className="bg-red-50 text-red-700 border-red-200 px-3 py-1.5 text-sm font-body"
        >
          <ArrowDownRight className="size-3.5 mr-1.5" />
          Egresos: ${formatMonto(totals.egresos)}
        </Badge>
        <Badge
          variant="secondary"
          className="bg-bordo-50 text-bordo-800 border-bordo-200 px-3 py-1.5 text-sm font-body"
        >
          <Receipt className="size-3.5 mr-1.5" />
          Neto: ${formatMonto(totals.neto)}
        </Badge>
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
                <TableHead className="font-heading uppercase tracking-editorial text-xs">
                  Fecha
                </TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-xs min-w-[200px]">
                  Descripcion
                </TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-xs hidden md:table-cell">
                  Cuenta
                </TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-xs hidden sm:table-cell">
                  Categoria
                </TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-xs text-right">
                  Monto
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-40" />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="ml-auto h-4 w-20" />
                    </TableCell>
                  </TableRow>
                ))
              ) : movimientos.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-16 text-center text-muted-foreground"
                  >
                    <Receipt className="mx-auto mb-3 size-12 opacity-15" />
                    <p className="font-body text-sm">
                      No se encontraron movimientos
                    </p>
                    <button
                      onClick={() => setDialogOpen(true)}
                      className="mt-3 inline-block text-sm text-bordo-700 hover:text-bordo-800 font-medium"
                    >
                      Registrar primer movimiento
                    </button>
                  </TableCell>
                </TableRow>
              ) : (
                <AnimatePresence>
                  {movimientos.map((mov) => (
                    <motion.tr
                      key={mov.id}
                      variants={fadeInUp}
                      initial="hidden"
                      animate="visible"
                      className="group border-b border-linea last:border-0 transition-colors hover:bg-superficie/50"
                    >
                      <TableCell className="py-3 text-sm font-body text-muted-foreground whitespace-nowrap">
                        {formatDate(mov.fecha)}
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="min-w-0">
                          <p className="font-body text-sm font-medium line-clamp-1">
                            {mov.descripcion}
                          </p>
                          {mov.referencia && (
                            <p className="text-xs text-muted-foreground font-body mt-0.5">
                              Ref: {mov.referencia}
                            </p>
                          )}
                          {/* Mobile: show cuenta + categoria inline */}
                          <div className="flex items-center gap-2 mt-1 sm:hidden">
                            <span className="flex items-center gap-1 text-xs text-muted-foreground font-body">
                              <span
                                className="inline-block size-1.5 rounded-full"
                                style={{ backgroundColor: mov.cuenta?.color }}
                              />
                              {mov.cuenta?.nombre}
                            </span>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground font-body">
                              <span
                                className="inline-block size-1.5 rounded-full"
                                style={{ backgroundColor: mov.categoria?.color }}
                              />
                              {mov.categoria?.nombre}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-sm font-body hidden md:table-cell">
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block size-2 rounded-full shrink-0"
                            style={{ backgroundColor: mov.cuenta?.color }}
                          />
                          {mov.cuenta?.nombre || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 text-sm font-body hidden sm:table-cell">
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block size-2 rounded-full shrink-0"
                            style={{ backgroundColor: mov.categoria?.color }}
                          />
                          {mov.categoria?.nombre || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 text-right whitespace-nowrap">
                        <span
                          className={`font-body text-sm font-medium ${
                            mov.tipo === "ingreso"
                              ? "text-emerald-600"
                              : "text-red-600"
                          }`}
                        >
                          {mov.tipo === "ingreso" ? "+" : "-"}$
                          {formatMonto(mov.monto)}
                        </span>
                        {mov.moneda !== "UYU" && (
                          <span className="ml-1 text-xs text-muted-foreground font-body">
                            {mov.moneda}
                          </span>
                        )}
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
            Mostrando {(page - 1) * limit + 1}-
            {Math.min(page * limit, total)} de {total}
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

      {/* Create Movement Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg tracking-editorial">
              Nuevo movimiento
            </DialogTitle>
          </DialogHeader>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springSmooth}
            className="space-y-4 py-2"
          >
            {/* Cuenta */}
            <div className="space-y-1.5">
              <Label className="font-body text-sm">Cuenta *</Label>
              <Select
                value={form.cuenta_id}
                onValueChange={(v) => setForm((prev) => ({ ...prev, cuenta_id: v ?? "" }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar cuenta" />
                </SelectTrigger>
                <SelectContent>
                  {cuentas.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block size-2 rounded-full shrink-0"
                          style={{ backgroundColor: c.color }}
                        />
                        {c.nombre}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tipo + Categoria */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-body text-sm">Tipo *</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(v) =>
                    handleFormTipoChange(v as "ingreso" | "egreso")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ingreso">Ingreso</SelectItem>
                    <SelectItem value="egreso">Egreso</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="font-body text-sm">Categoria *</Label>
                <Select
                  value={form.categoria_id}
                  onValueChange={(v) =>
                    setForm((prev) => ({ ...prev, categoria_id: v ?? "" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoriasFiltered.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block size-2 rounded-full shrink-0"
                            style={{ backgroundColor: c.color }}
                          />
                          {c.nombre}
                        </span>
                      </SelectItem>
                    ))}
                    {categoriasFiltered.length === 0 && (
                      <SelectItem value="" disabled>
                        Sin categorias para este tipo
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Monto + Moneda */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="font-body text-sm">Monto *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={form.monto}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, monto: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="font-body text-sm">Moneda</Label>
                <Select
                  value={form.moneda}
                  onValueChange={(v) =>
                    setForm((prev) => ({ ...prev, moneda: v ?? "UYU" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UYU">UYU</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Fecha */}
            <div className="space-y-1.5">
              <Label className="font-body text-sm">Fecha *</Label>
              <Input
                type="date"
                value={form.fecha}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, fecha: e.target.value }))
                }
              />
            </div>

            {/* Descripcion */}
            <div className="space-y-1.5">
              <Label className="font-body text-sm">Descripcion *</Label>
              <Textarea
                placeholder="Detalle del movimiento"
                value={form.descripcion}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, descripcion: e.target.value }))
                }
                rows={2}
              />
            </div>

            {/* Referencia */}
            <div className="space-y-1.5">
              <Label className="font-body text-sm">Referencia</Label>
              <Input
                placeholder="N. de factura, recibo, etc."
                value={form.referencia}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, referencia: e.target.value }))
                }
              />
            </div>

            {/* Notas */}
            <div className="space-y-1.5">
              <Label className="font-body text-sm">Notas</Label>
              <Textarea
                placeholder="Observaciones adicionales"
                value={form.notas}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, notas: e.target.value }))
                }
                rows={2}
              />
            </div>
          </motion.div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              className="bg-bordo-800 hover:bg-bordo-700 text-white"
              onClick={handleCreate}
              disabled={submitting}
            >
              {submitting ? "Guardando..." : "Crear movimiento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import CSV Dialog */}
      <ImportarCSVDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        cuentas={cuentas}
        categorias={categorias}
        onImportComplete={fetchMovimientos}
      />
    </div>
  );
}
