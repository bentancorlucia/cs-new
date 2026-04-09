"use client";

import { useState, useRef, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence, useMotionValue } from "framer-motion";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Minus,
  Plus,
  ShoppingCart,
  Check,
  Package,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/tienda/product-card";
import { useCart } from "@/hooks/use-cart";
import {
  fadeInUp,
  fadeInLeft,
  fadeInRight,
  staggerContainer,
  springSmooth,
  springBouncy,
} from "@/lib/motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ProductoImagen {
  id: number;
  url: string;
  alt_text: string | null;
  orden: number;
  es_principal: boolean;
  focal_point: string;
}

interface ProductoVariante {
  id: number;
  nombre: string;
  sku: string | null;
  precio_override: number | null;
  stock_actual: number;
  atributos: Record<string, string>;
  activo: boolean;
}

interface Producto {
  id: number;
  nombre: string;
  slug: string;
  descripcion: string | null;
  descripcion_corta: string | null;
  precio: number;
  precio_socio: number | null;
  stock_actual: number;
  categorias_producto: { id: number; nombre: string; slug: string } | null;
  producto_imagenes: ProductoImagen[];
  producto_variantes: ProductoVariante[];
}

interface RelacionadoSimple {
  id: number;
  nombre: string;
  slug: string;
  precio: number;
  precio_socio: number | null;
  stock_actual: number;
  destacado: boolean;
  producto_imagenes: { url: string; es_principal: boolean; focal_point: string }[];
}

interface StockReservado {
  producto: number;
  variantes: Record<number, number>;
}

interface Props {
  producto: Producto;
  relacionados: RelacionadoSimple[];
  stockReservado: StockReservado;
}

