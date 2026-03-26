"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Pencil,
  FolderTree,
  TrendingUp,
  TrendingDown,
  Layers,
  Tag,
  GripVertical,
  Eye,
  EyeOff,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  staggerContainer,
  staggerContainerFast,
  fadeInUp,
  springSmooth,
  springBouncy,
} from "@/lib/motion";
import { toast } from "sonner";
import { useDocumentTitle } from "@/hooks/use-document-title";

// --- Types ---

interface CategoriaFinanciera {
  id: number;
  nombre: string;
  slug: string;
  tipo: "ingreso" | "egreso";
  padre_id: number | null;
  color: string | null;
  icono: string | null;
  presupuesto_mensual: number | null;
  orden: number;
  activa: boolean;
  created_at: string;
}

interface CategoriaTree {
  root: CategoriaFinanciera;
  children: CategoriaFinanciera[];
}

// --- Helpers ---

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildTree(
  categorias: CategoriaFinanciera[],
  tipo: "ingreso" | "egreso"
): CategoriaTree[] {
  const filtered = categorias.filter((c) => c.tipo === tipo);
  const roots = filtered
    .filter((c) => c.padre_id === null)
    .sort((a, b) => a.orden - b.orden);

  return roots.map((root) => ({
    root,
    children: filtered
      .filter((c) => c.padre_id === root.id)
      .sort((a, b) => a.orden - b.orden),
  }));
}

// --- Default form state ---

const defaultForm = {
  nombre: "",
  slug: "",
  tipo: "ingreso" as "ingreso" | "egreso",
  padre_id: null as number | null,
  color: "#730d32",
  icono: "",
  orden: 0,
  activa: true,
};

// --- Animated counter ---

function AnimatedCounter({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) {
      setDisplay(0);
      return;
    }
    const duration = 600;
    const steps = 20;
    const increment = value / steps;
    let step = 0;

    const interval = setInterval(() => {
      step++;
      setDisplay(Math.min(Math.round(increment * step), value));
      if (step >= steps) clearInterval(interval);
    }, duration / steps);

    return () => clearInterval(interval);
  }, [value]);

  return <span className="tabular-nums">{display}</span>;
}

// --- Page Component ---

