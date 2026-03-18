"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Warehouse,
  Plus,
  MapPin,
  Package,
  Loader2,
  Save,
  X,
  Pencil,
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
  springBouncy,
} from "@/lib/motion";
import { toast } from "sonner";
import Link from "next/link";

interface Deposito {
  id: number;
  nombre: string;
  descripcion: string | null;
  ubicacion: string | null;
  activo: boolean;
  created_at: string;
}

export default function DepositosPage() {
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Deposito | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [activo, setActivo] = useState(true);

  const loadDepositos = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/depositos");
      if (!res.ok) throw new Error("Error al cargar depósitos");
      const { data } = await res.json();
      setDepositos(data);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDepositos();
  }, [loadDepositos]);

  const openCreate = () => {
    setEditing(null);
    setNombre("");
    setDescripcion("");
    setUbicacion("");
    setActivo(true);
    setDialogOpen(true);
  };

  const openEdit = (dep: Deposito) => {
    setEditing(dep);
    setNombre(dep.nombre);
    setDescripcion(dep.descripcion || "");
    setUbicacion(dep.ubicacion || "");
    setActivo(dep.activo);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!nombre.trim()) {
      toast.error("Nombre requerido");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        ubicacion: ubicacion.trim() || null,
        activo,
      };

      const url = editing
        ? `/api/admin/depositos/${editing.id}`
        : "/api/admin/depositos";
      const method = editing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al guardar");
      }

      toast.success(editing ? "Depósito actualizado" : "Depósito creado");
      setDialogOpen(false);
      loadDepositos();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        transition={springSmooth}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Depósitos</h1>
          <p className="text-sm text-muted-foreground">
            Gestioná tus depósitos y ubicaciones de stock
          </p>
        </div>
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
          <Button onClick={openCreate}>
            <Plus className="size-4 mr-2" />
            Nuevo depósito
          </Button>
        </motion.div>
      </motion.div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid gap-4 sm:grid-cols-2"
        >
          <AnimatePresence mode="popLayout">
            {depositos.map((dep) => (
              <motion.div
                key={dep.id}
                variants={fadeInUp}
                layout
                className={`group relative rounded-2xl border p-5 transition-colors hover:border-primary/30 ${
                  dep.activo
                    ? "border-border/60 bg-card"
                    : "border-border/30 bg-muted/20 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
                      <Warehouse className="size-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{dep.nombre}</h3>
                      {dep.ubicacion && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="size-3" />
                          {dep.ubicacion}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {!dep.activo && (
                      <Badge variant="secondary" className="text-[10px]">
                        Inactivo
                      </Badge>
                    )}
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => openEdit(dep)}
                      className="flex size-7 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                    >
                      <Pencil className="size-3.5" />
                    </motion.button>
                  </div>
                </div>

                {dep.descripcion && (
                  <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                    {dep.descripcion}
                  </p>
                )}

                <div className="mt-4">
                  <Link
                    href={`/admin/stock/depositos/${dep.id}`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                  >
                    <Package className="size-3" />
                    Ver stock
                  </Link>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar depósito" : "Nuevo depósito"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div>
              <Label htmlFor="dep-nombre">Nombre</Label>
              <Input
                id="dep-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Depósito Cancha"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="dep-ubicacion">Ubicación</Label>
              <Input
                id="dep-ubicacion"
                value={ubicacion}
                onChange={(e) => setUbicacion(e.target.value)}
                placeholder="Ej: Edificio A, Planta Baja"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="dep-desc">Descripción</Label>
              <Textarea
                id="dep-desc"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Descripción opcional..."
                rows={2}
                className="mt-1.5"
              />
            </div>

            {editing && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label>Activo</Label>
                <Switch checked={activo} onCheckedChange={setActivo} />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : (
                  <Save className="size-4 mr-2" />
                )}
                {editing ? "Guardar" : "Crear"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