export function ProductoDetalleClient({ producto, relacionados, stockReservado }: Props) {
  const imagenes = [...producto.producto_imagenes].sort((a, b) => a.orden - b.orden);
  const variantes = producto.producto_variantes?.filter((v) => v.activo) ?? [];
  const tieneVariantes = variantes.length > 0;

  const [imagenActiva, setImagenActiva] = useState(0);
  const [cantidad, setCantidad] = useState(1);
  const [added, setAdded] = useState(false);
  const [failedImgs, setFailedImgs] = useState<Set<number>>(new Set());
  const { addItem } = useCart();

  // Swipe gesture for mobile gallery
  const dragX = useMotionValue(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- Attribute-aware variant selection ---
  // Detect attribute dimensions (e.g. "color", "talle") from variant data
  const atributoKeys = useMemo(() => {
    const keySets = variantes.map((v) => Object.keys(v.atributos || {}));
    if (keySets.length === 0) return [];
    // Use keys that appear in ALL variants
    const allKeys = keySets[0].filter((k) =>
      keySets.every((ks) => ks.includes(k))
    );
    return allKeys;
  }, [variantes]);

  const esMultiAtributo = atributoKeys.length >= 2;

  // Unique values per attribute key, preserving order of appearance
  const valoresPorAtributo = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const key of atributoKeys) {
      const seen = new Set<string>();
      const values: string[] = [];
      for (const v of variantes) {
        const val = v.atributos[key];
        if (val && !seen.has(val)) {
          seen.add(val);
          values.push(val);
        }
      }
      map[key] = values;
    }
    return map;
  }, [atributoKeys, variantes]);

  // State: selected value per attribute key (for multi-attribute mode)
  const [seleccionAtributos, setSeleccionAtributos] = useState<Record<string, string>>(() => {
    if (!esMultiAtributo || variantes.length === 0) return {};
    const initial: Record<string, string> = {};
    for (const key of atributoKeys) {
      initial[key] = variantes[0]?.atributos[key] ?? "";
    }
    return initial;
  });

  // State: direct variant id selection (for single-attribute / fallback mode)
  const [varianteSeleccionada, setVarianteSeleccionada] = useState<number | null>(
    tieneVariantes ? variantes[0]?.id ?? null : null
  );

  // Resolve the actual selected variant
  const varianteActual = useMemo(() => {
    if (!tieneVariantes) return null;
    if (esMultiAtributo) {
      // Find the variant matching all selected attributes
      return (
        variantes.find((v) =>
          atributoKeys.every((k) => v.atributos[k] === seleccionAtributos[k])
        ) ?? null
      );
    }
    return variantes.find((v) => v.id === varianteSeleccionada) ?? null;
  }, [tieneVariantes, esMultiAtributo, variantes, atributoKeys, seleccionAtributos, varianteSeleccionada]);

  // For multi-attribute: check if a specific value for an attribute has any
  // in-stock variant given the other selected attributes
  function isAtributoValueAvailable(key: string, value: string): boolean {
    return variantes.some((v) => {
      if (v.atributos[key] !== value) return false;
      // Check other selected attributes match
      return atributoKeys.every(
        (k) => k === key || v.atributos[k] === seleccionAtributos[k]
      );
    });
  }

  function getStockDisponible(variante: ProductoVariante): number {
    const reservado = stockReservado.variantes[variante.id] || 0;
    return Math.max(0, variante.stock_actual - reservado);
  }

  function getStockForAtributoValue(key: string, value: string): number {
    const match = variantes.find((v) => {
      if (v.atributos[key] !== value) return false;
      return atributoKeys.every(
        (k) => k === key || v.atributos[k] === seleccionAtributos[k]
      );
    });
    if (!match) return 0;
    return getStockDisponible(match);
  }

  const precioActual = varianteActual?.precio_override ?? producto.precio;
  const stockActual = varianteActual
    ? getStockDisponible(varianteActual)
    : Math.max(0, producto.stock_actual - stockReservado.producto);
  const agotado = stockActual <= 0;

  const tieneDescuento =
    producto.precio_socio != null && producto.precio_socio < precioActual;

  function handleAddToCart() {
    const imagen = imagenes.find((i) => i.es_principal) ?? imagenes[0];
    addItem(
      {
        productoId: producto.id,
        varianteId: varianteActual?.id,
        nombre: varianteActual
          ? `${producto.nombre} - ${varianteActual.nombre}`
          : producto.nombre,
        precio: precioActual,
        precioSocio: producto.precio_socio ?? undefined,
        imagenUrl: imagen?.url ?? "",
        maxStock: stockActual,
        slug: producto.slug,
      },
      cantidad
    );
    setAdded(true);
    toast.success("Agregado al carrito", {
      description: `${cantidad}x ${producto.nombre}`,
    });
    setTimeout(() => setAdded(false), 2000);
  }

  function nextImage() {
    setImagenActiva((prev) => (prev + 1) % imagenes.length);
  }
  function prevImage() {
    setImagenActiva((prev) => (prev - 1 + imagenes.length) % imagenes.length);
  }

  function handleDragEnd(_: unknown, info: { offset: { x: number }; velocity: { x: number } }) {
    const threshold = 50;
    const velocity = info.velocity.x;
    const offset = info.offset.x;

    if (offset < -threshold || velocity < -500) {
      nextImage();
    } else if (offset > threshold || velocity > 500) {
      prevImage();
    }
  }

  return (
    <>
      {/* ============================================ */}
      {/* MARQUEE — Scrolling banner                   */}
      {/* ============================================ */}
      <div className="-mt-20 pt-20">
      <div className="h-[3px] bg-dorado-400" />
      <div className="w-full bg-bordo-800 overflow-hidden py-2.5">
        <motion.div
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="flex whitespace-nowrap"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center">
              <span className="font-display text-sm font-bold tracking-wide uppercase text-dorado-300">
                Club Seminario
              </span>
              <span className="mx-6 text-dorado-300/60">&mdash;</span>
              <span className="font-display text-sm font-bold tracking-wide uppercase text-dorado-300">
                Tienda Oficial
              </span>
              <span className="mx-6 text-dorado-300/60">&mdash;</span>
              <span className="font-display text-sm font-bold tracking-wide uppercase text-dorado-300">
                Precios Exclusivos Para Socios
              </span>
              <span className="mx-6 text-dorado-300/60">&mdash;</span>
            </div>
          ))}
        </motion.div>
      </div>
      <div className="h-[3px] bg-dorado-400" />
      </div>

      {/* ============================================ */}
      {/* MAIN PRODUCT                                 */}
      {/* ============================================ */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 lg:py-12 pb-32 md:pb-8">
        {/* Breadcrumb */}
        <motion.nav
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-8 lg:mb-12 flex items-center gap-2 text-[11px] font-heading font-semibold tracking-editorial uppercase text-bordo-800/40"
        >
          <Link href="/tienda" className="hover:text-bordo-800 transition-colors flex items-center gap-1">
            <ArrowLeft className="size-3" />
            Tienda
          </Link>
          {producto.categorias_producto && (
            <>
              <span>/</span>
              <span className="text-bordo-800">{producto.categorias_producto.nombre}</span>
            </>
          )}
        </motion.nav>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16">
          {/* ============================================ */}
          {/* LEFT: IMAGE GALLERY                          */}
          {/* ============================================ */}
          <motion.div
            variants={fadeInLeft}
            initial="hidden"
            animate="visible"
            transition={springSmooth}
            className="lg:col-span-7 flex flex-col gap-4"
          >
            {/* Main image */}
            <div
              ref={containerRef}
              className="relative w-full aspect-[4/5] overflow-hidden bg-superficie group"
            >
              <AnimatePresence mode="wait" initial={false}>
                {imagenes.length > 0 ? (
                  <motion.div
                    key={imagenActiva}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    drag={imagenes.length > 1 ? "x" : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.15}
                    onDragEnd={handleDragEnd}
                    style={{ x: dragX }}
                    className="relative h-full w-full cursor-grab active:cursor-grabbing touch-pan-y"
                  >
                    {failedImgs.has(imagenActiva) ? (
                      <div className="flex h-full items-center justify-center">
                        <Package className="size-16 text-bordo-800/10" />
                      </div>
                    ) : (
                      <Image
                        src={imagenes[imagenActiva].url}
                        alt={imagenes[imagenActiva].alt_text || producto.nombre}
                        fill
                        className="pointer-events-none object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                        style={{ objectPosition: imagenes[imagenActiva].focal_point || "50% 50%" }}
                        sizes="(max-width: 1024px) 100vw, 58vw"
                        priority
                        onError={() => setFailedImgs((prev) => new Set(prev).add(imagenActiva))}
                      />
                    )}
                  </motion.div>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Package className="size-24 text-bordo-800/10" />
                  </div>
                )}
              </AnimatePresence>

              {/* Nav arrows — desktop only */}
              {imagenes.length > 1 && (
                <>
                  <button
                    onClick={prevImage}
                    className="absolute left-4 top-1/2 -translate-y-1/2 size-10 bg-white/80 backdrop-blur-sm shadow-md flex items-center justify-center transition hover:bg-white hidden md:flex"
                  >
                    <ChevronLeft className="size-5 text-bordo-950" />
                  </button>
                  <button
                    onClick={nextImage}
                    className="absolute right-4 top-1/2 -translate-y-1/2 size-10 bg-white/80 backdrop-blur-sm shadow-md flex items-center justify-center transition hover:bg-white hidden md:flex"
                  >
                    <ChevronRight className="size-5 text-bordo-950" />
                  </button>
                </>
              )}

              {/* Dot indicators for mobile */}
              {imagenes.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 md:hidden">
                  {imagenes.map((_, i) => (
                    <motion.button
                      key={i}
                      onClick={() => setImagenActiva(i)}
                      animate={{
                        width: i === imagenActiva ? 20 : 8,
                        backgroundColor: i === imagenActiva ? "#730d32" : "rgba(255,255,255,0.7)",
                      }}
                      transition={springSmooth}
                      className="h-2 rounded-full shadow-sm"
                    />
                  ))}
                </div>
              )}

              {/* Agotado overlay */}
              {agotado && (
                <div className="absolute inset-0 bg-superficie/60 z-10 flex items-center justify-center backdrop-blur-[1px]">
                  <span
                    className="bg-bordo-800 text-dorado-300 px-4 py-1.5 font-display text-sm uppercase tracking-widest -rotate-12 border border-dorado-300/30"
                  >
                    Agotado
                  </span>
                </div>
              )}
            </div>

            {/* Thumbnails */}
            {imagenes.length > 1 && (
              <div className="grid grid-cols-4 gap-3">
                {imagenes.map((img, i) => (
                  <button
                    key={img.id}
                    onClick={() => setImagenActiva(i)}
                    className={cn(
                      "relative w-full aspect-[4/5] overflow-hidden border-2 transition-all duration-200",
                      i === imagenActiva
                        ? "border-bordo-800 opacity-100"
                        : "border-transparent opacity-50 hover:opacity-80"
                    )}
                  >
                    {failedImgs.has(i) ? (
                      <div className="flex h-full items-center justify-center bg-superficie">
                        <Package className="size-4 text-bordo-800/20" />
                      </div>
                    ) : (
                      <Image
                        src={img.url}
                        alt={img.alt_text || ""}
                        fill
                        className="object-cover"
                        style={{ objectPosition: img.focal_point || "50% 50%" }}
                        sizes="(max-width: 640px) 25vw, 120px"
                        onError={() => setFailedImgs((prev) => new Set(prev).add(i))}
                      />
                    )}
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          {/* ============================================ */}
          {/* RIGHT: PRODUCT INFO (sticky on desktop)      */}
          {/* ============================================ */}
          <motion.div
            variants={fadeInRight}
            initial="hidden"
            animate="visible"
            transition={springSmooth}
            className="lg:col-span-5 relative"
          >
            <div className="lg:sticky lg:top-28 flex flex-col gap-6 pb-12">
              {/* Header */}
              <div className="flex flex-col gap-2 border-b border-bordo-800/10 pb-6">
                {producto.categorias_producto && (
                  <span className="text-bordo-800 tracking-editorial font-heading font-semibold text-[10px] uppercase">
                    {producto.categorias_producto.nombre}
                  </span>
                )}
                <h1 className="font-display text-title-1 lg:text-display font-bold uppercase text-bordo-950 leading-[0.95] tracking-tightest">
                  {producto.nombre}
                </h1>
                {producto.descripcion_corta && (
                  <p className="text-bordo-950/60 text-sm mt-2 leading-relaxed max-w-sm">
                    {producto.descripcion_corta}
                  </p>
                )}
              </div>

              {/* Pricing */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-4">
                  <span
                    className={cn(
                      "font-display tracking-tight",
                      tieneDescuento
                        ? "text-2xl text-bordo-950/40 line-through decoration-1"
                        : "text-4xl text-bordo-950 font-medium"
                    )}
                  >
                    ${precioActual.toLocaleString("es-UY")}
                  </span>
                  {tieneDescuento && (
                    <span className="text-4xl font-display text-bordo-800 font-medium tracking-tight">
                      ${producto.precio_socio!.toLocaleString("es-UY")}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {tieneDescuento && (
                    <span className="inline-flex items-center gap-1.5 bg-bordo-800 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-dorado-300 shadow-sm">
                      Precio Socio
                    </span>
                  )}
                  {agotado ? (
                    <div className="flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                      </span>
                      <span className="text-xs font-semibold text-red-600 uppercase tracking-wider">
                        Sin stock
                      </span>
                    </div>
                  ) : stockActual <= 5 ? (
                    <div className="flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                      </span>
                      <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider">
                        Quedan {stockActual}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                      </span>
                      <span className="text-xs font-semibold text-bordo-800/70 uppercase tracking-wider">
                        En stock
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Variants */}
              {tieneVariantes && esMultiAtributo ? (
                /* Multi-attribute mode: separate selector per dimension */
                <div className="flex flex-col gap-5 mt-2">
                  {atributoKeys.map((key) => (
                    <div key={key} className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-widest text-bordo-950">
                          {key}
                        </span>
                        <span className="text-xs text-bordo-800/50">
                          {seleccionAtributos[key]}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {valoresPorAtributo[key]?.map((val) => {
                          const selected = seleccionAtributos[key] === val;
                          const available = isAtributoValueAvailable(key, val);
                          const stock = getStockForAtributoValue(key, val);
                          return (
                            <motion.button
                              key={val}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => {
                                setSeleccionAtributos((prev) => ({
                                  ...prev,
                                  [key]: val,
                                }));
                                setCantidad(1);
                              }}
                              disabled={!available || stock <= 0}
                              className={cn(
                                "h-11 border px-4 text-sm font-bold transition-all min-w-[44px]",
                                selected
                                  ? "border-bordo-800 bg-bordo-800 text-white shadow-md shadow-bordo-800/20"
                                  : "border-bordo-800/20 text-bordo-950 hover:border-bordo-800 hover:bg-bordo-800/5",
                                (!available || stock <= 0) &&
                                  "opacity-40 line-through cursor-not-allowed"
                              )}
                            >
                              {val}
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : tieneVariantes ? (
                /* Single-attribute / fallback: flat list */
                <div className="flex flex-col gap-3 mt-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-bordo-950">
                    Variante
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {variantes.map((v) => (
                      <motion.button
                        key={v.id}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          setVarianteSeleccionada(v.id);
                          setCantidad(1);
                        }}
                        disabled={v.stock_actual <= 0}
                        className={cn(
                          "h-11 border px-4 text-sm font-bold transition-all min-w-[44px]",
                          varianteSeleccionada === v.id
                            ? "border-bordo-800 bg-bordo-800 text-white shadow-md shadow-bordo-800/20"
                            : "border-bordo-800/20 text-bordo-950 hover:border-bordo-800 hover:bg-bordo-800/5",
                          v.stock_actual <= 0 && "opacity-40 line-through cursor-not-allowed"
                        )}
                      >
                        {v.nombre}
                      </motion.button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Quantity + Add to cart — desktop */}
              <div className="hidden md:flex flex-col sm:flex-row gap-3 mt-4">
                {/* Quantity */}
                <div className="flex items-center border border-bordo-800/20 bg-superficie h-14 w-32 justify-between px-1">
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() => setCantidad((q) => Math.max(1, q - 1))}
                    disabled={cantidad <= 1}
                    className="flex size-10 items-center justify-center text-bordo-800 hover:bg-bordo-800/10 transition-colors disabled:opacity-30"
                  >
                    <Minus className="size-4" />
                  </motion.button>
                  <motion.span
                    key={cantidad}
                    initial={{ scale: 0.7 }}
                    animate={{ scale: 1 }}
                    transition={springBouncy}
                    className="min-w-[3ch] text-center text-lg font-bold text-bordo-950"
                  >
                    {cantidad}
                  </motion.span>
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() => setCantidad((q) => Math.min(stockActual, q + 1))}
                    disabled={cantidad >= stockActual}
                    className="flex size-10 items-center justify-center text-bordo-800 hover:bg-bordo-800/10 transition-colors disabled:opacity-30"
                  >
                    <Plus className="size-4" />
                  </motion.button>
                </div>

                {/* CTA Button */}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleAddToCart}
                  disabled={agotado}
                  className={cn(
                    "flex-1 h-14 flex items-center justify-center gap-3 font-display text-xl uppercase tracking-wide transition-all overflow-hidden relative group",
                    agotado
                      ? "bg-bordo-800/30 text-bordo-800/50 cursor-not-allowed"
                      : "bg-bordo-800 text-dorado-300 hover:bg-bordo-950"
                  )}
                >
                  {/* Shine effect */}
                  {!agotado && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  )}
                  <AnimatePresence mode="wait">
                    {added ? (
                      <motion.span
                        key="added"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="flex items-center gap-2 relative z-10"
                      >
                        <Check className="size-5" />
                        Agregado
                      </motion.span>
                    ) : agotado ? (
                      <span className="relative z-10">Sin stock</span>
                    ) : (
                      <motion.span
                        key="add"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="flex items-center gap-2 relative z-10"
                      >
                        Agregar al carrito
                        <ArrowRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              </div>

              {/* Description — expandable */}
              {producto.descripcion && (
                <div className="border-y border-bordo-800/10 mt-4">
                  <ExpandableSection title="Descripcion">
                    <p className="text-sm leading-relaxed text-bordo-950/60">
                      {producto.descripcion}
                    </p>
                  </ExpandableSection>
                </div>
              )}

            </div>
          </motion.div>
        </div>
      </div>

      {/* ============================================ */}
      {/* MOBILE STICKY ADD-TO-CART BAR                 */}
      {/* ============================================ */}
      <motion.div
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={springSmooth}
        className="fixed inset-x-0 bottom-0 z-50 bg-white/95 backdrop-blur-lg border-t border-linea shadow-[0_-10px_40px_rgba(115,13,50,0.08)] md:hidden"
      >
        <div className="px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          {/* Price row */}
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex flex-col">
              {varianteActual && (
                <span className="text-[10px] uppercase tracking-wider font-bold text-bordo-800/60">
                  {esMultiAtributo
                    ? Object.values(seleccionAtributos).join(" / ")
                    : varianteActual.nombre}
                </span>
              )}
              <div className="flex items-baseline gap-2">
                {tieneDescuento ? (
                  <>
                    <span className="text-xs text-bordo-950/40 line-through">
                      ${precioActual.toLocaleString("es-UY")}
                    </span>
                    <span className="text-xl font-display font-bold text-bordo-800">
                      ${producto.precio_socio!.toLocaleString("es-UY")}
                    </span>
                  </>
                ) : (
                  <span className="text-xl font-display font-bold text-bordo-950">
                    ${precioActual.toLocaleString("es-UY")}
                  </span>
                )}
              </div>
            </div>

            {/* Quantity selector */}
            <div className="flex items-center border border-linea bg-superficie">
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={() => setCantidad((q) => Math.max(1, q - 1))}
                disabled={cantidad <= 1}
                className="flex size-10 items-center justify-center text-bordo-800 active:bg-bordo-800/10 disabled:opacity-30"
              >
                <Minus className="size-4" />
              </motion.button>
              <motion.span
                key={cantidad}
                initial={{ scale: 0.7 }}
                animate={{ scale: 1 }}
                transition={springBouncy}
                className="min-w-[2.5ch] text-center text-sm font-bold"
              >
                {cantidad}
              </motion.span>
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={() => setCantidad((q) => Math.min(stockActual, q + 1))}
                disabled={cantidad >= stockActual}
                className="flex size-10 items-center justify-center text-bordo-800 active:bg-bordo-800/10 disabled:opacity-30"
              >
                <Plus className="size-4" />
              </motion.button>
            </div>
          </div>

          {/* Add to cart button */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleAddToCart}
            disabled={agotado}
            className={cn(
              "w-full h-12 flex items-center justify-center gap-2 font-display text-base uppercase tracking-wide transition-all",
              agotado
                ? "bg-bordo-800/30 text-bordo-800/50 cursor-not-allowed"
                : "bg-bordo-800 text-dorado-300 active:bg-bordo-950"
            )}
          >
            <AnimatePresence mode="wait">
              {added ? (
                <motion.span
                  key="added"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="flex items-center gap-2"
                >
                  <Check className="size-5" />
                  Agregado al carrito
                </motion.span>
              ) : agotado ? (
                <span>Sin stock</span>
              ) : (
                <motion.span
                  key="add"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="flex items-center gap-2"
                >
                  <ShoppingCart className="size-5" />
                  Agregar al carrito
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </motion.div>

      {/* ============================================ */}
      {/* RELATED PRODUCTS                             */}
      {/* ============================================ */}
      {relacionados.length > 0 && (
        <section className="border-t border-bordo-800/10 bg-fondo">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
            <div className="flex items-end justify-between mb-10">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className="font-heading uppercase tracking-editorial text-xs text-bordo-800 block mb-2">
                  Completa tu estilo
                </span>
                <h2 className="font-display text-title-2 sm:text-title-1 uppercase tracking-tightest text-bordo-950">
                  Productos relacionados
                </h2>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              >
                <Link
                  href="/tienda"
                  className="hidden sm:inline-flex items-center gap-1.5 font-heading uppercase tracking-editorial text-xs text-bordo-800 hover:text-bordo-900 transition-colors group"
                >
                  Ver toda la tienda
                  <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </motion.div>
            </div>

            {/* Mobile: horizontal scroll */}
            <div className="md:hidden">
              <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4">
                {relacionados.map((rel) => {
                  const img =
                    rel.producto_imagenes?.find((i) => i.es_principal) ??
                    rel.producto_imagenes?.[0];
                  return (
                    <div key={rel.id} className="w-[160px] shrink-0">
                      <ProductCard
                        id={rel.id}
                        nombre={rel.nombre}
                        slug={rel.slug}
                        precio={rel.precio}
                        precioSocio={rel.precio_socio}
                        imagenUrl={img?.url}
                        imagenFocalPoint={img?.focal_point}
                        stock={rel.stock_actual}
                        destacado={rel.destacado}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Desktop: grid */}
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="hidden grid-cols-2 gap-4 md:grid md:grid-cols-4 lg:gap-8"
            >
              {relacionados.map((rel) => {
                const img =
                  rel.producto_imagenes?.find((i) => i.es_principal) ??
                  rel.producto_imagenes?.[0];
                return (
                  <ProductCard
                    key={rel.id}
                    id={rel.id}
                    nombre={rel.nombre}
                    slug={rel.slug}
                    precio={rel.precio}
                    precioSocio={rel.precio_socio}
                    imagenUrl={img?.url}
                    imagenFocalPoint={img?.focal_point}
                    stock={rel.stock_actual}
                    destacado={rel.destacado}
                  />
                );
              })}
            </motion.div>
          </div>
        </section>
      )}
    </>
  );
}

/* ============================================ */
/* Expandable section component                 */
/* ============================================ */
function ExpandableSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-5 text-left group"
      >
        <span className="font-display uppercase tracking-widest text-sm font-medium text-bordo-950 group-hover:text-bordo-800 transition-colors">
          {title}
        </span>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={springSmooth}
        >
          <ChevronDown className="size-4 text-bordo-800" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="pb-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
