"use client";

import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
  ArrowRight,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/use-cart";
import {
  fadeInUp,
  staggerContainer,
  springSmooth,
  springBouncy,
} from "@/lib/motion";

export function CarritoClient() {
  const { items, loaded, total, totalSocio, itemCount, updateQuantity, removeItem, clearCart } =
    useCart();

  if (!loaded) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-superficie" />
          <div className="h-24 bg-superficie" />
          <div className="h-24 bg-superficie" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-0 sm:px-4 py-0 sm:py-6 pb-44 md:pb-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-end justify-between border-b-2 border-bordo-800/10 px-4 sm:px-0 py-5 sm:py-6"
      >
        <div>
          <span className="font-heading text-[10px] uppercase tracking-editorial text-bordo-800/50 block mb-1">
            Tu pedido
          </span>
          <h1 className="font-display text-title-2 sm:text-title-1 uppercase tracking-tightest text-bordo-950 leading-none">
            Carrito
          </h1>
        </div>
        <Link
          href="/tienda"
          className="flex items-center gap-1.5 font-heading text-[11px] uppercase tracking-editorial text-bordo-800 hover:text-bordo-950 transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Tienda
        </Link>
      </motion.div>

      {items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-5 py-24 text-bordo-800/30 px-4"
        >
          <Package className="size-20 opacity-30" />
          <div className="text-center">
            <p className="font-display text-lg uppercase tracking-tightest text-bordo-950/60">
              Tu carrito está vacío
            </p>
            <p className="mt-1 text-sm text-bordo-800/40">
              Explorá la tienda y encontrá lo que buscás
            </p>
          </div>
          <Link href="/tienda">
            <motion.button
              whileTap={{ scale: 0.97 }}
              className="bg-bordo-800 text-white px-6 py-3 font-heading text-[11px] uppercase tracking-editorial hover:bg-bordo-900 transition-colors"
            >
              Explorar tienda
            </motion.button>
          </Link>
        </motion.div>
      ) : (
        <div className="grid gap-0 lg:grid-cols-[1fr_320px] lg:gap-8">
          {/* Items list */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            <AnimatePresence mode="popLayout">
              {items.map((item) => {
                const key = `${item.productoId}-${item.varianteId ?? ""}`;
                return (
                  <motion.div
                    key={key}
                    variants={fadeInUp}
                    exit={{ opacity: 0, x: -50, transition: { duration: 0.2 } }}
                    layout
                    transition={springSmooth}
                    className="flex gap-4 border-b border-bordo-800/8 px-4 sm:px-0 py-5"
                  >
                    {/* Product image */}
                    <Link
                      href={`/tienda/${item.slug}`}
                      className="relative size-24 sm:size-28 shrink-0 overflow-hidden bg-superficie border border-bordo-800/5"
                    >
                      {item.imagenUrl ? (
                        <Image
                          src={item.imagenUrl}
                          alt={item.nombre}
                          fill
                          className="object-cover mix-blend-multiply"
                          sizes="112px"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <ShoppingCart className="size-8 text-bordo-800/15" />
                        </div>
                      )}
                    </Link>

                    {/* Product info */}
                    <div className="flex flex-1 flex-col gap-1.5 min-w-0">
                      <Link
                        href={`/tienda/${item.slug}`}
                        className="font-display text-sm sm:text-base uppercase leading-tight text-bordo-950 hover:text-bordo-800 transition-colors line-clamp-2"
                      >
                        {item.nombre}
                      </Link>

                      <div className="flex flex-col gap-0.5">
                        <span className="font-bold text-[15px] text-bordo-800 leading-none">
                          ${item.precio.toLocaleString("es-UY")}
                        </span>
                        {item.precioSocio && item.precioSocio < item.precio && (
                          <span className="text-[11px] text-bordo-800/50 font-medium leading-none">
                            Socio: ${item.precioSocio.toLocaleString("es-UY")}
                          </span>
                        )}
                      </div>

                      <div className="mt-auto flex items-center justify-between pt-1.5">
                        {/* Quantity */}
                        <div className="flex items-center border border-bordo-800/15 bg-superficie/50">
                          <motion.button
                            whileTap={{ scale: 0.85 }}
                            onClick={() =>
                              updateQuantity(
                                item.productoId,
                                item.varianteId,
                                item.cantidad - 1
                              )
                            }
                            className="flex size-9 items-center justify-center text-bordo-800/50 transition-colors active:bg-bordo-800/10 active:text-bordo-950"
                          >
                            <Minus className="size-3.5" />
                          </motion.button>
                          <motion.span
                            key={item.cantidad}
                            initial={{ scale: 0.7 }}
                            animate={{ scale: 1 }}
                            transition={springBouncy}
                            className="min-w-[2.5ch] text-center text-sm font-bold text-bordo-950"
                          >
                            {item.cantidad}
                          </motion.span>
                          <motion.button
                            whileTap={{ scale: 0.85 }}
                            onClick={() =>
                              updateQuantity(
                                item.productoId,
                                item.varianteId,
                                item.cantidad + 1
                              )
                            }
                            disabled={item.cantidad >= item.maxStock}
                            className="flex size-9 items-center justify-center text-bordo-800/50 transition-colors active:bg-bordo-800/10 active:text-bordo-950 disabled:opacity-30"
                          >
                            <Plus className="size-3.5" />
                          </motion.button>
                        </div>

                        <div className="flex items-center gap-3">
                          <motion.span
                            key={item.precio * item.cantidad}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-sm font-bold text-bordo-950"
                          >
                            ${(item.precio * item.cantidad).toLocaleString("es-UY")}
                          </motion.span>
                          <motion.button
                            whileTap={{ scale: 0.8 }}
                            onClick={() =>
                              removeItem(item.productoId, item.varianteId)
                            }
                            className="flex size-9 items-center justify-center text-bordo-800/30 transition-colors active:text-red-600"
                          >
                            <Trash2 className="size-4" />
                          </motion.button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            <motion.div layout className="mt-2 flex justify-end px-4 sm:px-0">
              <button
                className="flex items-center gap-1.5 font-heading text-[10px] uppercase tracking-editorial text-bordo-800/40 hover:text-red-600 transition-colors py-2"
                onClick={clearCart}
              >
                <Trash2 className="size-3" />
                Vaciar carrito
              </button>
            </motion.div>
          </motion.div>

          {/* Order summary — desktop */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="hidden h-fit border border-bordo-800/10 bg-white p-6 lg:block"
          >
            <h2 className="font-display text-lg uppercase tracking-tightest text-bordo-950 mb-5">
              Resumen
            </h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-bordo-800/50">
                  Subtotal ({itemCount} productos)
                </span>
                <motion.span
                  key={total}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="font-medium text-bordo-950"
                >
                  ${total.toLocaleString("es-UY")}
                </motion.span>
              </div>
              {totalSocio < total && (
                <div className="flex justify-between text-bordo-800">
                  <span>Precio socio</span>
                  <span className="font-bold">
                    ${totalSocio.toLocaleString("es-UY")}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-bordo-800/40">
                <span>Envío</span>
                <span className="font-heading text-[10px] uppercase tracking-editorial">
                  Retiro en el club
                </span>
              </div>
            </div>

            <div className="my-5 h-px bg-bordo-800/10" />

            <div className="flex justify-between items-baseline">
              <span className="font-display text-sm uppercase tracking-tightest text-bordo-950">
                Total
              </span>
              <motion.span
                key={totalSocio < total ? totalSocio : total}
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={springSmooth}
                className="font-display text-2xl text-bordo-950 font-medium tracking-tight"
              >
                ${(totalSocio < total ? totalSocio : total).toLocaleString("es-UY")}
              </motion.span>
            </div>

            <Link href="/tienda/checkout" className="mt-5 block">
              <motion.button
                whileTap={{ scale: 0.97 }}
                className="w-full flex items-center justify-center gap-2 bg-bordo-800 text-white py-3.5 font-heading text-xs uppercase tracking-editorial hover:bg-bordo-900 transition-colors"
              >
                Ir al checkout
                <ArrowRight className="size-4" />
              </motion.button>
            </Link>

            <p className="mt-3 text-center font-heading text-[10px] uppercase tracking-editorial text-bordo-800/40">
              Retirá tu pedido en el club
            </p>
          </motion.div>
        </div>
      )}

      {/* Mobile sticky checkout bar */}
      {items.length > 0 && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={springSmooth}
          className="fixed inset-x-0 bottom-0 z-50 lg:hidden"
        >
          <div className="pointer-events-none h-4 bg-gradient-to-t from-bordo-950/15 to-transparent" />
          <div className="bg-bordo-800 border-t-2 border-dorado-300/20 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
            {/* Summary row */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex flex-col">
                <span className="font-heading text-[10px] uppercase tracking-editorial text-dorado-300/70">
                  {itemCount} {itemCount === 1 ? "producto" : "productos"}
                </span>
                {totalSocio < total && (
                  <span className="font-heading text-[10px] uppercase tracking-editorial text-dorado-300/50">
                    Socio: ${totalSocio.toLocaleString("es-UY")}
                  </span>
                )}
              </div>
              <motion.span
                key={totalSocio < total ? totalSocio : total}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={springSmooth}
                className="text-2xl font-bold text-white font-body"
              >
                ${(totalSocio < total ? totalSocio : total).toLocaleString("es-UY")}
              </motion.span>
            </div>
            {/* CTA */}
            <Link href="/tienda/checkout">
              <motion.button
                whileTap={{ scale: 0.97 }}
                className="w-full flex items-center justify-center gap-2 bg-dorado-300 text-bordo-950 py-3.5 font-heading text-xs uppercase tracking-editorial font-bold"
              >
                Ir al checkout
                <ArrowRight className="size-4" />
              </motion.button>
            </Link>
          </div>
        </motion.div>
      )}
    </div>
  );
}