export default function CategoriasFinancierasPage() {
  useDocumentTitle("Categorías Contables");
  const [categorias, setCategorias] = useState<CategoriaFinanciera[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"ingreso" | "egreso">("ingreso");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [form, setForm] = useState(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const fetchCategorias = useCallback(async () => {
    try {
      const res = await fetch("/api/tesoreria/categorias");
      if (!res.ok) throw new Error("Error al cargar categorias");
      const json = await res.json();
      setCategorias(json.data ?? []);
    } catch {
      toast.error("Error al cargar categorias");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategorias();
  }, [fetchCategorias]);

  // --- Computed stats ---

  const stats = useMemo(() => {
    const ingresos = categorias.filter((c) => c.tipo === "ingreso");
    const egresos = categorias.filter((c) => c.tipo === "egreso");
    const roots = categorias.filter((c) => c.padre_id === null);
    const subs = categorias.filter((c) => c.padre_id !== null);
    return {
      total: categorias.length,
      ingresos: ingresos.length,
      egresos: egresos.length,
      roots: roots.length,
      subs: subs.length,
      activas: categorias.filter((c) => c.activa).length,
      inactivas: categorias.filter((c) => !c.activa).length,
    };
  }, [categorias]);

  const filteredCategorias = useMemo(() => {
    if (showInactive) return categorias;
    return categorias.filter((c) => c.activa);
  }, [categorias, showInactive]);

  const tree = buildTree(filteredCategorias, tab);
  const roots = categorias.filter(
    (c) => c.padre_id === null && c.tipo === form.tipo
  );

  const ingresosCount = categorias.filter((c) => c.tipo === "ingreso").length;
  const egresosCount = categorias.filter((c) => c.tipo === "egreso").length;

  // --- Expand / Collapse ---

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    setExpanded(new Set(tree.map((t) => t.root.id)));
  };

  const collapseAll = () => {
    setExpanded(new Set());
  };

  // --- Open dialog ---

  const openCreate = (asSub?: CategoriaFinanciera) => {
    setEditingId(null);
    setForm({
      ...defaultForm,
      tipo: tab,
      padre_id: asSub?.id ?? null,
    });
    setDialogOpen(true);
  };

  const openEdit = (cat: CategoriaFinanciera) => {
    setEditingId(cat.id);
    setForm({
      nombre: cat.nombre,
      slug: cat.slug,
      tipo: cat.tipo,
      padre_id: cat.padre_id,
      color: cat.color || "#730d32",
      icono: cat.icono || "",
      orden: cat.orden,
      activa: cat.activa,
    });
    setDialogOpen(true);
  };

  // --- Submit ---

  const handleSubmit = async () => {
    if (!form.nombre.trim()) {
      toast.error("El nombre es requerido");
      return;
    }

    setSubmitting(true);

    const payload = {
      ...(editingId ? { id: editingId } : {}),
      nombre: form.nombre.trim(),
      slug: form.slug || slugify(form.nombre),
      tipo: form.tipo,
      padre_id: form.padre_id || null,
      color: form.color || null,
      icono: form.icono.trim() || null,
      orden: form.orden,
      activa: form.activa,
    };

    try {
      const res = await fetch("/api/tesoreria/categorias", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Error al guardar");
        return;
      }

      toast.success(
        editingId ? "Categoria actualizada" : "Categoria creada"
      );
      setDialogOpen(false);
      fetchCategorias();
    } catch {
      toast.error("Error de conexion");
    } finally {
      setSubmitting(false);
    }
  };

  // --- Auto-slug from nombre ---

  const handleNombreChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      nombre: value,
      slug: slugify(value),
    }));
  };

  // --- Stat cards config ---

  const statCards = [
    {
      label: "Total Categorías",
      value: stats.total,
      icon: FolderTree,
      color: "text-bordo-700",
      bg: "bg-bordo-50",
    },
    {
      label: "De Ingresos",
      value: stats.ingresos,
      icon: TrendingUp,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "De Egresos",
      value: stats.egresos,
      icon: TrendingDown,
      color: "text-red-600",
      bg: "bg-red-50",
    },
    {
      label: "Subcategorías",
      value: stats.subs,
      icon: Layers,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
  ];

  return (
    <div className="space-y-6 lg:space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="font-display text-2xl sm:text-3xl uppercase tracking-tightest text-foreground">
            Categorías Financieras
          </h1>
          <p className="mt-1 font-body text-sm text-muted-foreground">
            {stats.total > 0 && `${stats.activas} activas · `}
            Clasificación de ingresos y egresos del club
          </p>
        </div>
        <Button
          onClick={() => openCreate()}
          className="bg-bordo-800 hover:bg-bordo-700 text-white font-body text-sm w-full sm:w-auto"
        >
          <Plus className="size-4" />
          Nueva Categoría
        </Button>
      </motion.div>

      {/* Stats Cards */}
      {!loading && stats.total > 0 && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
        >
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.label}
                variants={fadeInUp}
                transition={springSmooth}
              >
                <Card className="relative overflow-hidden border-linea h-full">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <p className="font-body text-[11px] sm:text-xs text-muted-foreground mb-1">
                          {card.label}
                        </p>
                        <p className="font-display text-xl sm:text-2xl lg:text-3xl uppercase tracking-tightest text-foreground">
                          <AnimatedCounter value={card.value} />
                        </p>
                      </div>
                      <div
                        className={`p-1.5 sm:p-2 rounded-lg ${card.bg} shrink-0`}
                      >
                        <Icon
                          className={`size-4 sm:size-5 ${card.color}`}
                          strokeWidth={1.5}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Tabs + Controls */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as "ingreso" | "egreso");
            setExpanded(new Set());
          }}
        >
          <TabsList>
            <TabsTrigger value="ingreso" className="font-body text-sm gap-1.5">
              <TrendingUp className="size-3.5" />
              Ingresos
              {ingresosCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 min-w-5 px-1.5 text-[10px] font-body bg-emerald-100 text-emerald-700"
                >
                  {ingresosCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="egreso" className="font-body text-sm gap-1.5">
              <TrendingDown className="size-3.5" />
              Egresos
              {egresosCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 h-5 min-w-5 px-1.5 text-[10px] font-body bg-red-100 text-red-700"
                >
                  {egresosCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          {/* Show/hide inactive toggle */}
          {stats.inactivas > 0 && (
            <button
              onClick={() => setShowInactive(!showInactive)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-linea px-3 py-1.5 text-xs font-body text-muted-foreground hover:bg-superficie hover:text-foreground transition-colors"
            >
              {showInactive ? (
                <EyeOff className="size-3.5" />
              ) : (
                <Eye className="size-3.5" />
              )}
              {showInactive ? "Ocultar" : "Mostrar"} inactivas
              <Badge variant="secondary" className="text-[10px] h-4 px-1">
                {stats.inactivas}
              </Badge>
            </button>
          )}

          {/* Expand/Collapse all */}
          {tree.some((t) => t.children.length > 0) && (
            <div className="flex items-center gap-1">
              <button
                onClick={expandAll}
                className="rounded-lg border border-linea px-2.5 py-1.5 text-xs font-body text-muted-foreground hover:bg-superficie hover:text-foreground transition-colors"
              >
                Expandir
              </button>
              <button
                onClick={collapseAll}
                className="rounded-lg border border-linea px-2.5 py-1.5 text-xs font-body text-muted-foreground hover:bg-superficie hover:text-foreground transition-colors"
              >
                Colapsar
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Tree View */}
      {loading ? (
        <motion.div
          variants={staggerContainerFast}
          initial="hidden"
          animate="visible"
          className="space-y-3"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <motion.div
              key={i}
              variants={fadeInUp}
              className="h-16 rounded-xl border border-linea bg-white animate-pulse"
            />
          ))}
        </motion.div>
      ) : tree.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={springSmooth}
          className="flex flex-col items-center justify-center rounded-xl border border-linea bg-white py-16 text-center"
        >
          <div className="p-3 rounded-xl bg-superficie mb-4">
            <FolderTree
              className="size-8 text-muted-foreground/30"
              strokeWidth={1.5}
            />
          </div>
          <p className="font-heading text-sm uppercase tracking-editorial text-foreground mb-1">
            Sin categorías de {tab === "ingreso" ? "ingresos" : "egresos"}
          </p>
          <p className="font-body text-xs text-muted-foreground max-w-xs">
            Creá la primera categoría para empezar a organizar los{" "}
            {tab === "ingreso" ? "ingresos" : "egresos"} del club.
          </p>
          <Button
            onClick={() => openCreate()}
            variant="outline"
            size="sm"
            className="mt-4 font-body text-sm"
          >
            <Plus className="size-3.5" />
            Crear categoría
          </Button>
        </motion.div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-2"
          key={`${tab}-${showInactive}`}
        >
          <AnimatePresence mode="popLayout">
            {tree.map((node) => {
              const isExpanded = expanded.has(node.root.id);
              const hasChildren = node.children.length > 0;
              const isInactive = !node.root.activa;

              return (
                <motion.div
                  key={node.root.id}
                  variants={fadeInUp}
                  layout
                  transition={springSmooth}
                >
                  <Card
                    className={`overflow-hidden border-linea transition-shadow hover:shadow-card ${
                      isInactive ? "opacity-50" : ""
                    }`}
                  >
                    {/* Color accent stripe */}
                    <div className="relative">
                      <div
                        className="absolute top-0 left-0 w-1 h-full"
                        style={{
                          backgroundColor: node.root.color || "#730d32",
                        }}
                      />

                      {/* Root Category Row */}
                      <div className="flex items-center gap-2 sm:gap-3 pl-4 pr-3 py-3 sm:pl-5 sm:pr-4 sm:py-4">
                        {/* Expand button */}
                        <button
                          onClick={() => hasChildren && toggleExpand(node.root.id)}
                          className={`shrink-0 p-1 rounded-md transition-colors ${
                            hasChildren
                              ? "hover:bg-superficie text-muted-foreground hover:text-foreground cursor-pointer"
                              : "text-transparent cursor-default"
                          }`}
                        >
                          <motion.div
                            animate={{ rotate: isExpanded ? 90 : 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <ChevronRight className="size-4" />
                          </motion.div>
                        </button>

                        {/* Color dot */}
                        <span
                          className="size-3 rounded-full shrink-0 ring-2 ring-white shadow-sm"
                          style={{
                            backgroundColor: node.root.color || "#730d32",
                          }}
                        />

                        {/* Name + meta */}
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => hasChildren && toggleExpand(node.root.id)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-heading text-sm uppercase tracking-editorial text-foreground truncate">
                              {node.root.nombre}
                            </span>
                            {node.root.icono && (
                              <span className="hidden sm:inline font-body text-[10px] text-muted-foreground bg-superficie px-1.5 py-0.5 rounded">
                                {node.root.icono}
                              </span>
                            )}
                          </div>
                          <p className="font-body text-[11px] text-muted-foreground mt-0.5">
                            {node.root.slug}
                          </p>
                        </div>

                        {/* Badges */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isInactive && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] font-body bg-amber-50 text-amber-700 border-amber-200"
                            >
                              Inactiva
                            </Badge>
                          )}
                          {hasChildren && (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-body tabular-nums"
                            >
                              {node.children.length}{" "}
                              {node.children.length === 1 ? "sub" : "subs"}
                            </Badge>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openCreate(node.root);
                            }}
                            className="rounded-md p-1.5 text-muted-foreground hover:text-bordo-700 hover:bg-bordo-50 transition-colors"
                            title="Agregar subcategoría"
                          >
                            <Plus className="size-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(node.root);
                            }}
                            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-superficie transition-colors"
                            title="Editar categoría"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Children */}
                      <AnimatePresence initial={false}>
                        {isExpanded && hasChildren && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{
                              height: { ...springSmooth },
                              opacity: { duration: 0.2 },
                            }}
                            className="overflow-hidden"
                          >
                            <div className="border-t border-linea bg-superficie/30">
                              {node.children.map((child, idx) => {
                                const childInactive = !child.activa;

                                return (
                                  <motion.div
                                    key={child.id}
                                    initial={{ opacity: 0, x: -8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{
                                      delay: idx * 0.03,
                                      ...springSmooth,
                                    }}
                                    className={`flex items-center gap-2 sm:gap-3 pl-12 pr-3 py-2.5 sm:pl-14 sm:pr-4 sm:py-3 hover:bg-superficie/80 transition-colors group ${
                                      childInactive ? "opacity-50" : ""
                                    }`}
                                  >
                                    {/* Connector line visual */}
                                    <Tag className="size-3 text-muted-foreground/40 shrink-0" />

                                    {/* Color dot */}
                                    <span
                                      className="size-2.5 rounded-full shrink-0"
                                      style={{
                                        backgroundColor:
                                          child.color ||
                                          node.root.color ||
                                          "#730d32",
                                      }}
                                    />

                                    {/* Name + slug */}
                                    <div className="flex-1 min-w-0">
                                      <span className="font-body text-sm text-foreground truncate block">
                                        {child.nombre}
                                      </span>
                                      <span className="font-body text-[10px] text-muted-foreground">
                                        {child.slug}
                                      </span>
                                    </div>

                                    {/* Badges */}
                                    {childInactive && (
                                      <Badge
                                        variant="secondary"
                                        className="text-[10px] font-body bg-amber-50 text-amber-700 border-amber-200 shrink-0"
                                      >
                                        Inactiva
                                      </Badge>
                                    )}

                                    {child.icono && (
                                      <span className="hidden sm:inline font-body text-[10px] text-muted-foreground bg-white px-1.5 py-0.5 rounded shrink-0">
                                        {child.icono}
                                      </span>
                                    )}

                                    {/* Edit */}
                                    <button
                                      onClick={() => openEdit(child)}
                                      className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-white transition-all"
                                    >
                                      <Pencil className="size-3.5" />
                                    </button>
                                  </motion.div>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-base uppercase tracking-editorial">
              {editingId ? "Editar categoría" : "Nueva categoría"}
            </DialogTitle>
          </DialogHeader>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springSmooth}
            className="space-y-4 pt-2"
          >
            {/* Nombre */}
            <div className="space-y-1.5">
              <Label className="font-body text-sm">Nombre *</Label>
              <Input
                value={form.nombre}
                onChange={(e) => handleNombreChange(e.target.value)}
                placeholder="Ej: Cuotas de socios"
                className="font-body"
                autoFocus
              />
            </div>

            {/* Slug (read-only visual) */}
            <div className="space-y-1.5">
              <Label className="font-body text-sm text-muted-foreground">
                Slug
              </Label>
              <div className="flex items-center gap-2 rounded-lg border border-linea bg-superficie/50 px-3 py-2">
                <Tag className="size-3 text-muted-foreground" />
                <span className="font-body font-mono text-xs text-muted-foreground">
                  {form.slug || "se-genera-automaticamente"}
                </span>
              </div>
            </div>

            {/* Tipo + Padre */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-body text-sm">Tipo *</Label>
                <Select
                  value={form.tipo}
                  onValueChange={(v) =>
                    setForm((prev) => ({
                      ...prev,
                      tipo: v as "ingreso" | "egreso",
                      padre_id: null,
                    }))
                  }
                >
                  <SelectTrigger className="font-body text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ingreso">
                      <span className="flex items-center gap-2">
                        <TrendingUp className="size-3.5 text-emerald-600" />
                        Ingreso
                      </span>
                    </SelectItem>
                    <SelectItem value="egreso">
                      <span className="flex items-center gap-2">
                        <TrendingDown className="size-3.5 text-red-600" />
                        Egreso
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="font-body text-sm">
                  Categoría padre
                </Label>
                <Select
                  value={form.padre_id?.toString() || "none"}
                  onValueChange={(v) =>
                    setForm((prev) => ({
                      ...prev,
                      padre_id: !v || v === "none" ? null : parseInt(v, 10),
                    }))
                  }
                >
                  <SelectTrigger className="font-body text-sm">
                    <SelectValue placeholder="Sin padre (raíz)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin padre (raíz)</SelectItem>
                    {roots
                      .filter((r) => r.id !== editingId)
                      .map((r) => (
                        <SelectItem key={r.id} value={r.id.toString()}>
                          <span className="flex items-center gap-2">
                            <span
                              className="inline-block size-2 rounded-full"
                              style={{
                                backgroundColor: r.color || "#730d32",
                              }}
                            />
                            {r.nombre}
                          </span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Color + Icono */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-body text-sm">Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, color: e.target.value }))
                    }
                    className="size-9 cursor-pointer rounded-lg border border-linea bg-transparent p-0.5"
                  />
                  <Input
                    value={form.color}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, color: e.target.value }))
                    }
                    className="font-body font-mono text-xs flex-1"
                    maxLength={7}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="font-body text-sm">Icono (Lucide)</Label>
                <Input
                  value={form.icono}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, icono: e.target.value }))
                  }
                  placeholder="Wallet, Users..."
                  className="font-body text-sm"
                />
              </div>
            </div>

            {/* Orden */}
            <div className="space-y-1.5">
              <Label className="font-body text-sm">Orden de aparición</Label>
              <Input
                type="number"
                value={form.orden}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    orden: parseInt(e.target.value, 10) || 0,
                  }))
                }
                className="font-body text-sm"
                min={0}
              />
            </div>

            {/* Activa toggle */}
            <div className="flex items-center justify-between rounded-lg border border-linea px-4 py-3">
              <div>
                <Label className="font-body text-sm cursor-pointer">
                  Categoría activa
                </Label>
                <p className="font-body text-[11px] text-muted-foreground mt-0.5">
                  Las inactivas no aparecen al crear movimientos
                </p>
              </div>
              <Switch
                checked={form.activa}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, activa: checked }))
                }
              />
            </div>
          </motion.div>

          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="font-body text-sm"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-bordo-800 hover:bg-bordo-700 text-white font-body text-sm"
            >
              {submitting
                ? "Guardando..."
                : editingId
                  ? "Guardar cambios"
                  : "Crear categoría"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
