"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Minus, PackageOpen, Plus, Sparkles, Trash2 } from "lucide-react";
import { springSmooth } from "@/lib/motion";
import type { ItemCarrito } from "./tipos";
import { pesos } from "./formato";

export function precioLinea(item: ItemCarrito, precioSocio: boolean): number {
  return (precioSocio && item.precio_socio != null ? item.precio_socio : item.precio) + item.precio_extra;
}

export function LineaCarrito({
  item,
  precioSocio,
  onCantidad,
  onQuitar,
}: {
  item: ItemCarrito;
  precioSocio: boolean;
  onCantidad: (key: string, cantidad: number) => void;
  onQuitar: (key: string) => void;
}) {
  const precio = precioLinea(item, precioSocio);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
      transition={springSmooth}
      className="flex items-start gap-2.5 py-2.5"
    >
      <div className="size-11 rounded-lg bg-superficie overflow-hidden shrink-0">
        {item.imagen_url ? (
          <Image
            src={item.imagen_url}
            alt={item.nombre}
            width={44}
            height={44}
            className="object-cover w-full h-full"
            style={{ objectPosition: item.imagen_focal_point || "50% 50%" }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <PackageOpen className="size-4 text-muted-foreground" strokeWidth={1} />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <p className="flex-1 font-body font-medium text-sm leading-tight line-clamp-2">{item.nombre}</p>
          <motion.button
            type="button"
            whileTap={{ scale: 0.85 }}
            onClick={() => onQuitar(item.key)}
            aria-label="Quitar"
            className="-mt-1 size-8 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="size-4" />
          </motion.button>
        </div>
        {item.es_encargue && (
          <p className="flex items-center gap-1 text-[11px] text-bordo-700 truncate">
            <Sparkles className="size-3 shrink-0" />
            <span className="truncate">Encargue{item.resumen ? ` · ${item.resumen}` : ""}</span>
          </p>
        )}
        <div className="mt-1 flex items-center gap-2">
          <div className="flex items-center gap-1">
            <motion.button
              type="button"
              whileTap={{ scale: 0.85 }}
              onClick={() => onCantidad(item.key, item.cantidad - 1)}
              aria-label="Restar uno"
              className="size-9 rounded-lg bg-superficie flex items-center justify-center hover:bg-gray-200 transition-colors"
            >
              <Minus className="size-4" />
            </motion.button>
            <motion.span
              key={item.cantidad}
              initial={{ scale: 1.3, opacity: 0.4 }}
              animate={{ scale: 1, opacity: 1 }}
              className="w-7 text-center font-body font-semibold text-sm tabular-nums"
            >
              {item.cantidad}
            </motion.span>
            <motion.button
              type="button"
              whileTap={{ scale: 0.85 }}
              onClick={() => onCantidad(item.key, item.cantidad + 1)}
              disabled={item.cantidad >= item.maximo}
              aria-label="Sumar uno"
              className="size-9 rounded-lg bg-superficie flex items-center justify-center hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="size-4" />
            </motion.button>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">× {pesos(precio)}</span>
          <span className="ml-auto font-heading font-bold text-sm text-right tabular-nums">{pesos(precio * item.cantidad)}</span>
        </div>
      </div>
    </motion.div>
  );
}
