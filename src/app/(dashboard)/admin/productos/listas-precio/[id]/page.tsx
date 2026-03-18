"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Save,
  Loader2,
  Plus,
  Search,
  Trash2,
  Tag,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { fadeInUp, springSmooth } from "@/lib/motion";
import { toast } from "sonner";
import { createBrowserClient } from "@/lib/supabase/client";
import Link from "next/link";

interface ListaPrecioItem {
  id?: number;
  producto_id: number;
  variante_id: number | null;
  precio: number;
  productos?: { id: number; nombre: string; sku: string | null; precio: number };
  producto_variantes?: { id: number; nombre: string } | null;
}

interface Disciplina {
  id: number;
  nombre: string;
}

interface ListaPrecio {
  id: number;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
  lista_precio_items: ListaPrecioItem[];
  lista_precio_disciplinas: { disciplina_id: number; disciplinas: Disciplina }[];
}

export default function ListaPrecioDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [lista, setLista] = useState<ListaPrecio | null>(null);
  const [items, setItems] = useState<ListaPrecioItem[]>([]);
  const [allDisciplinas, setAllDisciplinas] = useState<Disciplina[]>([]);
  const [selectedDisciplinas, setSelectedDisciplinas] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [savingItems, setSavingItems] = useState(false);
  const [savingDisc, setSavingDisc] = useState(false);

  // Product search
  const [productoSearch, setProductoSearch] = useState("");
  const [productosFound, setProductosFound] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const [listaRes, discRes] = await Promise.all([
        fetch(`/api/admin/listas-precio/${id}`),
        createBrowserClient()
          .from("disciplinas")
          .select("id, nombre")
          .eq("activa", true)
          .order("nombre"),
      ]);

      if (!listaRes.ok) throw new Error("Lista no encontrada");

      const { data: listaData } = await listaRes.json();
      setLista(listaData);
      setItems(listaData.lista_precio_items || []);
      setSelectedDisciplinas(
        new Set(
          (listaData.lista_precio_disciplinas || []).map(
            (d: any) => d.disciplina_id
          )
        )
      );
      setAllDisciplinas(discRes.data || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Product search
  useEffect(() => {
    if (productoSearch.length < 2) {
      setProductosFound([]);
      return;
    }
    const timer = setTimeout(async () => {
      const supabase = createBrowserClient();
      const { data } = await supabase
        .from("productos")
        .select("id, nombre, sku, precio, producto_variantes(id, nombre)")
        .or(`nombre.ilike.%${productoSearch}%,sku.ilike.%${productoSearch}%`)
        .eq("activo", true)
        .limit(10);
      setProductosFound(data || []);
    }, 300);
    return () => clearTimeout(timer);
  }, [productoSearch]);

  const addProduct = (producto: any, varianteId?: number) => {
    const exists = items.some(
      (i) =>
        i.producto_id === producto.id &&
        i.variante_id === (varianteId || null)
    );
    if (exists) {
      toast.error("Ya está en la lista");
      return;
    }

    const variante = varianteId
      ? producto.producto_variantes.find((v: any) => v.id === varianteId)
      : null;

    setItems((prev) => [
      ...prev,
      {
        producto_id: producto.id,
        variante_id: varianteId || null,
        precio: producto.precio,
        productos: { id: producto.id, nombre: producto.nombre, sku: producto.sku, precio: producto.precio },
        producto_variantes: variante ? { id: variante.id, nombre: variante.nombre } : null,
      },
    ]);
    setProductoSearch("");
    setProductosFound([]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updatePrice = (index: number, precio: number) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, precio } : item))
    );
  };

  const saveItems = async () => {
    setSavingItems(true);
    try {
      const res = await fetch(`/api/admin/listas-precio/${id}/items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            producto_id: i.producto_id,
            variante_id: i.variante_id,
            precio: i.precio,
          })),
        }),
      });
      if (!res.ok) throw new Error("Error al guardar items");
      const { data } = await res.json();
      setItems(data);
      toast.success("Precios guardados");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSavingItems(false);
    }
  };

  const saveDisciplinas = async () => {
    setSavingDisc(true);
    try {
      const res = await fetch(`/api/admin/listas-precio/${id}/disciplinas`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          disciplina_ids: Array.from(selectedDisciplinas),
        }),
      });
      if (!res.ok) throw new Error("Error al guardar disciplinas");
      toast.success("Disciplinas actualizadas");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSavingDisc(false);
    }
  };

  const toggleDisciplina = (disciplinaId: number) => {
    setSelectedDisciplinas((prev) => {
      const next = new Set(prev);
      if (next.has(disciplinaId)) {
        next.delete(disciplinaId);
      } else {
        next.add(disciplinaId);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!lista) {
    return <div className="text-center py-20 text-muted-foreground">Lista no encontrada</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        transition={springSmooth}
      >
        <Link
          href="/admin/productos/listas-precio"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="size-4" />
          Listas de precio
        </Link>
        <div className="flex items-center gap-3">
          <Tag className="size-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">{lista.nombre}</h1>
        </div>
        {lista.descripcion && (
          <p className="mt-1 text-sm text-muted-foreground">{lista.descripcion}</p>
        )}
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-[1fr,300px]">
        {/* Left: Products */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ ...springSmooth, delay: 0.05 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Productos y precios</h2>
            <Button
              size="sm"
              onClick={saveItems}
              disabled={savingItems}
              className="h-7 text-xs"
            >
              {savingItems ? <Loader2 className="size-3 animate-spin mr-1" /> : <Save className="size-3 mr-1" />}
              Guardar precios
            </Button>
          </div>

          {/* Add product */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={productoSearch}
              onChange={(e) => setProductoSearch(e.target.value)}
              placeholder="Agregar producto..."
              className="pl-9"
            />
            <AnimatePresence>
              {productosFound.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute z-10 mt-1 w-full rounded-lg border bg-popover shadow-lg max-h-40 overflow-y-auto"
                >
                  {productosFound.map((p: any) => (
                    <div key={p.id}>
                      {p.producto_variantes?.length > 0 ? (
                        p.producto_variantes.map((v: any) => (
                          <button
                            key={`${p.id}-${v.id}`}
                            type="button"
                            onClick={() => addProduct(p, v.id)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between"
                          >
                            <span>
                              {p.nombre} — {v.nombre}
                            </span>
                            <span className="text-muted-foreground">
                              ${p.precio}
                            </span>
                          </button>
                        ))
                      ) : (
                        <button
                          type="button"
                          onClick={() => addProduct(p)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between"
                        >
                          <span>{p.nombre}</span>
                          <span className="text-muted-foreground">
                            ${p.precio}
                          </span>
                        </button>
                      )}
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Items table */}
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Producto</th>
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground w-24">P. base</th>
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground w-28">P. mayorista</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-muted-foreground text-xs">
                      Buscá productos para agregar a la lista
                    </td>
                  </tr>
                ) : (
                  items.map((item, index) => (
                    <motion.tr
                      key={`${item.producto_id}-${item.variante_id}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    >
                      <td className="py-2 px-4">
                        <span className="font-medium">
                          {item.productos?.nombre}
                        </span>
                        {item.producto_variantes && (
                          <span className="text-muted-foreground">
                            {" "}— {item.producto_variantes.nombre}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right text-muted-foreground">
                        ${item.productos?.precio?.toLocaleString("es-UY")}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="relative inline-flex">
                          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                            $
                          </span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.precio}
                            onChange={(e) =>
                              updatePrice(index, parseFloat(e.target.value) || 0)
                            }
                            className="h-7 w-24 pl-5 text-xs text-right"
                          />
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Right: Disciplinas */}
        <motion.div
          variants={fadeInUp}
          initial="hidden"
          animate="visible"
          transition={{ ...springSmooth, delay: 0.1 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Disciplinas</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={saveDisciplinas}
              disabled={savingDisc}
              className="h-7 text-xs"
            >
              {savingDisc ? <Loader2 className="size-3 animate-spin mr-1" /> : <Save className="size-3 mr-1" />}
              Guardar
            </Button>
          </div>

          <div className="rounded-xl border p-3 space-y-2">
            {allDisciplinas.map((disc) => (
              <label
                key={disc.id}
                className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/40 cursor-pointer transition-colors"
              >
                <Checkbox
                  checked={selectedDisciplinas.has(disc.id)}
                  onCheckedChange={() => toggleDisciplina(disc.id)}
                />
                <span className="text-sm">{disc.nombre}</span>
              </label>
            ))}
            {allDisciplinas.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                No hay disciplinas activas
              </p>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
