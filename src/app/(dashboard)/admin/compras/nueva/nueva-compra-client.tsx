"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Save,
  Check,
  Plus,
  Trash2,
  FileText,
} from "lucide-react";
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
} from "@/components/ui/dialog";
import { createBrowserClient } from "@/lib/supabase/client";
import { fadeInUp, staggerContainer } from "@/lib/motion";
import { toast } from "sonner";

interface Proveedor {
  id: number;
  nombre: string;
}

interface Producto {
  id: number;
  nombre: string;
  sku: string | null;
  precio: number;
}

interface CompraItem {
  producto_id: number;
  nombre: string;
  cantidad: number;
  costo_unitario: number;
}

function NuevaCompraContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedProveedor = searchParams.get("proveedor") || "";

  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [proveedorId, setProveedorId] = useState(preselectedProveedor);
  const [fecha, setFecha] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [notas, setNotas] = useState("");
  const [items, setItems] = useState<CompraItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Producto selector
  const [productoOpen, setProductoOpen] = useState(false);
  const [productoSearch, setProductoSearch] = useState("");

  useEffect(() => {
    async function load() {
      const supabase = createBrowserClient();
      const [provRes, prodRes] = await Promise.all([
        supabase
          .from("proveedores")
          .select("id, nombre")
          .eq("activo", true)
          .order("nombre"),
        supabase
          .from("productos")
          .select("id, nombre, sku, precio")
          .eq("activo", true)
          .order("nombre"),
      ]);
      setProveedores((provRes.data as any) || []);
      setProductos((prodRes.data as any) || []);
    }
    load();
  }, []);

  function addItem(producto: Producto) {
    const existing = items.find((i) => i.producto_id === producto.id);
    if (existing) {
      setItems(
        items.map((i) =>
          i.producto_id === producto.id
            ? { ...i, cantidad: i.cantidad + 1 }
            : i
        )
      );
    } else {
      setItems([
        ...items,
        {
          producto_id: producto.id,
          nombre: producto.nombre,
          cantidad: 1,
          costo_unitario: producto.precio,
        },
      ]);
    }
    setProductoOpen(false);
  }

  function updateItem(
    index: number,
    field: "cantidad" | "costo_unitario",
    value: number
  ) {
    setItems(items.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  const subtotal = items.reduce(
    (sum, item) => sum + item.cantidad * item.costo_unitario,
    0
  );

  async function handleSubmit(confirmar: boolean) {
    if (!proveedorId) {
      toast.error("Seleccioná un proveedor");
      return;
    }
    if (items.length === 0) {
      toast.error("Agregá al menos un item");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proveedor_id: parseInt(proveedorId),
          fecha_compra: fecha,
          notas: notas || null,
          items: items.map((i) => ({
            producto_id: i.producto_id,
            cantidad: i.cantidad,
            costo_unitario: i.costo_unitario,
          })),
          confirmar,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al crear compra");
      }

      const { data } = await res.json();
      toast.success(
        confirmar ? "Compra confirmada" : "Borrador guardado"
      );
      router.push(`/admin/compras/${data.id}`);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  function formatCurrency(n: number) {
    return `$${n.toLocaleString("es-UY")}`;
  }

  const filteredProductos = productoSearch
    ? productos.filter(
        (p) =>
          p.nombre.toLowerCase().includes(productoSearch.toLowerCase()) ||
          (p.sku && p.sku.toLowerCase().includes(productoSearch.toLowerCase()))
      )
    : productos;

  return (
    <div className="mx-auto max-w-3xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <Link
          href="/admin/compras"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Volver a compras
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-bordo-50">
            <FileText className="size-5 text-bordo-800" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Nueva compra</h1>
            <p className="text-sm text-muted-foreground">
              Registrá una compra a proveedor
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        {/* Datos de la compra */}
        <motion.div
          variants={fadeInUp}
          className="rounded-xl border bg-card p-6 space-y-4"
        >
          <h2 className="font-semibold">Datos de la compra</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Proveedor *</Label>
              <Select value={proveedorId} onValueChange={(v) => setProveedorId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar proveedor" />
                </SelectTrigger>
                <SelectContent>
                  {proveedores.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fecha</Label>
              <Input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Notas</Label>
              <Textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={2}
                placeholder="Notas de la compra..."
              />
            </div>
          </div>
        </motion.div>

        {/* Items */}
        <motion.div
          variants={fadeInUp}
          className="rounded-xl border bg-card p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Items</h2>
            <Button variant="outline" size="sm" onClick={() => setProductoOpen(true)}>
              <Plus className="size-3.5" />
              Agregar producto
            </Button>
          </div>

          {items.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Agregá productos a la compra
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="w-28">Cantidad</TableHead>
                  <TableHead className="w-32">Costo unit.</TableHead>
                  <TableHead className="w-28 text-right">Subtotal</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {items.map((item, index) => (
                    <motion.tr
                      key={item.producto_id}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border-b"
                    >
                      <TableCell className="text-sm font-medium">
                        {item.nombre}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          value={item.cantidad}
                          onChange={(e) =>
                            updateItem(
                              index,
                              "cantidad",
                              parseInt(e.target.value) || 1
                            )
                          }
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={item.costo_unitario}
                          onChange={(e) =>
                            updateItem(
                              index,
                              "costo_unitario",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(item.cantidad * item.costo_unitario)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </TableBody>
            </Table>
          )}

          {items.length > 0 && (
            <div className="flex justify-end border-t pt-4">
              <div className="text-right space-y-1">
                <p className="text-sm text-muted-foreground">
                  Subtotal:{" "}
                  <span className="font-medium text-foreground">
                    {formatCurrency(subtotal)}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">Impuestos: $0</p>
                <motion.p
                  key={subtotal}
                  initial={{ scale: 1.05 }}
                  animate={{ scale: 1 }}
                  className="text-lg font-bold"
                >
                  Total: {formatCurrency(subtotal)}
                </motion.p>
              </div>
            </div>
          )}
        </motion.div>

        {/* Acciones */}
        <motion.div
          variants={fadeInUp}
          className="flex flex-col gap-3 sm:flex-row sm:justify-end"
        >
          <Link href="/admin/compras">
            <Button type="button" variant="outline" className="w-full sm:w-auto">
              Cancelar
            </Button>
          </Link>
          <Button
            variant="outline"
            onClick={() => handleSubmit(false)}
            disabled={saving}
            className="w-full sm:w-auto"
          >
            <Save className="size-4" />
            Guardar borrador
          </Button>
          <Button
            onClick={() => handleSubmit(true)}
            disabled={saving}
            className="w-full sm:w-auto"
          >
            <Check className="size-4" />
            Confirmar compra
          </Button>
        </motion.div>
      </motion.div>

      {/* Dialog para agregar producto */}
      <Dialog open={productoOpen} onOpenChange={setProductoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar producto</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Buscar producto por nombre o SKU..."
            value={productoSearch}
            onChange={(e) => setProductoSearch(e.target.value)}
            autoFocus
          />
          <div className="max-h-64 overflow-y-auto space-y-1">
            {filteredProductos.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Sin resultados
              </p>
            ) : (
              filteredProductos.slice(0, 20).map((p) => (
                <button
                  key={p.id}
                  onClick={() => addItem(p)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-muted transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">{p.nombre}</p>
                    {p.sku && (
                      <p className="text-xs text-muted-foreground">
                        SKU: {p.sku}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatCurrency(p.precio)}
                  </span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function NuevaCompraPage() {
  return (
    <Suspense>
      <NuevaCompraContent />
    </Suspense>
  );
}
