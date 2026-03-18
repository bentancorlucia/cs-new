"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  List,
  Plus,
  Loader2,
  Save,
  Pencil,
  Tag,
  Users,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fadeInUp,
  staggerContainer,
  springSmooth,
} from "@/lib/motion";
import { toast } from "sonner";
import Link from "next/link";

interface ListaPrecio {
  id: number;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
  created_at: string;
  lista_precio_disciplinas: { disciplinas: { id: number; nombre: string } }[];
  lista_precio_items: { count: number }[];
}

export default function ListasPrecioPage() {
  const [listas, setListas] = useState<ListaPrecio[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/listas-precio");
      if (!res.ok) throw new Error("Error al cargar listas");
      const { data } = await res.json();
      setListas(data);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!nombre.trim()) {
      toast.error("Nombre requerido");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/listas-precio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nombre.trim(),
          descripcion: descripcion.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("Error al crear lista");
      toast.success("Lista creada");
      setDialogOpen(false);
      setNombre("");
      setDescripcion("");
      load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        transition={springSmooth}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Listas de precio</h1>
          <p className="text-sm text-muted-foreground">
            Precios mayoristas por disciplina
          </p>
        </div>
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="size-4 mr-2" />
            Nueva lista
          </Button>
        </motion.div>
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : listas.length === 0 ? (
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="text-center py-12"
        >
          <List className="size-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No hay listas de precio</p>
          <p className="text-xs text-muted-foreground mt-1">
            Creá una para asignar precios mayoristas a disciplinas
          </p>
        </motion.div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-3"
        >
          {listas.map((lista) => {
            const itemCount =
              lista.lista_precio_items?.[0]?.count || 0;
            const disciplinas = lista.lista_precio_disciplinas || [];

            return (
              <motion.div
                key={lista.id}
                variants={fadeInUp}
                className={`group rounded-xl border p-4 transition-colors hover:border-primary/30 ${
                  lista.activa ? "border-border/60 bg-card" : "opacity-60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Tag className="size-4 text-primary" />
                      <h3 className="font-semibold">{lista.nombre}</h3>
                      {!lista.activa && (
                        <Badge variant="secondary" className="text-[10px]">
                          Inactiva
                        </Badge>
                      )}
                    </div>
                    {lista.descripcion && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {lista.descripcion}
                      </p>
                    )}
                  </div>

                  <Link href={`/admin/productos/listas-precio/${lista.id}`}>
                    <Button variant="outline" size="sm" className="h-7 text-xs">
                      <Pencil className="size-3 mr-1" />
                      Editar
                    </Button>
                  </Link>
                </div>

                <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Package className="size-3" />
                    {itemCount} producto{itemCount !== 1 ? "s" : ""}
                  </span>
                  {disciplinas.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Users className="size-3" />
                      {disciplinas
                        .map((d) => d.disciplinas?.nombre)
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva lista de precio</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Nombre</Label>
              <Input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Precios Hockey"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Descripción</Label>
              <Textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Opcional..."
                rows={2}
                className="mt-1.5"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin mr-2" />}
                Crear
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
