"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Edit, Trash2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase/client";
import { fadeInUp } from "@/lib/motion";
import { toast } from "sonner";
import { useDocumentTitle } from "@/hooks/use-document-title";

interface Categoria {
  id: number;
  nombre: string;
  slug: string;
  descripcion: string | null;
  orden: number;
  activa: boolean;
}

function slugify(str: string) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function AdminCategoriasPage() {
  useDocumentTitle("Categorías");
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Categoria | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({
    nombre: "",
    slug: "",
    descripcion: "",
    orden: 0,
    activa: true,
  });
  const [saving, setSaving] = useState(false);

  const fetchCategorias = useCallback(async () => {
    const supabase = createBrowserClient();
    const { data } = await supabase
      .from("categorias_producto")
      .select("*")
      .order("orden");
    setCategorias(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCategorias();
  }, [fetchCategorias]);

  function openNew() {
    setEditing(null);
    setForm({ nombre: "", slug: "", descripcion: "", orden: categorias.length, activa: true });
    setDialogOpen(true);
  }

  function openEdit(cat: Categoria) {
    setEditing(cat);
    setForm({
      nombre: cat.nombre,
      slug: cat.slug,
      descripcion: cat.descripcion || "",
      orden: cat.orden,
      activa: cat.activa,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.nombre) {
      toast.error("Nombre requerido");
      return;
    }
    setSaving(true);

    const payload = {
      ...form,
      slug: form.slug || slugify(form.nombre),
      id: editing?.id,
    };

    const method = editing ? "PUT" : "POST";
    const res = await fetch("/api/admin/categorias", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      toast.success(editing ? "Categoría actualizada" : "Categoría creada");
      setDialogOpen(false);
      fetchCategorias();
    } else {
      const err = await res.json();
      toast.error(err.error || "Error");
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteId) return;
    const res = await fetch(`/api/admin/categorias?id=${deleteId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Categoría eliminada");
      setDeleteId(null);
      fetchCategorias();
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
            Categorías
          </h1>
          <p className="mt-1 text-sm text-muted-foreground font-body">
            {categorias.length > 0 && `${categorias.length} categorías · `}Organizá los productos por categoría
          </p>
        </div>
        <Button onClick={openNew} className="w-full sm:w-auto">
          <Plus className="size-4" />
          Nueva categoría
        </Button>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border border-linea bg-white overflow-hidden"
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-16 font-heading uppercase tracking-editorial text-xs">Orden</TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-xs min-w-[140px]">Nombre</TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-xs hidden sm:table-cell">Slug</TableHead>
                <TableHead className="font-heading uppercase tracking-editorial text-xs text-center">Estado</TableHead>
                <TableHead className="w-20 font-heading uppercase tracking-editorial text-xs"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="mx-auto h-5 w-16 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  </TableRow>
                ))
              ) : categorias.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-16 text-center text-muted-foreground">
                    <Tag className="mx-auto mb-3 size-12 opacity-15" />
                    <p className="font-body text-sm">No hay categorías creadas</p>
                    <button onClick={openNew} className="mt-3 text-sm text-bordo-700 hover:text-bordo-800 font-medium">
                      Crear primera categoría
                    </button>
                  </TableCell>
                </TableRow>
              ) : (
                <AnimatePresence>
                  {categorias.map((cat) => (
                    <motion.tr
                      key={cat.id}
                      variants={fadeInUp}
                      initial="hidden"
                      animate="visible"
                      className="border-b border-linea last:border-0 transition-colors hover:bg-superficie/50"
                    >
                      <TableCell className="text-sm text-muted-foreground font-body tabular-nums py-3">
                        {cat.orden}
                      </TableCell>
                      <TableCell className="font-body text-sm font-medium py-3">
                        {cat.nombre}
                        {/* Show slug on mobile */}
                        <span className="sm:hidden text-xs text-muted-foreground block mt-0.5">
                          /{cat.slug}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground font-body hidden sm:table-cell">
                        {cat.slug}
                      </TableCell>
                      <TableCell className="text-center py-3">
                        {cat.activa ? (
                          <Badge variant="secondary">Activa</Badge>
                        ) : (
                          <Badge variant="outline">Inactiva</Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openEdit(cat)}
                          >
                            <Edit className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleteId(cat.id)}
                          >
                            <Trash2 className="size-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              )}
            </TableBody>
          </Table>
        </div>
      </motion.div>

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar categoría" : "Nueva categoría"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nombre *</Label>
              <Input
                value={form.nombre}
                onChange={(e) => {
                  setForm({
                    ...form,
                    nombre: e.target.value,
                    slug: editing ? form.slug : slugify(e.target.value),
                  });
                }}
                placeholder="Indumentaria"
              />
            </div>
            <div>
              <Label>Slug</Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </div>
            <div>
              <Label>Descripción</Label>
              <Input
                value={form.descripcion}
                onChange={(e) =>
                  setForm({ ...form, descripcion: e.target.value })
                }
                placeholder="Opcional"
              />
            </div>
            <div>
              <Label>Orden</Label>
              <Input
                type="number"
                value={form.orden}
                onChange={(e) =>
                  setForm({ ...form, orden: parseInt(e.target.value) || 0 })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Activa</Label>
              <Switch
                checked={form.activa}
                onCheckedChange={(v) => setForm({ ...form, activa: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar categoría</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Estás seguro? Los productos de esta categoría quedarán sin
            categoría.
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
