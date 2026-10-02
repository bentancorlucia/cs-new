"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { PackageOpen, Plus, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { precioSocioUnitario } from "@/lib/tienda/precios";
import { fadeInUp, springBouncy } from "@/lib/motion";
import type { ProductoPos } from "./tipos";
import { pesos } from "./formato";

export function TarjetaProducto({
  producto,
  onAgregar,
  precioSocio,
}: {
  producto: ProductoPos;
  onAgregar: (p: ProductoPos) => void;
  precioSocio: boolean;
}) {
  const socio = precioSocioUnitario(producto);
  const precio = precioSocio && socio != null ? socio : producto.precio;
  const sinStock = producto.disponible <= 0;
  // Sin stock pero con encargue: se puede seguir vendiendo bajo encargue.
  const bloqueado = sinStock && !producto.mto_disponible;
  const soloEncargue = producto.mto_disponible && (producto.mto_solo || sinStock);

  return (
    <motion.button
      type="button"
      layout
      variants={fadeInUp}
      whileHover={bloqueado ? {} : { scale: 1.03, y: -2 }}
      whileTap={bloqueado ? {} : { scale: 0.96 }}
      transition={springBouncy}
      onClick={() => !bloqueado && onAgregar(producto)}
      disabled={bloqueado}
      className={`group relative flex flex-col items-center rounded-xl border bg-white p-2.5 sm:p-3 text-center
        transition-shadow duration-200 select-none
        ${bloqueado
          ? "opacity-50 cursor-not-allowed border-gray-200"
          : "cursor-pointer border-linea hover:shadow-card hover:border-bordo-200 active:shadow-sm"}`}
    >
      <div className="relative w-full aspect-square rounded-lg bg-superficie overflow-hidden mb-2">
        {producto.imagen_url ? (
          <Image
            src={producto.imagen_url}
            alt={producto.nombre}
            fill
            className="object-cover"
            style={{ objectPosition: producto.imagen_focal_point || "50% 50%" }}
            sizes="(max-width: 640px) 45vw, 160px"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <PackageOpen className="size-8" strokeWidth={1} />
          </div>
        )}
        {bloqueado && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <Badge variant="destructive" className="text-xs">Agotado</Badge>
          </div>
        )}
        {!bloqueado && (
          <div className="absolute right-1.5 bottom-1.5 rounded-full bg-bordo-800 text-white p-1.5 shadow-lg opacity-0 scale-75 transition-all duration-200 group-hover:opacity-100 group-hover:scale-100">
            <Plus className="size-4" />
          </div>
        )}
      </div>

      <p className="font-body font-medium text-sm leading-tight line-clamp-2 mb-1">{producto.nombre}</p>
      <p className="font-heading font-bold text-bordo-700 text-base tabular-nums">{pesos(precio)}</p>
      {precioSocio && socio != null && (
        <p className="text-xs text-muted-foreground line-through tabular-nums">{pesos(producto.precio)}</p>
      )}

      {!producto.mto_solo && (
        <span className={`text-[11px] mt-1 ${producto.disponible <= 3 && producto.disponible > 0 ? "text-amber-700" : "text-muted-foreground"}`}>
          Disponible: {producto.disponible}
        </span>
      )}

      {producto.mto_disponible && (
        <Badge className="mt-1 gap-1 text-[10px] px-1.5 py-0 bg-dorado-300/20 text-bordo-800 border border-dorado-300/60">
          <Sparkles className="size-2.5" />
          {soloEncargue ? "Bajo encargue" : "Stock o encargue"}
        </Badge>
      )}
      {producto.variantes.length > 0 && (
        <Badge variant="outline" className="mt-1 text-[10px] px-1.5 py-0 border-bordo-200 text-bordo-600">
          {producto.variantes.length} variantes
        </Badge>
      )}
    </motion.button>
  );
}
