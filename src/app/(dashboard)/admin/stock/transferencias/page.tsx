"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  ArrowLeftRight,
  Plus,
  Search,
  Loader2,
  Save,
  Package,
  Trash2,
  Warehouse,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { createBrowserClient } from "@/lib/supabase/client";
import { useDocumentTitle } from "@/hooks/use-document-title";

interface Deposito {
  id: number;
  nombre: string;
  activo: boolean;
}

interface TransferenciaItem {
  producto_id: number;
  variante_id: number | null;
  cantidad: number;
  // UI helpers
  productoNombre?: string;
  varianteNombre?: string;
}

interface Transferencia {
  id: number;
  deposito_origen: { id: number; nombre: string };
  deposito_destino: { id: number; nombre: string };
  estado: string;
  notas: string | null;
  created_at: string;
  completada_at: string | null;
  perfiles: { nombre_completo: string } | null;
  transferencia_items: any[];
}

interface ProductoSearch {
  id: number;
  nombre: string;
  sku: string | null;
  producto_variantes: { id: number; nombre: string; sku: string | null }[];
}

export default function TransferenciasPage() {
  useDocumentTitle("Transferencias de Stock");
  const [depositos, setDepositos] = useState<Deposito[]>([]);
  const [transferencias, setTransferencias] = useState<Transferencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [origenId, setOrigenId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [notas, setNotas] = useState("");
  const [items, setItems] = useState<TransferenciaItem[]>([]);

  // Product search
  const [productoSearch, setProductoSearch] = useState("");
  const [productosFound, setProductosFound] = useState<ProductoSearch[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [depRes, transRes] = await Promise.all([
        fetch("/api/admin/depositos"),
        fetch("/api/admin/depositos/transferencia"),
      ]);

      const { data: depData } = await depRes.json();
      const { data: transData } = await transRes.json();

      setDepositos(depData || []);
      setTransferencias(transData || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const searchProductos = useCallback(async (q: string) => {
    if (q.length < 2) {
      setProductosFound([]);
      return;
    }
    setSearchLoading(true);
    try {
      const supabase = createBrowserClient();
      const { data } = await supabase
        .from("productos")
        .select("id, nombre, sku, producto_variantes(id, nombre, sku)")
        .or(`nombre.ilike.%${q}%,sku.ilike.%${q}%`)
        .eq("activo", true)
        .limit(10);
      setProductosFound((data as any) || []);
    } catch {
      // silent
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchProductos(productoSearch), 300);
    return () => clearTimeout(timer);
  }, [productoSearch, searchProductos]);

  const addItem = (producto: ProductoSearch, varianteId?: number) => {
    const variante = varianteId
      ? producto.producto_variantes.find((v) => v.id === varianteId)
      : null;

    // Check if already added
    const exists = items.some(
      (i) =>
        i.producto_id === producto.id &&
        i.variante_id === (varianteId || null)
    );
    if (exists) {
      toast.error("Ya está agregado");
      return;
    }

    setItems((prev) => [
      ...prev,
      {
        producto_id: producto.id,
        variante_id: varianteId || null,
        cantidad: 1,
        productoNombre: producto.nombre,
        varianteNombre: variante?.nombre || undefined,
      },
    ]);
    setProductoSearch("");
    setProductosFound([]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItemCantidad = (index: number, cantidad: number) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, cantidad: Math.max(1, cantidad) } : item
      )
    );
  };

  const handleSubmit = async () => {
    if (!origenId || !destinoId) {
      toast.error("Seleccioná origen y destino");
      return;
    }
    if (origenId === destinoId) {
      toast.error("Origen y destino deben ser diferentes");
      return;
    }
    if (items.length === 0) {
      toast.error("Agregá al menos un producto");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/depositos/transferencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deposito_origen_id: parseInt(origenId),
          deposito_destino_id: parseInt(destinoId),
          notas: notas.trim() || null,
          items: items.map((i) => ({
            producto_id: i.producto_id,
            variante_id: i.variante_id,
            cantidad: i.cantidad,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al crear transferencia");
      }

      toast.success("Transferencia completada");
      setDialogOpen(false);
      setItems([]);
      setOrigenId("");
      setDestinoId("");
      setNotas("");
      loadData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const activeDepositos = depositos.filter((d) => d.activo);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        transition={springSmooth}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transferencias</h1>
          <p className="text-sm text-muted-foreground">
            Movimientos de stock entre depósitos
          </p>
        </div>
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="size-4 mr-2" />
            Nueva transferencia
          </Button>
        </motion.div>
      </motion.div>

      {/* Transfer history */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : transferencias.length === 0 ? (
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          className="text-center py-12"
        >
          <ArrowLeftRight className="size-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">No hay transferencias</p>
        </motion.div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-3"
        >
          {transferencias.map((t) => (
            <motion.div
              key={t.id}
              variants={fadeInUp}
              className="rounded-xl border border-border/60 p-4 hover:border-border transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="flex items-center gap-1.5">
                      <Warehouse className="size-3.5 text-muted-foreground" />
                      <span className="font-medium">
                        {t.deposito_origen?.nombre}
                      </span>
                    </div>
                    <ArrowRight className="size-4 text-primary" />
                    <div className="flex items-center gap-1.5">
                      <Warehouse className="size-3.5 text-muted-foreground" />
                      <span className="font-medium">
                        {t.deposito_destino?.nombre}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      t.estado === "completada" ? "default" : "secondary"
                    }
                    className="text-[10px]"
                  >
                    {t.estado === "completada" && (
                      <Check className="size-2.5 mr-0.5" />
                    )}
                    {t.estado}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleDateString("es-UY", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>

              {t.transferencia_items && t.transferencia_items.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {t.transferencia_items.map((item: any, i: number) => (
                    <Badge key={i} variant="outline" className="text-[10px]">
                      {item.productos?.nombre}
                      {item.producto_variantes?.nombre
                        ? ` (${item.producto_variantes.nombre})`
                        : ""}
                      {" × "}
                      {item.cantidad}
                    </Badge>
                  ))}
                </div>
              )}

              {t.notas && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {t.notas}
                </p>
              )}
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* New transfer dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva transferencia</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Origin & Destination */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Origen</Label>
                <Select value={origenId} onValueChange={(v) => setOrigenId(v || "")}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Depósito origen" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeDepositos.map((d) => (
                      <SelectItem key={d.id} value={d.id.toString()}>
                        {d.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Destino</Label>
                <Select value={destinoId} onValueChange={(v) => setDestinoId(v || "")}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Depósito destino" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeDepositos
                      .filter((d) => d.id.toString() !== origenId)
                      .map((d) => (
                        <SelectItem key={d.id} value={d.id.toString()}>
                          {d.nombre}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Product search */}
            <div>
              <Label>Agregar productos</Label>
              <div className="relative mt-1.5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  value={productoSearch}
                  onChange={(e) => setProductoSearch(e.target.value)}
                  placeholder="Buscar por nombre o SKU..."
                  className="pl-9"
                />
              </div>

              {/* Search results dropdown */}
              <AnimatePresence>
                {productosFound.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="mt-1 rounded-lg border bg-popover shadow-lg max-h-40 overflow-y-auto"
                  >
                    {productosFound.map((p) => (
                      <div key={p.id}>
                        {p.producto_variantes && p.producto_variantes.length > 0 ? (
                          p.producto_variantes.map((v) => (
                            <button
                              key={`${p.id}-${v.id}`}
                              type="button"
                              onClick={() => addItem(p, v.id)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center justify-between"
                            >
                              <span>
                                {p.nombre}{" "}
                                <span className="text-muted-foreground">
                                  — {v.nombre}
                                </span>
                              </span>
                              <Plus className="size-3 text-muted-foreground" />
                            </button>
                          ))
                        ) : (
                          <button
                            type="button"
                            onClick={() => addItem(p)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center justify-between"
                          >
                            <span>{p.nombre}</span>
                            <Plus className="size-3 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Items list */}
            <AnimatePresence mode="popLayout">
              {items.map((item, index) => (
                <motion.div
                  key={`${item.producto_id}-${item.variante_id}`}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={springSmooth}
                  className="flex items-center gap-3 rounded-lg border border-border/50 p-2.5"
                >
                  <Package className="size-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {item.productoNombre}
                    </p>
                    {item.varianteNombre && (
                      <p className="text-xs text-muted-foreground">
                        {item.varianteNombre}
                      </p>
                    )}
                  </div>
                  <Input
                    type="number"
                    min="1"
                    value={item.cantidad}
                    onChange={(e) =>
                      updateItemCantidad(index, parseInt(e.target.value) || 1)
                    }
                    className="w-20 h-8 text-sm text-center"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Notes */}
            <div>
              <Label>Notas (opcional)</Label>
              <Textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Motivo de la transferencia..."
                rows={2}
                className="mt-1.5"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={saving || items.length === 0}
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : (
                  <ArrowLeftRight className="size-4 mr-2" />
                )}
                Transferir
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
