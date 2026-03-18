"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  Loader2,
  Check,
  Package,
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
import { fadeInUp, springSmooth, springBouncy } from "@/lib/motion";
import { toast } from "sonner";
import { createBrowserClient } from "@/lib/supabase/client";
import Link from "next/link";

interface Disciplina {
  id: number;
  nombre: string;
}

interface CatalogoItem {
  producto_id: number;
  variante_id: number | null;
  precio_mayorista: number;
  precio_base: number;
  nombre: string;
  variante_nombre: string | null;
  sku: string | null;
}

interface CartItem extends CatalogoItem {
  cantidad: number;
}

export default function NuevoPedidoDisciplinaPage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserClient(), []);

  const [disciplinas, setDisciplinas] = useState<Disciplina[]>([]);
  const [disciplinaId, setDisciplinaId] = useState("");
  const [catalogo, setCatalogo] = useState<CatalogoItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [notas, setNotas] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingCatalogo, setLoadingCatalogo] = useState(false);
  const [procesando, setProcesando] = useState(false);

  // Load disciplinas
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("disciplinas")
        .select("id, nombre")
        .eq("activa", true)
        .order("nombre");
      setDisciplinas(data || []);
      setLoading(false);
    }
    load();
  }, [supabase]);

  // Load catalogo when disciplina changes
  const loadCatalogo = useCallback(
    async (discId: string) => {
      if (!discId) {
        setCatalogo([]);
        return;
      }
      setLoadingCatalogo(true);

      try {
        // Find price lists for this disciplina
        const { data: listaLinks } = await supabase
          .from("lista_precio_disciplinas")
          .select("lista_precio_id")
          .eq("disciplina_id", parseInt(discId));

        if (!listaLinks || listaLinks.length === 0) {
          setCatalogo([]);
          toast.info("No hay lista de precios asignada a esta disciplina");
          setLoadingCatalogo(false);
          return;
        }

        const listaIds = listaLinks.map((l: any) => l.lista_precio_id);

        // Get items from those lists
        const { data: items } = await supabase
          .from("lista_precio_items")
          .select(
            `
            producto_id, variante_id, precio,
            productos(id, nombre, sku, precio, stock_actual, activo),
            producto_variantes(id, nombre, sku)
          `
          )
          .in("lista_precio_id", listaIds);

        const catalogoItems: CatalogoItem[] = (items || [])
          .filter((i: any) => i.productos?.activo)
          .map((i: any) => ({
            producto_id: i.producto_id,
            variante_id: i.variante_id,
            precio_mayorista: i.precio,
            precio_base: i.productos.precio,
            nombre: i.productos.nombre,
            variante_nombre: i.producto_variantes?.nombre || null,
            sku: i.producto_variantes?.sku || i.productos.sku,
          }));

        setCatalogo(catalogoItems);
      } catch (error: any) {
        toast.error("Error al cargar catálogo");
      } finally {
        setLoadingCatalogo(false);
      }
    },
    [supabase]
  );

  useEffect(() => {
    if (disciplinaId) {
      loadCatalogo(disciplinaId);
      setCart([]);
    }
  }, [disciplinaId, loadCatalogo]);

  const addToCart = (item: CatalogoItem) => {
    setCart((prev) => {
      const existing = prev.find(
        (c) =>
          c.producto_id === item.producto_id &&
          c.variante_id === item.variante_id
      );
      if (existing) {
        return prev.map((c) =>
          c.producto_id === item.producto_id &&
          c.variante_id === item.variante_id
            ? { ...c, cantidad: c.cantidad + 1 }
            : c
        );
      }
      return [...prev, { ...item, cantidad: 1 }];
    });
  };

  const updateCantidad = (index: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item, i) =>
          i === index
            ? { ...item, cantidad: Math.max(0, item.cantidad + delta) }
            : item
        )
        .filter((item) => item.cantidad > 0)
    );
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const total = cart.reduce(
    (sum, item) => sum + item.precio_mayorista * item.cantidad,
    0
  );

  const filteredCatalogo = search
    ? catalogo.filter(
        (item) =>
          item.nombre.toLowerCase().includes(search.toLowerCase()) ||
          item.sku?.toLowerCase().includes(search.toLowerCase())
      )
    : catalogo;

  const handleSubmit = async () => {
    if (!disciplinaId || cart.length === 0) return;

    setProcesando(true);
    try {
      const res = await fetch("/api/admin/pedidos-disciplina", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          disciplina_id: parseInt(disciplinaId),
          items: cart.map((item) => ({
            producto_id: item.producto_id,
            variante_id: item.variante_id,
            cantidad: item.cantidad,
            precio_unitario: item.precio_mayorista,
          })),
          notas: notas.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al crear pedido");
      }

      const { data } = await res.json();
      toast.success(`Pedido ${data.numero_pedido} creado`);
      router.push("/pedidos-disciplinas");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setProcesando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        transition={springSmooth}
      >
        <Link
          href="/pedidos-disciplinas"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="size-4" />
          Pedidos Disciplinas
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">
          Nuevo pedido mayorista
        </h1>
      </motion.div>

      {/* Disciplina selector */}
      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        transition={{ ...springSmooth, delay: 0.05 }}
      >
        <Label>Disciplina</Label>
        <Select value={disciplinaId} onValueChange={(v) => setDisciplinaId(v || "")}>
          <SelectTrigger className="mt-1.5 w-80">
            <SelectValue placeholder="Seleccionar disciplina" />
          </SelectTrigger>
          <SelectContent>
            {disciplinas.map((d) => (
              <SelectItem key={d.id} value={d.id.toString()}>
                {d.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </motion.div>

      {disciplinaId && (
        <div className="grid gap-6 lg:grid-cols-[1fr,380px]">
          {/* Left: Catalog */}
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            transition={{ ...springSmooth, delay: 0.1 }}
            className="space-y-4"
          >
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar producto..."
                className="pl-9"
              />
            </div>

            {loadingCatalogo ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : catalogo.length === 0 ? (
              <div className="text-center py-12">
                <Package className="size-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No hay productos en la lista de precios de esta disciplina
                </p>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {filteredCatalogo.map((item) => {
                  const inCart = cart.find(
                    (c) =>
                      c.producto_id === item.producto_id &&
                      c.variante_id === item.variante_id
                  );

                  return (
                    <motion.button
                      key={`${item.producto_id}-${item.variante_id}`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => addToCart(item)}
                      className={`text-left rounded-xl border p-3 transition-colors ${
                        inCart
                          ? "border-primary/30 bg-primary/5"
                          : "border-border/50 hover:border-primary/20"
                      }`}
                    >
                      <p className="text-sm font-medium truncate">
                        {item.nombre}
                      </p>
                      {item.variante_nombre && (
                        <p className="text-xs text-muted-foreground">
                          {item.variante_nombre}
                        </p>
                      )}
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="text-sm font-bold text-primary">
                          ${item.precio_mayorista.toLocaleString("es-UY")}
                        </span>
                        {item.precio_mayorista < item.precio_base && (
                          <span className="text-[11px] text-muted-foreground line-through">
                            ${item.precio_base.toLocaleString("es-UY")}
                          </span>
                        )}
                        {inCart && (
                          <Badge className="text-[10px] h-4 ml-auto">
                            ×{inCart.cantidad}
                          </Badge>
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* Right: Cart */}
          <motion.div
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            transition={{ ...springSmooth, delay: 0.15 }}
            className="space-y-4 lg:sticky lg:top-6 lg:self-start"
          >
            <div className="rounded-2xl border bg-card p-4 space-y-4">
              <h2 className="font-semibold flex items-center gap-2">
                <ShoppingBag className="size-4" />
                Pedido
                {cart.length > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    {cart.reduce((s, i) => s + i.cantidad, 0)} items
                  </Badge>
                )}
              </h2>

              {cart.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-6">
                  Seleccioná productos del catálogo
                </p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  <AnimatePresence mode="popLayout">
                    {cart.map((item, index) => (
                      <motion.div
                        key={`${item.producto_id}-${item.variante_id}`}
                        layout
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={springSmooth}
                        className="flex items-center gap-2 rounded-lg border border-border/40 p-2"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">
                            {item.nombre}
                          </p>
                          {item.variante_nombre && (
                            <p className="text-[11px] text-muted-foreground">
                              {item.variante_nombre}
                            </p>
                          )}
                          <p className="text-xs text-primary font-semibold">
                            ${item.precio_mayorista.toLocaleString("es-UY")} c/u
                          </p>
                        </div>

                        <div className="flex items-center gap-1">
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => updateCantidad(index, -1)}
                            className="flex size-6 items-center justify-center rounded-md bg-muted hover:bg-muted/80"
                          >
                            <Minus className="size-3" />
                          </motion.button>
                          <span className="w-6 text-center text-sm font-bold">
                            {item.cantidad}
                          </span>
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => updateCantidad(index, 1)}
                            className="flex size-6 items-center justify-center rounded-md bg-muted hover:bg-muted/80"
                          >
                            <Plus className="size-3" />
                          </motion.button>
                        </div>

                        <span className="text-sm font-semibold w-16 text-right">
                          $
                          {(
                            item.precio_mayorista * item.cantidad
                          ).toLocaleString("es-UY")}
                        </span>

                        <button
                          onClick={() => removeFromCart(index)}
                          className="flex size-5 items-center justify-center rounded text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {cart.length > 0 && (
                <>
                  <div className="border-t pt-3 flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span>${total.toLocaleString("es-UY")}</span>
                  </div>

                  <Textarea
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    placeholder="Notas (opcional)"
                    rows={2}
                    className="text-xs"
                  />

                  <p className="text-[11px] text-muted-foreground">
                    Se cargará a cuenta corriente de la disciplina
                  </p>

                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <Button
                      onClick={handleSubmit}
                      disabled={procesando}
                      className="w-full h-12 text-base font-bold"
                    >
                      {procesando ? (
                        <Loader2 className="size-5 animate-spin mr-2" />
                      ) : (
                        <Check className="size-5 mr-2" />
                      )}
                      Confirmar pedido
                    </Button>
                  </motion.div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
