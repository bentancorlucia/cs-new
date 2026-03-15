"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, SlidersHorizontal, ShoppingBag, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProductCard } from "@/components/tienda/product-card";
import { useCart } from "@/hooks/use-cart";
import { CartSheet } from "@/components/tienda/cart-sheet";
import { HeroSection } from "@/components/shared/hero-section";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  staggerContainer,
  fadeInUp,
  springSmooth,
} from "@/lib/motion";
import { toast } from "sonner";
import type { Database } from "@/types/database";

type Producto = Database["public"]["Tables"]["productos"]["Row"] & {
  categorias_producto: { nombre: string; slug: string } | null;
  producto_imagenes: { url: string; es_principal: boolean }[];
};

type Categoria = Database["public"]["Tables"]["categorias_producto"]["Row"];

const ITEMS_PER_PAGE = 12;

export function TiendaClient() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoriaActiva, setCategoriaActiva] = useState<string>("todas");
  const [orden, setOrden] = useState<string>("nuevos");
  const [page, setPage] = useState(1);
  const { addItem } = useCart();

  useEffect(() => {
    const supabase = createBrowserClient();

    async function fetchData() {
      const [prodRes, catRes] = await Promise.all([
        supabase
          .from("productos")
          .select("*, categorias_producto(nombre, slug), producto_imagenes(url, es_principal)")
          .eq("activo", true)
          .order("created_at", { ascending: false }),
        supabase
          .from("categorias_producto")
          .select("*")
          .eq("activa", true)
          .order("orden"),
      ]);

      if (prodRes.data) setProductos(prodRes.data as unknown as Producto[]);
      if (catRes.data) setCategorias(catRes.data);
      setLoading(false);
    }

    fetchData();
  }, []);

  const productosFiltrados = useMemo(() => {
    let result = [...productos];

    // Search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          p.descripcion_corta?.toLowerCase().includes(q)
      );
    }

    // Category filter
    if (categoriaActiva !== "todas") {
      result = result.filter(
        (p) => p.categorias_producto?.slug === categoriaActiva
      );
    }

    // Sort
    switch (orden) {
      case "precio-asc":
        result.sort((a, b) => a.precio - b.precio);
        break;
      case "precio-desc":
        result.sort((a, b) => b.precio - a.precio);
        break;
      case "nuevos":
        result.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        break;
    }

    return result;
  }, [productos, search, categoriaActiva, orden]);

  const totalPages = Math.ceil(productosFiltrados.length / ITEMS_PER_PAGE);
  const productosPagina = productosFiltrados.slice(0, page * ITEMS_PER_PAGE);
  const hasMore = page < totalPages;

  const handleAddToCart = useCallback(
    (producto: Producto) => {
      const imagen = producto.producto_imagenes?.find((i) => i.es_principal)
        ?? producto.producto_imagenes?.[0];
      addItem({
        productoId: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        precioSocio: producto.precio_socio ?? undefined,
        imagenUrl: imagen?.url ?? "",
        maxStock: producto.stock_actual,
        slug: producto.slug,
      });
      toast.success("Agregado al carrito", {
        description: producto.nombre,
      });
    },
    [addItem]
  );

  // Debounced search
  const [searchInput, setSearchInput] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  return (
    <>
      <HeroSection
        eyebrow="Tienda oficial"
        title="Tienda"
        subtitle="Indumentaria oficial, accesorios y merchandising de Club Seminario"
        variant="minimal"
      />

      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Cart + filters header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex items-center justify-between"
        >
          <p className="text-sm text-muted-foreground">
            Encontrá todo lo que necesitás para representar al club
          </p>
          <CartSheet />
        </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar productos..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Sort */}
        <Select value={orden} onValueChange={(v) => { if (v) { setOrden(v); setPage(1); } }}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Ordenar por" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nuevos">Más nuevos</SelectItem>
            <SelectItem value="precio-asc">Menor precio</SelectItem>
            <SelectItem value="precio-desc">Mayor precio</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      {/* Category tabs */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="mb-6 flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
      >
        <button
          onClick={() => { setCategoriaActiva("todas"); setPage(1); }}
          className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-all ${
            categoriaActiva === "todas"
              ? "border-bordo-800 bg-bordo-800 text-white shadow-sm"
              : "border-bordo-800/20 bg-white text-foreground/70 hover:border-bordo-800/40 hover:text-foreground shadow-sm"
          }`}
        >
          Todas
        </button>
        {categorias.map((cat) => (
          <button
            key={cat.id}
            onClick={() => { setCategoriaActiva(cat.slug); setPage(1); }}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-all ${
              categoriaActiva === cat.slug
                ? "border-bordo-800 bg-bordo-800 text-white shadow-sm"
                : "border-bordo-800/20 bg-white text-foreground/70 hover:border-bordo-800/40 hover:text-foreground shadow-sm"
            }`}
          >
            {cat.nombre}
          </button>
        ))}
      </motion.div>

      {/* Results count */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mb-4 text-sm text-muted-foreground"
      >
        {productosFiltrados.length} producto
        {productosFiltrados.length !== 1 ? "s" : ""}
        {search && ` para "${search}"`}
      </motion.p>

      {/* Product grid */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-square w-full rounded-xl" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : productosFiltrados.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground"
        >
          <ShoppingBag className="size-16 opacity-20" />
          <p className="text-lg font-medium">No se encontraron productos</p>
          <p className="text-sm">Probá con otra búsqueda o categoría</p>
        </motion.div>
      ) : (
        <>
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4"
          >
            <AnimatePresence mode="popLayout">
              {productosPagina.map((producto) => {
                const imagen = producto.producto_imagenes?.find(
                  (i) => i.es_principal
                ) ?? producto.producto_imagenes?.[0];
                return (
                  <ProductCard
                    key={producto.id}
                    id={producto.id}
                    nombre={producto.nombre}
                    slug={producto.slug}
                    precio={producto.precio}
                    precioSocio={producto.precio_socio}
                    imagenUrl={imagen?.url}
                    stock={producto.stock_actual}
                    destacado={producto.destacado}
                    categoria={producto.categorias_producto?.nombre}
                    onAddToCart={() => handleAddToCart(producto)}
                  />
                );
              })}
            </AnimatePresence>
          </motion.div>

          {/* Load more */}
          {hasMore && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-8 flex justify-center"
            >
              <Button
                variant="outline"
                size="lg"
                onClick={() => setPage((p) => p + 1)}
              >
                Cargar más productos
                <ChevronDown className="ml-1 size-4" />
              </Button>
            </motion.div>
          )}
        </>
      )}
    </div>
    </>
  );
}
