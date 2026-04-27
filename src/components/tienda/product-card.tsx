"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, Check, Plus } from "lucide-react";
import { springBouncy } from "@/lib/motion";
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
    <div className="group relative flex flex-col cursor-pointer">
      {/* Image */}
      <Link href={`/tienda/${slug}`} className="relative aspect-[4/5] overflow-hidden bg-superficie border border-bordo-800/5">
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
          <div className="flex h-full items-center justify-center text-bordo-800/20">
            <ShoppingCart className="size-12" />
          </div>
        )}


        {/* Agotado overlay */}
        {agotado && (
          <div className="absolute inset-0 bg-superficie/60 z-10 flex items-center justify-center backdrop-blur-[1px]">
            <span
              className="bg-bordo-800 text-dorado-300 px-3 py-1 font-display text-sm uppercase tracking-widest -rotate-12 border border-dorado-300/30"
              style={{ clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%)" }}
            >
              Agotado
            </span>
          </div>
        )}

        {/* Slide-up quick-add button — desktop only (hover) */}
        {!agotado && (
          <button
            onClick={handleAdd}
            className={cn(
              "absolute bottom-0 left-0 w-full z-20 items-center justify-center gap-2 py-2.5 md:py-3 font-display text-[10px] md:text-xs uppercase tracking-wider transition-all duration-300",
              "hidden md:flex",
              "translate-y-full group-hover:translate-y-0",
              added
                ? "bg-emerald-600 text-white"
                : "bg-bordo-950 text-white hover:bg-bordo-800"
            )}
          >
            <AnimatePresence mode="wait">
              {added ? (
                <motion.span
                  key="check"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={springBouncy}
                  className="flex items-center gap-1.5"
                >
                  <Check className="size-3.5" strokeWidth={2.5} />
                  Agregado
                </motion.span>
              ) : (
                <motion.span
                  key="add"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="flex items-center gap-1.5"
                >
                  Añadir
                  <Plus className="size-3.5" strokeWidth={2.5} />
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        )}
      </Link>

      {/* Always-visible add-to-cart — mobile only */}
      {!agotado && (
        <button
          onClick={handleAdd}
          className={cn(
            "flex md:hidden w-full items-center justify-center gap-2 py-2.5 border-t border-dashed border-bordo-800/15 font-display text-[10px] uppercase tracking-wider transition-all duration-200",
            added
              ? "bg-emerald-600 text-white"
              : "bg-transparent text-bordo-950 active:bg-bordo-950 active:text-white"
          )}
        >
          <AnimatePresence mode="wait">
            {added ? (
              <motion.span
                key="check-m"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={springBouncy}
                className="flex items-center gap-1.5"
              >
                <Check className="size-3.5" strokeWidth={2.5} />
                Agregado
              </motion.span>
            ) : (
              <motion.span
                key="add-m"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="flex items-center gap-1.5"
              >
                <ShoppingCart className="size-3.5" strokeWidth={2.5} />
                Añadir
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      )}

      {/* Info */}
      <Link href={`/tienda/${slug}`} className="flex flex-1 flex-col gap-1 pt-3 pb-1">
        <span className="font-display text-sm md:text-base uppercase leading-tight text-bordo-950 group-hover:text-bordo-800 transition-colors line-clamp-2">
          {nombre}
        </span>

        <div className="mt-auto flex flex-col gap-0.5 pt-1">
          {tieneDescuento ? (
            <>
              <span className="font-bold text-[15px] sm:text-lg text-bordo-800 leading-none">
                Socio: ${precioSocio!.toLocaleString("es-UY")}
              </span>
              <span className="text-bordo-800/50 line-through text-[11px] sm:text-sm font-medium leading-none">
                ${precio.toLocaleString("es-UY")}
              </span>
            </>
          ) : (
            <span className="font-bold text-[15px] sm:text-lg text-bordo-950 leading-none">
              ${precio.toLocaleString("es-UY")}
            </span>
          )}
        </div>

      </Link>
    </div>
  );
}
