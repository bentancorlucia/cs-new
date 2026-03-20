"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  ShoppingCart,
  Check,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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

interface Props {
  producto: Producto;
  relacionados: RelacionadoSimple[];
}

export function ProductoDetalleClient({ producto, relacionados }: Props) {
  const imagenes = [...producto.producto_imagenes].sort((a, b) => a.orden - b.orden);
  const variantes = producto.producto_variantes?.filter((v) => v.activo) ?? [];
  const tieneVariantes = variantes.length > 0;

  const [imagenActiva, setImagenActiva] = useState(0);
  const [varianteSeleccionada, setVarianteSeleccionada] = useState<number | null>(
    tieneVariantes ? variantes[0]?.id ?? null : null
  );
  const [cantidad, setCantidad] = useState(1);
  const [added, setAdded] = useState(false);
  const [failedImgs, setFailedImgs] = useState<Set<number>>(new Set());
  const { addItem } = useCart();

  // Swipe gesture for mobile gallery
  const dragX = useMotionValue(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const varianteActual = tieneVariantes
    ? variantes.find((v) => v.id === varianteSeleccionada)
    : null;

  const precioActual = varianteActual?.precio_override ?? producto.precio;
  const stockActual = varianteActual?.stock_actual ?? producto.stock_actual;
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
    <div className="mx-auto max-w-7xl px-4 py-6 pb-32 md:pb-8">
      {/* Breadcrumb */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mb-4 flex items-center gap-2 text-sm text-muted-foreground md:mb-6"
      >
        <Link href="/tienda" className="flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          Tienda
        </Link>
        {producto.categorias_producto && (
          <>
            <span>/</span>
            <span>{producto.categorias_producto.nombre}</span>
          </>
        )}
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
        {/* Image gallery with swipe support */}
        <motion.div variants={fadeInLeft} initial="hidden" animate="visible" transition={springSmooth}>
          <div
            ref={containerRef}
            className="relative aspect-square overflow-hidden rounded-2xl bg-muted"
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
                      <Package className="size-16 text-muted-foreground/20" />
                    </div>
                  ) : (
                    <Image
                      src={imagenes[imagenActiva].url}
                      alt={imagenes[imagenActiva].alt_text || producto.nombre}
                      fill
                      className="pointer-events-none object-cover"
                      style={{ objectPosition: imagenes[imagenActiva].focal_point || "50% 50%" }}
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      priority
                      onError={() => setFailedImgs((prev) => new Set(prev).add(imagenActiva))}
                    />
                  )}
                </motion.div>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Package className="size-24 text-muted-foreground/20" />
                </div>
              )}
            </AnimatePresence>

            {/* Nav arrows — desktop only */}
            {imagenes.length > 1 && (
              <>
                <button
                  onClick={prevImage}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow-md backdrop-blur-sm transition hover:bg-white hidden md:flex"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  onClick={nextImage}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow-md backdrop-blur-sm transition hover:bg-white hidden md:flex"
                >
                  <ChevronRight className="size-5" />
                </button>
              </>
            )}

            {/* Dot indicators for mobile */}
            {imagenes.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
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
          </div>

          {/* Thumbnails — desktop */}
          {imagenes.length > 1 && (
            <div className="mt-3 hidden gap-2 overflow-x-auto md:flex">
              {imagenes.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => setImagenActiva(i)}
                  className={cn(
                    "relative size-16 shrink-0 overflow-hidden rounded-xl border-2 transition-all duration-200",
                    i === imagenActiva
                      ? "border-bordo opacity-100"
                      : "border-transparent opacity-50 hover:opacity-80"
                  )}
                >
                  {failedImgs.has(i) ? (
                    <div className="flex h-full items-center justify-center bg-muted">
                      <Package className="size-4 text-muted-foreground/30" />
                    </div>
                  ) : (
                    <Image
                      src={img.url}
                      alt={img.alt_text || ""}
                      fill
                      className="object-cover"
                      style={{ objectPosition: img.focal_point || "50% 50%" }}
                      sizes="64px"
                      onError={() => setFailedImgs((prev) => new Set(prev).add(i))}
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </motion.div>

        {/* Product info */}
        <motion.div
          variants={fadeInRight}
          initial="hidden"
          animate="visible"
          transition={springSmooth}
          className="flex flex-col"
        >
          {producto.categorias_producto && (
            <span className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
              {producto.categorias_producto.nombre}
            </span>
          )}

          <h1 className="font-display text-2xl font-bold text-foreground md:text-3xl">
            {producto.nombre}
          </h1>

          {/* Precio */}
          <div className="mt-3 flex items-end gap-3 md:mt-4">
            <span className={cn("text-2xl font-bold", tieneDescuento && "text-lg text-muted-foreground line-through")}>
              ${precioActual.toLocaleString("es-UY")}
            </span>
            {tieneDescuento && (
              <span className="text-2xl font-bold text-bordo">
                ${producto.precio_socio!.toLocaleString("es-UY")}
              </span>
            )}
            {tieneDescuento && (
              <Badge className="bg-amarillo text-texto">
                Precio socio
              </Badge>
            )}
          </div>

          {/* Stock indicator */}
          <div className="mt-2">
            {agotado ? (
              <Badge variant="destructive">Agotado</Badge>
            ) : stockActual <= 5 ? (
              <span className="text-sm text-amber-600">
                Quedan {stockActual} unidades
              </span>
            ) : (
              <span className="text-sm text-emerald-600">En stock</span>
            )}
          </div>

          <Separator className="my-4" />

          {/* Description */}
          {producto.descripcion && (
            <div className="mb-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {producto.descripcion}
              </p>
            </div>
          )}

          {/* Variants */}
          {tieneVariantes && (
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium">
                Variante
              </label>
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
                      "rounded-xl border px-4 py-2.5 text-sm font-medium transition-all min-h-[44px]",
                      varianteSeleccionada === v.id
                        ? "border-bordo bg-bordo/5 text-bordo ring-2 ring-bordo/20"
                        : "border-border hover:border-foreground/30 active:bg-muted",
                      v.stock_actual <= 0 && "opacity-40 line-through"
                    )}
                  >
                    {v.nombre}
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          {/* Quantity + add to cart — desktop */}
          <div className="mt-auto hidden flex-col gap-3 sm:flex sm:flex-row sm:items-center md:flex">
            <div className="flex items-center rounded-xl border">
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={() => setCantidad((q) => Math.max(1, q - 1))}
                disabled={cantidad <= 1}
                className="flex size-12 items-center justify-center text-muted-foreground transition-colors active:bg-muted active:text-foreground disabled:opacity-30"
              >
                <Minus className="size-4" />
              </motion.button>
              <motion.span
                key={cantidad}
                initial={{ scale: 0.7 }}
                animate={{ scale: 1 }}
                transition={springBouncy}
                className="min-w-[3ch] text-center text-base font-semibold"
              >
                {cantidad}
              </motion.span>
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={() => setCantidad((q) => Math.min(stockActual, q + 1))}
                disabled={cantidad >= stockActual}
                className="flex size-12 items-center justify-center text-muted-foreground transition-colors active:bg-muted active:text-foreground disabled:opacity-30"
              >
                <Plus className="size-4" />
              </motion.button>
            </div>

            <motion.div whileTap={{ scale: 0.97 }} className="flex-1">
              <Button
                size="lg"
                className="w-full"
                disabled={agotado}
                onClick={handleAddToCart}
              >
                <AnimatePresence mode="wait">
                  {added ? (
                    <motion.span
                      key="added"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="flex items-center gap-2"
                    >
                      <Check className="size-4" />
                      Agregado
                    </motion.span>
                  ) : (
                    <motion.span
                      key="add"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="flex items-center gap-2"
                    >
                      <ShoppingCart className="size-4" />
                      Agregar al carrito
                    </motion.span>
                  )}
                </AnimatePresence>
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* Mobile sticky add-to-cart bar */}
      <motion.div
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={springSmooth}
        className="fixed inset-x-0 bottom-0 z-50 border-t border-linea bg-white/95 backdrop-blur-lg md:hidden"
      >
        <div className="px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          {/* Price row */}
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              {tieneDescuento ? (
                <>
                  <span className="text-xs text-muted-foreground line-through">
                    ${precioActual.toLocaleString("es-UY")}
                  </span>
                  <span className="text-lg font-bold text-bordo">
                    ${producto.precio_socio!.toLocaleString("es-UY")}
                  </span>
                </>
              ) : (
                <span className="text-lg font-bold">
                  ${precioActual.toLocaleString("es-UY")}
                </span>
              )}
            </div>

            {/* Quantity selector */}
            <div className="flex items-center rounded-xl border border-linea">
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={() => setCantidad((q) => Math.max(1, q - 1))}
                disabled={cantidad <= 1}
                className="flex size-10 items-center justify-center text-muted-foreground active:bg-muted disabled:opacity-30"
              >
                <Minus className="size-4" />
              </motion.button>
              <motion.span
                key={cantidad}
                initial={{ scale: 0.7 }}
                animate={{ scale: 1 }}
                transition={springBouncy}
                className="min-w-[2.5ch] text-center text-sm font-semibold"
              >
                {cantidad}
              </motion.span>
              <motion.button
                whileTap={{ scale: 0.85 }}
                onClick={() => setCantidad((q) => Math.min(stockActual, q + 1))}
                disabled={cantidad >= stockActual}
                className="flex size-10 items-center justify-center text-muted-foreground active:bg-muted disabled:opacity-30"
              >
                <Plus className="size-4" />
              </motion.button>
            </div>
          </div>

          {/* Add to cart button */}
          <motion.div whileTap={{ scale: 0.97 }}>
            <Button
              size="lg"
              className="w-full gap-2 text-base"
              disabled={agotado}
              onClick={handleAddToCart}
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
            </Button>
          </motion.div>
        </div>
      </motion.div>

      {/* Related products */}
      {relacionados.length > 0 && (
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-12 md:mt-16"
        >
          <h2 className="mb-4 font-display text-xl font-bold md:mb-6">
            Productos relacionados
          </h2>
          {/* Horizontal scroll on mobile, grid on desktop */}
          <div className="md:hidden">
            <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4">
              {relacionados.map((rel) => {
                const img = rel.producto_imagenes?.find((i) => i.es_principal)
                  ?? rel.producto_imagenes?.[0];
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
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="hidden grid-cols-2 gap-4 md:grid md:grid-cols-4"
          >
            {relacionados.map((rel) => {
              const img = rel.producto_imagenes?.find((i) => i.es_principal)
                ?? rel.producto_imagenes?.[0];
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
        </motion.section>
      )}
    </div>
  );
}
