"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  Search,
  ShoppingBag,
  ChevronDown,
  ArrowRight,
  ArrowUpRight,
  ArrowDownUp,
} from "lucide-react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/components/tienda/product-card";
import { useCart } from "@/hooks/use-cart";
import { CartSheet } from "@/components/tienda/cart-sheet";
import { MobileCartBar } from "@/components/tienda/mobile-cart-bar";
import {
  AnimateOnScroll,
} from "@/components/shared/animate-on-scroll";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  staggerContainer,
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

  // Featured products
  const productosDestacados = useMemo(() => {
    const destacados = productos
      .filter((p) => p.destacado && p.stock_actual > 0)
      .slice(0, 6);
    if (destacados.length > 0) return destacados;
    return productos
      .filter((p) => p.producto_imagenes?.length > 0 && p.stock_actual > 0)
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
    setTimeout(() => {
      catalogRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  return (
    <>
      {/* ============================================ */}
      {/* HERO — Solid bordó, full page                */}
      {/* ============================================ */}
      <section
        ref={heroRef}
        className="relative -mt-20 min-h-[55vh] md:min-h-screen flex flex-col justify-end md:justify-center overflow-hidden bg-bordo-800 noise-overlay"
      >
        {/* Animated gradient orbs — strong gold glow bottom-right like preview */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Large gold glow — bottom right */}
          <motion.div
            className="absolute -bottom-[20%] -right-[10%] w-[70vw] h-[70vw] rounded-full blur-[120px]"
            style={{ backgroundColor: "#f7b643" }}
            animate={{
              scale: [1, 1.08, 1],
              opacity: [0.45, 0.55, 0.45],
            }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          />
          {/* Dark bordo shadow — top left to add depth */}
          <motion.div
            className="absolute -top-[20%] -left-[10%] w-[60vw] h-[60vw] rounded-full blur-[120px]"
            style={{ backgroundColor: "#3a0417" }}
            animate={{
              scale: [1.1, 1, 1.1],
              opacity: [0.7, 0.9, 0.7],
            }}
            transition={{
              duration: 12,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 2,
            }}
          />
          {/* Smaller gold accent — top right */}
          <motion.div
            className="absolute top-[10%] right-[5%] w-[30vw] h-[30vw] rounded-full blur-[100px]"
            style={{ backgroundColor: "#f7b643" }}
            animate={{
              scale: [1, 1.15, 1],
              opacity: [0.15, 0.3, 0.15],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 4,
            }}
          />
        </div>

        {/* Content */}
        <motion.div
          style={{ y: heroContentY, opacity: heroOpacity }}
          className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12 md:pt-32 md:pb-16 text-left flex flex-col items-start justify-end md:justify-center"
        >
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.8,
              delay: 0.1,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="font-display text-[clamp(2.5rem,10vw,7rem)] uppercase leading-[0.92] tracking-[0.05em] text-white max-w-5xl"
          >
            Vestí los colores del <em>club</em>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.7,
              delay: 0.3,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="mt-3 md:mt-5 max-w-xl font-body text-sm md:text-lg text-white/80 leading-relaxed"
          >
            Indumentaria oficial, accesorios y merchandising de Club
            Seminario. Precios especiales para socios.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="mt-6 md:mt-8 flex flex-col sm:flex-row gap-3 w-full sm:w-auto"
          >
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={springBouncy}
              onClick={scrollToCatalog}
              className="inline-flex items-center justify-center bg-dorado-300 px-6 py-3 font-heading text-[11px] uppercase tracking-editorial text-bordo-950 hover:bg-dorado-200 transition-colors"
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
                  className="hidden sm:inline-flex items-center gap-2 border border-dorado-300/30 bg-bordo-900/30 px-6 py-3 font-heading text-[11px] uppercase tracking-editorial text-dorado-300 hover:bg-dorado-300/10 transition-colors backdrop-blur-sm"
                >
                  <ShoppingBag className="size-4" />
                  Mi carrito
                </motion.button>
              }
            />
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.5 }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 hidden md:block"
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

      {/* ============================================ */}
      {/* MARQUEE — Scrolling banner                   */}
      {/* ============================================ */}
      {/* Bar — Text — Bar */}
      <div className="h-[3px] bg-dorado-400" />
      <div className="w-full bg-bordo-800 overflow-hidden py-3">
        <motion.div
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="flex whitespace-nowrap"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center">
              <span className="font-display text-sm font-bold tracking-wide uppercase text-dorado-300">Club Seminario</span>
              <span className="mx-6 text-dorado-300/60">—</span>
              <span className="font-display text-sm font-bold tracking-wide uppercase text-dorado-300">Tienda Oficial</span>
              <span className="mx-6 text-dorado-300/60">—</span>
              <span className="font-display text-sm font-bold tracking-wide uppercase text-dorado-300">Precios Exclusivos Para Socios</span>
              <span className="mx-6 text-dorado-300/60">—</span>
            </div>
          ))}
        </motion.div>
      </div>
      <div className="h-[3px] bg-dorado-400" />

      {/* ============================================ */}
      {/* CATEGORIES — Bento grid (asymmetric)         */}
      {/* ============================================ */}
      <section className="py-16 sm:py-24 bg-fondo">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-8">
            <AnimateOnScroll variant="fadeInUp">
              <h2 className="font-display text-title-1 sm:text-display uppercase tracking-tightest text-bordo-950">
                Colecciones
              </h2>
            </AnimateOnScroll>
            <AnimateOnScroll variant="fadeInUp" delay={0.1}>
              <button
                onClick={() => handleCategoryClick("todas")}
                className="hidden md:inline-flex items-center gap-1.5 font-heading uppercase tracking-editorial text-xs text-bordo-800 hover:text-bordo-900 transition-colors group"
              >
                Ver todas
                <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </AnimateOnScroll>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 auto-rows-[300px] md:auto-rows-[400px]">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton
                  key={i}
                  className="w-full h-full rounded-sm"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-[2px] md:gap-4 auto-rows-[180px] sm:auto-rows-[300px] md:auto-rows-[400px]">
              {(() => {
                // Sort categories so the large one comes first for proper mosaic layout
                const maxCount = Math.max(
                  ...categorias.map(
                    (c) => productos.filter((p) => p.categorias_producto?.slug === c.slug).length
                  )
                );
                const largeIdx = categorias.findIndex((c) =>
                  productos.filter((p) => p.categorias_producto?.slug === c.slug).length === maxCount && maxCount > 0
                );
                const sorted = largeIdx > 0
                  ? [categorias[largeIdx], ...categorias.filter((_, i) => i !== largeIdx)]
                  : [...categorias];

                return sorted.map((cat, idx) => {
                const catProducts = productos.filter(
                  (p) => p.categorias_producto?.slug === cat.slug
                );
                const count = catProducts.length;
                const catProductImg = (() => {
                  for (const p of catProducts) {
                    const img =
                      p.producto_imagenes?.find((i) => i.es_principal) ??
                      p.producto_imagenes?.[0];
                    if (img?.url) return img;
                  }
                  return null;
                })();

                const isLarge = count === maxCount && count > 0 && idx === 0;

                return (
                  <motion.button
                    key={cat.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{
                      duration: 0.6,
                      delay: idx * 0.08,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    onClick={() => handleCategoryClick(cat.slug)}
                    className={`group relative w-full h-full overflow-hidden text-left ${
                      isLarge
                        ? "md:col-span-2 lg:col-span-2 md:row-span-2"
                        : ""
                    }`}
                  >
                    {/* Image */}
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
                          sizes={
                            isLarge
                              ? "(max-width: 768px) 100vw, 50vw"
                              : "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                          }
                          style={{
                            objectPosition:
                              catProductImg.focal_point || "50% 50%",
                          }}
                        />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-bordo-800 to-bordo-950" />
                      )}
                    </motion.div>

                    {/* Warm tint overlay */}
                    <div className="absolute inset-0 bg-bordo-950/20 mix-blend-multiply" />

                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-bordo-950/95 via-bordo-950/40 to-transparent group-hover:from-bordo-800/95 group-hover:via-bordo-800/50 transition-all duration-500" />

                    {/* Content */}
                    <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-6 z-10">
                      <span className="font-heading uppercase tracking-editorial text-[10px] text-dorado-300 mb-1">
                        {count} producto{count !== 1 ? "s" : ""}
                      </span>
                      <h3
                        className={`font-display uppercase tracking-tightest text-white group-hover:-translate-y-1 transition-transform duration-300 ${
                          isLarge
                            ? "text-title-1 sm:text-display"
                            : "text-title-2 sm:text-title-1"
                        }`}
                      >
                        {cat.nombre}
                      </h3>
                    </div>

                    {/* Arrow badge */}
                    <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
                      <div className="size-8 rounded-full bg-dorado-300 flex items-center justify-center">
                        <ArrowUpRight className="size-4 text-bordo-950" />
                      </div>
                    </div>
                  </motion.button>
                );
              });
              })()}

              {/* "Ver todo" card — hidden on mobile */}
              <motion.button
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{
                  duration: 0.6,
                  delay: categorias.length * 0.08,
                  ease: [0.16, 1, 0.3, 1],
                }}
                onClick={() => handleCategoryClick("todas")}
                className="flex sm:hidden group relative w-full h-full overflow-hidden flex-col items-center justify-center gap-3 border-2 border-dashed border-bordo-800/20 hover:border-bordo-800/40 bg-superficie/50 hover:bg-superficie transition-all duration-300"
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
                <span className="font-body text-sm text-bordo-800/40">
                  {productos.length} productos
                </span>
              </motion.button>
            </div>
          )}
        </div>
      </section>

      {/* ============================================ */}
      {/* FEATURED — Horizontal scroll carousel        */}
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
                    className="w-[80vw] sm:w-[300px] flex-shrink-0 snap-start"
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
          <AnimateOnScroll variant="fadeInUp">
            <h2 className="font-display text-title-2 sm:text-title-1 uppercase tracking-tightest text-bordo-950 mb-8">
              Todos los productos
            </h2>
          </AnimateOnScroll>

          {/* Filters bar — sticky on mobile */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sticky top-0 z-40 bg-fondo/95 backdrop-blur-md -mx-4 px-4 py-3 sm:static sm:mx-0 sm:px-0 sm:py-0 sm:bg-transparent sm:backdrop-blur-none border-b border-linea sm:border-0"
          >
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-bordo-800/40" />
              <Input
                placeholder="Buscar productos..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Sort pills */}
            <div className="flex items-center gap-1.5 shrink-0">
              <ArrowDownUp className="size-3.5 text-bordo-800/40 hidden sm:block" />
              {([
                { key: "nuevos", label: "Más nuevos" },
                { key: "precio-asc", label: "Menor precio" },
                { key: "precio-desc", label: "Mayor precio" },
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => {
                    setOrden(opt.key);
                    setPage(1);
                  }}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                    orden === opt.key
                      ? "border-bordo-800 bg-bordo-800 text-white shadow-sm"
                      : "border-bordo-800/20 bg-bordo-800/5 text-bordo-800 hover:border-bordo-800/40"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
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
                  : "border-bordo-800/20 bg-bordo-800/5 text-bordo-800 hover:border-bordo-800/40 shadow-sm"
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
                    : "border-bordo-800/20 bg-bordo-800/5 text-bordo-800 hover:border-bordo-800/40 shadow-sm"
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
            className="mb-4 text-sm text-bordo-800/60"
          >
            {productosFiltrados.length} producto
            {productosFiltrados.length !== 1 ? "s" : ""}
            {search && ` para "${search}"`}
          </motion.p>

          {/* Product grid */}
          {loading ? (
            <div className="grid grid-cols-2 gap-[2px] md:gap-4 md:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="aspect-[4/5] w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))}
            </div>
          ) : productosFiltrados.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center gap-3 py-20 text-bordo-800/40"
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
                key={`${categoriaActiva}-${orden}-${search}`}
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-2 gap-[2px] md:gap-4 md:grid-cols-3 lg:grid-cols-4"
              >
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
                    className="border-bordo-800/20 text-bordo-800 hover:bg-bordo-800 hover:text-white"
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
