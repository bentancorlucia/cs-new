"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence, useScroll, useTransform } from "framer-motion";
import {
  Search,
  ShoppingBag,
  ChevronDown,
  ArrowRight,
  ArrowUpRight,
  Sparkles,
  Shirt,
  Tag,
  Star,
  Truck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { MobileCartBar } from "@/components/tienda/mobile-cart-bar";
import { SectionHeader } from "@/components/shared/section-header";
import {
  AnimateOnScroll,
  AnimateStaggerGroup,
} from "@/components/shared/animate-on-scroll";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  staggerContainer,
  fadeInUp,
  springBouncy,
  springSmooth,
} from "@/lib/motion";
import { toast } from "sonner";
import type { Database } from "@/types/database";

type Producto = Database["public"]["Tables"]["productos"]["Row"] & {
  categorias_producto: { nombre: string; slug: string } | null;
  producto_imagenes: {
    url: string;
    es_principal: boolean;
    focal_point: string;
  }[];
};

type Categoria = Database["public"]["Tables"]["categorias_producto"]["Row"];

const ITEMS_PER_PAGE = 12;

interface TiendaClientProps {
  initialProductos?: Producto[];
  initialCategorias?: Categoria[];
}

export function TiendaClient({
  initialProductos = [],
  initialCategorias = [],
}: TiendaClientProps) {
  const [productos, setProductos] = useState<Producto[]>(initialProductos);
  const [categorias, setCategorias] = useState<Categoria[]>(initialCategorias);
  const hasInitialData = initialProductos.length > 0;
  const [loading, setLoading] = useState(!hasInitialData);
  const [search, setSearch] = useState("");
  const [categoriaActiva, setCategoriaActiva] = useState<string>("todas");
  const [orden, setOrden] = useState<string>("nuevos");
  const [page, setPage] = useState(1);
  const { addItem } = useCart();

  // Hero parallax
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroContentY = useTransform(scrollYProgress, [0, 1], [0, -60]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    // Skip client fetch if we already have server-rendered data
    if (hasInitialData) return;

    const supabase = createBrowserClient();

    async function fetchData() {
      const [prodRes, catRes] = await Promise.all([
        supabase
          .from("productos")
          .select(
            "*, categorias_producto(nombre, slug), producto_imagenes(url, es_principal, focal_point)"
          )
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
  }, [hasInitialData]);

  // Featured products (destacados, fallback to any with images)
  const productosDestacados = useMemo(() => {
    const destacados = productos
      .filter((p) => p.destacado && p.stock_actual > 0)
      .slice(0, 6);
    if (destacados.length > 0) return destacados;
    // Fallback: any products that have images
    return productos
      .filter((p) => p.producto_imagenes?.length > 0 && p.stock_actual > 0)
      .slice(0, 6);
  }, [productos]);

  // Products with images for hero grid (need at least 4)
  const heroProducts = useMemo(() => {
    return productos
      .filter((p) => p.producto_imagenes?.some((img) => img.url))
      .slice(0, 6);
  }, [productos]);

  const productosFiltrados = useMemo(() => {
    let result = [...productos];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          p.descripcion_corta?.toLowerCase().includes(q)
      );
    }

    if (categoriaActiva !== "todas") {
      result = result.filter(
        (p) => p.categorias_producto?.slug === categoriaActiva
      );
    }

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
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
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
      const imagen =
        producto.producto_imagenes?.find((i) => i.es_principal) ??
        producto.producto_imagenes?.[0];
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

  // Scroll to catalog
  const catalogRef = useRef<HTMLDivElement>(null);
  function scrollToCatalog() {
    catalogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Navigate to category in catalog
  function handleCategoryClick(slug: string) {
    setCategoriaActiva(slug);
    setPage(1);
    // Small delay to let state update, then scroll
    setTimeout(() => {
      catalogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  return (
    <>
      {/* ============================================ */}
      {/* HERO — Immersive dark bordo section          */}
      {/* ============================================ */}
      <section
        ref={heroRef}
        className="relative -mt-20 min-h-[45vh] sm:h-[105vh] flex items-center overflow-hidden bg-bordo-950 noise-overlay"
      >
        {/* Animated gradient background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-bordo-950 via-bordo-900 to-bordo-950" />
          {/* Decorative gradient orbs */}
          <motion.div
            className="absolute -top-1/4 -right-1/4 w-[60vw] h-[60vw] rounded-full bg-bordo-800/20 blur-[120px]"
            animate={{
              scale: [1, 1.15, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          />
          {/* Yellow light — bottom left */}
          <motion.div
            className="absolute -bottom-1/4 -left-1/4 w-[50vw] h-[50vw] rounded-full bg-dorado-400/40 blur-[100px]"
            animate={{
              scale: [1.1, 1, 1.1],
              opacity: [0.4, 0.7, 0.4],
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 2,
            }}
          />
          {/* Yellow light — top center */}
          <motion.div
            className="absolute -top-[10%] left-1/3 w-[35vw] h-[35vw] rounded-full bg-dorado-300/30 blur-[80px]"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.55, 0.3],
            }}
            transition={{
              duration: 12,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 4,
            }}
          />
          {/* Yellow light — right mid */}
          <motion.div
            className="absolute top-1/3 -right-[10%] w-[30vw] h-[30vw] rounded-full bg-dorado-400/25 blur-[80px]"
            animate={{
              scale: [1.05, 0.95, 1.05],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 9,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1,
            }}
          />
        </div>

        {/* Content */}
        <motion.div
          style={{ y: heroContentY, opacity: heroOpacity }}
          className="relative z-10 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 pt-32 sm:pt-28 pb-16 sm:pb-16"
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-12 items-center">
            {/* Left — Text */}
            <div>
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="inline-flex items-center gap-2 font-heading uppercase tracking-editorial text-xs text-dorado-300 mb-6"
              >
                <span className="w-8 h-px bg-dorado-300/50" />
                Tienda oficial
              </motion.span>

              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.8,
                  delay: 0.2,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="font-display text-title-1 sm:text-display uppercase tracking-wide text-white"
              >
                Vestí los
                <br />
                <span className="text-dorado-300">colores</span> del club
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.7,
                  delay: 0.4,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="mt-5 font-body text-base sm:text-lg text-white/60 max-w-md"
              >
                Indumentaria oficial, accesorios y merchandising de Club
                Seminario. Precios especiales para socios.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.6 }}
                className="mt-8 flex flex-wrap gap-3"
              >
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  transition={springBouncy}
                  onClick={scrollToCatalog}
                  className="inline-flex items-center rounded-full bg-dorado-300 px-7 py-3.5 font-heading text-xs uppercase tracking-editorial text-bordo-950 hover:bg-dorado-200 transition-colors"
                >
                  Ver catálogo
                  <ArrowRight className="ml-2 size-3.5" />
                </motion.button>
                <CartSheet
                  trigger={
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      transition={springBouncy}
                      className="inline-flex items-center gap-2 rounded-full border border-white/20 px-7 py-3.5 font-heading text-xs uppercase tracking-editorial text-white hover:bg-white/10 transition-colors"
                    >
                      <ShoppingBag className="size-4" />
                      Mi carrito
                    </motion.button>
                  }
                />
              </motion.div>
            </div>

            {/* Right — Dynamic product showcase */}
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                duration: 1,
                delay: 0.4,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="relative hidden lg:block"
            >
              {/* 2x2 product grid — all same size, staggered entry */}
              <div className="grid grid-cols-2 gap-3">
                {heroProducts.slice(0, 4).map((producto, i) => {
                  const img =
                    producto.producto_imagenes?.find((im) => im.es_principal) ??
                    producto.producto_imagenes?.[0];
                  return (
                    <motion.div
                      key={producto.id}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.7,
                        delay: 0.5 + i * 0.12,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      className={`relative aspect-[4/5] rounded-2xl overflow-hidden bg-bordo-800/30 ${
                        i % 2 === 1 ? "mt-6" : ""
                      }`}
                    >
                      {img?.url && (
                        <Image
                          src={img.url}
                          alt={producto.nombre}
                          fill
                          className="object-cover"
                          style={{
                            objectPosition: img.focal_point || "50% 50%",
                          }}
                          sizes="(max-width: 1024px) 0vw, 20vw"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-bordo-950/80 via-bordo-950/30 to-bordo-950/60" />
                    </motion.div>
                  );
                })}
              </div>

              {/* Floating feature badges */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 1.2, ...springBouncy }}
                className="absolute top-6 -left-6 z-20 flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md border border-white/10 px-4 py-2 shadow-xl"
              >
                <Star className="size-3.5 text-dorado-300" />
                <span className="font-heading text-[11px] uppercase tracking-editorial text-white/90">
                  Precios socios
                </span>
              </motion.div>


              {/* Animated floating ring decoration */}
              <motion.div
                className="absolute -bottom-8 -right-8 size-32 rounded-full border border-dorado-300/20"
                animate={{ rotate: 360 }}
                transition={{
                  duration: 20,
                  repeat: Infinity,
                  ease: "linear",
                }}
              >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 size-3 rounded-full bg-dorado-300/40" />
              </motion.div>
            </motion.div>
          </div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.5 }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{
              duration: 1.8,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <ChevronDown className="size-6 text-white/30" />
          </motion.div>
        </motion.div>
      </section>

      {/* Decorative border */}
      <div className="h-[3px] bg-bordo-800" />
      <div className="h-[2px] bg-dorado-400" />

      {/* ============================================ */}
      {/* CATEGORIES — Sport-card style grid            */}
      {/* ============================================ */}
      <section className="py-16 sm:py-24 bg-gradient-to-b from-bordo-800/[0.03] via-fondo to-fondo">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Categorías"
            title="Explorá por categoría"
            description="Encontrá lo que buscás navegando nuestras colecciones"
          />

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="aspect-[3/4] w-full rounded-xl"
                />
              ))}
            </div>
          ) : (
            <AnimateStaggerGroup className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {categorias.map((cat) => {
                // Count products per category
                const catProducts = productos.filter(
                  (p) => p.categorias_producto?.slug === cat.slug
                );
                const count = catProducts.length;

                // Use a product image from this category
                const catProductImg = (() => {
                  for (const p of catProducts) {
                    const img =
                      p.producto_imagenes?.find((i) => i.es_principal) ??
                      p.producto_imagenes?.[0];
                    if (img?.url) return img;
                  }
                  return null;
                })();

                return (
                  <motion.div
                    key={cat.id}
                    variants={fadeInUp}
                    transition={{
                      duration: 0.6,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  >
                    <button
                      onClick={() => handleCategoryClick(cat.slug)}
                      className="group block relative aspect-[3/4] w-full overflow-hidden text-left"
                    >
                      {/* Image — use product photo from this category */}
                      <motion.div
                        className="absolute inset-0"
                        whileHover={{ scale: 1.06 }}
                        transition={{
                          duration: 0.5,
                          ease: [0.16, 1, 0.3, 1],
                        }}
                      >
                        {catProductImg?.url ? (
                          <Image
                            src={catProductImg.url}
                            alt={cat.nombre}
                            fill
                            className="object-cover"
                            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                            style={{
                              objectPosition:
                                catProductImg.focal_point || "50% 50%",
                            }}
                          />
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-bordo-800 to-bordo-950" />
                        )}
                      </motion.div>

                      {/* Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-bordo-950 via-bordo-950/85 to-bordo-950/70 group-hover:via-bordo-950/75 group-hover:to-bordo-950/55 transition-all duration-500" />

                      {/* Content */}
                      <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-6">
                        <h3 className="font-display text-title-2 uppercase tracking-tightest text-white group-hover:-translate-y-1 transition-transform duration-300">
                          {cat.nombre}
                        </h3>
                        <p className="mt-1 font-body text-sm text-white/50">
                          {count} producto{count !== 1 ? "s" : ""}
                        </p>
                      </div>

                      {/* Arrow badge */}
                      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <div className="size-8 rounded-full bg-dorado-300 flex items-center justify-center">
                          <ArrowUpRight className="size-4 text-bordo-950" />
                        </div>
                      </div>
                    </button>
                  </motion.div>
                );
              })}

              {/* "Ver todo" card */}
              <motion.div
                variants={fadeInUp}
                transition={{
                  duration: 0.6,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <button
                  onClick={() => handleCategoryClick("todas")}
                  className="group relative aspect-[3/4] w-full overflow-hidden flex flex-col items-center justify-center gap-3 border-2 border-dashed border-bordo-800/20 rounded-sm hover:border-bordo-800/40 bg-superficie/50 hover:bg-superficie transition-all duration-300"
                >
                  <motion.div
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    transition={springSmooth}
                    className="size-12 rounded-full border-2 border-bordo-800/20 flex items-center justify-center group-hover:border-bordo-800/40 group-hover:bg-bordo-800/5 transition-colors"
                  >
                    <ArrowRight className="size-5 text-bordo-800/60 group-hover:text-bordo-800 transition-colors" />
                  </motion.div>
                  <span className="font-heading uppercase tracking-editorial text-xs text-bordo-800/60 group-hover:text-bordo-800 transition-colors">
                    Ver todo
                  </span>
                  <span className="font-body text-sm text-muted-foreground">
                    {productos.length} productos
                  </span>
                </button>
              </motion.div>
            </AnimateStaggerGroup>
          )}
        </div>
      </section>

      {/* ============================================ */}
      {/* FEATURED — Horizontal scroll of destacados   */}
      {/* ============================================ */}
      {productosDestacados.length > 0 && (
        <section className="py-16 sm:py-20 bg-white border-y border-linea">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between mb-10">
              <AnimateOnScroll variant="fadeInUp">
                <span className="font-heading uppercase tracking-editorial text-xs text-bordo-800 block mb-3">
                  Destacados
                </span>
                <h2 className="font-display text-title-2 sm:text-title-1 uppercase tracking-tightest text-foreground">
                  Lo más buscado
                </h2>
              </AnimateOnScroll>
              <AnimateOnScroll variant="fadeInUp" delay={0.1}>
                <button
                  onClick={scrollToCatalog}
                  className="hidden sm:inline-flex items-center gap-1.5 font-heading uppercase tracking-editorial text-xs text-bordo-800 hover:text-bordo-900 transition-colors group"
                >
                  Ver catálogo completo
                  <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </AnimateOnScroll>
            </div>
          </div>

          {/* Horizontal scroll container */}
          <div className="relative">
            <div className="flex gap-4 overflow-x-auto px-4 sm:px-[max(1rem,calc((100vw-80rem)/2+1rem))] pb-4 scrollbar-hide snap-x snap-mandatory">
              {productosDestacados.map((producto, i) => {
                const imagen =
                  producto.producto_imagenes?.find(
                    (img) => img.es_principal
                  ) ?? producto.producto_imagenes?.[0];
                return (
                  <motion.div
                    key={producto.id}
                    initial={{ opacity: 0, x: 40 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: "-20px" }}
                    transition={{
                      duration: 0.6,
                      delay: i * 0.08,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="w-[260px] sm:w-[300px] flex-shrink-0 snap-start"
                  >
                    <ProductCard
                      id={producto.id}
                      nombre={producto.nombre}
                      slug={producto.slug}
                      precio={producto.precio}
                      precioSocio={producto.precio_socio}
                      imagenUrl={imagen?.url}
                      imagenFocalPoint={imagen?.focal_point}
                      stock={producto.stock_actual}
                      destacado={producto.destacado}
                      categoria={producto.categorias_producto?.nombre}
                      onAddToCart={() => handleAddToCart(producto)}
                    />
                  </motion.div>
                );
              })}
            </div>
            {/* Fade edges */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent" />
          </div>
        </section>
      )}

      {/* ============================================ */}
      {/* CATALOG — Full product grid with filters     */}
      {/* ============================================ */}
      <section
        ref={catalogRef}
        className="py-16 sm:py-24 bg-fondo scroll-mt-20"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Catálogo"
            title="Todos los productos"
          />

          {/* Filters bar */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
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
            <Select
              value={orden}
              onValueChange={(v) => {
                if (v) {
                  setOrden(v);
                  setPage(1);
                }
              }}
            >
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

          {/* Category pills */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mb-6 flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
          >
            <button
              onClick={() => {
                setCategoriaActiva("todas");
                setPage(1);
              }}
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
                onClick={() => {
                  setCategoriaActiva(cat.slug);
                  setPage(1);
                }}
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
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
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
                  <Skeleton className="aspect-[4/5] w-full rounded-xl" />
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
              <p className="text-lg font-medium">
                No se encontraron productos
              </p>
              <p className="text-sm">
                Probá con otra búsqueda o categoría
              </p>
            </motion.div>
          ) : (
            <>
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-40px" }}
                className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4"
              >
                <AnimatePresence mode="popLayout">
                  {productosPagina.map((producto) => {
                    const imagen =
                      producto.producto_imagenes?.find(
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
                        imagenFocalPoint={imagen?.focal_point}
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
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
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
      </section>

      {/* Mobile sticky cart bar */}
      <MobileCartBar />
    </>
  );
}
