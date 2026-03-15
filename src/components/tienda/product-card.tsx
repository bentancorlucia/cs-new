"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ShoppingCart, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fadeInUp, springBouncy } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface ProductCardProps {
  id: number;
  nombre: string;
  slug: string;
  precio: number;
  precioSocio?: number | null;
  imagenUrl?: string | null;
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

  return (
    <motion.div
      variants={fadeInUp}
      className="group relative flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 transition-shadow hover:shadow-lg hover:ring-foreground/20"
    >
      {/* Image */}
      <Link href={`/tienda/${slug}`} className="relative aspect-square overflow-hidden bg-muted">
        {imagenUrl ? (
          <Image
            src={imagenUrl}
            alt={nombre}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ShoppingCart className="size-12 opacity-20" />
          </div>
        )}

        {/* Badges */}
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {agotado && (
            <Badge variant="destructive" className="text-[10px]">
              Agotado
            </Badge>
          )}
          {tieneDescuento && !agotado && (
            <Badge className="bg-amarillo text-texto text-[10px]">
              Socio -{porcentajeDescuento}%
            </Badge>
          )}
          {destacado && !agotado && (
            <Badge variant="secondary" className="text-[10px]">
              Destacado
            </Badge>
          )}
        </div>

        {/* Quick view overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
          className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100"
        >
          <div className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-texto">
            <Eye className="size-3.5" />
            Ver producto
          </div>
        </motion.div>
      </Link>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {categoria && (
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {categoria}
          </span>
        )}
        <Link
          href={`/tienda/${slug}`}
          className="line-clamp-2 text-sm font-medium leading-tight text-foreground transition-colors hover:text-bordo"
        >
          {nombre}
        </Link>

        <div className="mt-auto flex items-end gap-2 pt-1">
          <span className={cn("text-base font-bold", tieneDescuento && "text-muted-foreground line-through text-sm")}>
            ${precio.toLocaleString("es-UY")}
          </span>
          {tieneDescuento && (
            <span className="text-base font-bold text-bordo">
              ${precioSocio!.toLocaleString("es-UY")}
            </span>
          )}
        </div>
      </div>

      {/* Add to cart */}
      <div className="px-3 pb-3">
        <motion.div whileTap={{ scale: 0.95 }} transition={springBouncy}>
          <Button
            className="w-full"
            size="sm"
            disabled={agotado}
            onClick={(e) => {
              e.preventDefault();
              onAddToCart?.();
            }}
          >
            <ShoppingCart className="size-3.5" />
            {agotado ? "Sin stock" : "Agregar"}
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}
