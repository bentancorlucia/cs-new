"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fadeInUp, springBouncy, springSmooth } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface ProductCardProps {
  id: number;
  nombre: string;
  slug: string;
  precio: number;
  precioSocio?: number | null;
  imagenUrl?: string | null;
  imagenFocalPoint?: string | null;
  stock: number;
  destacado?: boolean;
  categoria?: string | null;
  onAddToCart?: () => void;
}

export function ProductCard({
  nombre,
  slug,
  precio,
  precioSocio,
  imagenUrl,
  imagenFocalPoint,
  stock,
  destacado,
  categoria,
  onAddToCart,
}: ProductCardProps) {
  const agotado = stock <= 0;
  const tieneDescuento = precioSocio != null && precioSocio < precio;
  const porcentajeDescuento = tieneDescuento
    ? Math.round(((precio - precioSocio!) / precio) * 100)
    : 0;
  const [added, setAdded] = useState(false);
  const [imgError, setImgError] = useState(false);

  function handleAdd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (agotado || added) return;
    onAddToCart?.();
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  return (
    <motion.div
      variants={fadeInUp}
      className="group relative flex flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/[0.06] transition-shadow hover:shadow-lg hover:ring-foreground/15 active:scale-[0.98]"
    >
      {/* Image */}
      <Link href={`/tienda/${slug}`} className="relative aspect-[4/5] overflow-hidden bg-muted">
        {imagenUrl && !imgError ? (
          <Image
            src={imagenUrl}
            alt={nombre}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            style={{ objectPosition: imagenFocalPoint || "50% 50%" }}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ShoppingCart className="size-12 opacity-20" />
          </div>
        )}

        {/* Badges */}
        <div className="absolute left-2 top-2 flex flex-col gap-1.5">
          {agotado && (
            <Badge variant="destructive" className="text-[10px] shadow-sm">
              Agotado
            </Badge>
          )}
          {tieneDescuento && !agotado && (
            <Badge className="bg-amarillo text-texto text-[10px] shadow-sm">
              -{porcentajeDescuento}%
            </Badge>
          )}
          {destacado && !agotado && (
            <Badge variant="secondary" className="text-[10px] shadow-sm">
              Destacado
            </Badge>
          )}
        </div>

        {/* Quick-add floating button (mobile: always visible, desktop: on hover) */}
        {!agotado && (
          <motion.button
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            whileTap={{ scale: 0.85 }}
            transition={springBouncy}
            onClick={handleAdd}
            className={cn(
              "absolute bottom-2.5 right-2.5 flex size-10 items-center justify-center rounded-full shadow-lg transition-colors",
              "md:opacity-0 md:group-hover:opacity-100",
              added
                ? "bg-emerald-500 text-white"
                : "bg-white text-bordo active:bg-bordo active:text-white"
            )}
          >
            <AnimatePresence mode="wait">
              {added ? (
                <motion.span
                  key="check"
                  initial={{ scale: 0, rotate: -90 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0 }}
                  transition={springBouncy}
                >
                  <Check className="size-5" strokeWidth={2.5} />
                </motion.span>
              ) : (
                <motion.span
                  key="cart"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                >
                  <ShoppingCart className="size-[18px]" />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        )}
      </Link>

      {/* Info */}
      <Link href={`/tienda/${slug}`} className="flex flex-1 flex-col gap-1 p-3 pb-3.5">
        {categoria && (
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {categoria}
          </span>
        )}
        <span className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground transition-colors group-hover:text-bordo sm:text-sm">
          {nombre}
        </span>

        <div className="mt-auto flex items-baseline gap-1.5 pt-1.5">
          {tieneDescuento ? (
            <>
              <span className="text-[13px] font-medium text-muted-foreground line-through sm:text-sm">
                ${precio.toLocaleString("es-UY")}
              </span>
              <span className="text-base font-bold text-bordo sm:text-lg">
                ${precioSocio!.toLocaleString("es-UY")}
              </span>
            </>
          ) : (
            <span className="text-base font-bold text-foreground sm:text-lg">
              ${precio.toLocaleString("es-UY")}
            </span>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
