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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-24 rounded-xl bg-muted" />
          <div className="h-24 rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 pb-36 md:pb-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-5 flex items-center justify-between md:mb-6"
      >
        <div>
          <h1 className="font-display text-xl font-bold md:text-3xl">
            Carrito
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {itemCount} {itemCount === 1 ? "producto" : "productos"}
          </p>
        </div>
        <Link href="/tienda">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Seguir comprando</span>
            <span className="sm:hidden">Tienda</span>
          </Button>
        </Link>
      </motion.div>

      {items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4 py-20 text-muted-foreground"
        >
          <ShoppingCart className="size-20 opacity-20" />
          <p className="text-lg font-medium">Tu carrito está vacío</p>
          <Link href="/tienda">
            <Button size="lg">Explorar tienda</Button>
          </Link>
        </motion.div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:gap-8">
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
                    className="flex gap-3 border-b border-linea/50 py-4 sm:gap-4"
                  >
                    <Link
                      href={`/tienda/${item.slug}`}
                      className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-muted sm:size-24"
                    >
                      {item.imagenUrl ? (
                        <Image
                          src={item.imagenUrl}
                          alt={item.nombre}
                          fill
                          className="object-cover"
                          sizes="96px"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <ShoppingCart className="size-8 opacity-20" />
                        </div>
                      )}
                    </Link>

                    <div className="flex flex-1 flex-col gap-1">
                      <Link
                        href={`/tienda/${item.slug}`}
                        className="text-sm font-medium leading-tight hover:text-bordo sm:text-base"
                      >
                        {item.nombre}
                      </Link>

                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-bordo">
                          ${item.precio.toLocaleString("es-UY")}
                        </span>
                        {item.precioSocio && item.precioSocio < item.precio && (
                          <span className="text-xs text-muted-foreground">
                            Socio: ${item.precioSocio.toLocaleString("es-UY")}
                          </span>
                        )}
                      </div>

                      <div className="mt-auto flex items-center justify-between pt-2">
                        {/* Quantity — mobile-friendly size */}
                        <div className="flex items-center rounded-xl border border-linea">
                          <motion.button
                            whileTap={{ scale: 0.85 }}
                            onClick={() =>
                              updateQuantity(
                                item.productoId,
                                item.varianteId,
                                item.cantidad - 1
                              )
                            }
                            className="flex size-10 items-center justify-center text-muted-foreground transition-colors active:bg-muted active:text-foreground"
                          >
                            <Minus className="size-4" />
                          </motion.button>
                          <motion.span
                            key={item.cantidad}
                            initial={{ scale: 0.7 }}
                            animate={{ scale: 1 }}
                            transition={springBouncy}
                            className="min-w-[2.5ch] text-center text-sm font-semibold"
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
                            className="flex size-10 items-center justify-center text-muted-foreground transition-colors active:bg-muted active:text-foreground disabled:opacity-30"
                          >
                            <Plus className="size-4" />
                          </motion.button>
                        </div>

                        <div className="flex items-center gap-2 sm:gap-3">
                          <span className="text-sm font-bold">
                            ${(item.precio * item.cantidad).toLocaleString("es-UY")}
                          </span>
                          <motion.button
                            whileTap={{ scale: 0.8 }}
                            onClick={() =>
                              removeItem(item.productoId, item.varianteId)
                            }
                            className="flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-colors active:bg-destructive/10 active:text-destructive"
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

            <motion.div layout className="mt-4 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={clearCart}
              >
                <Trash2 className="size-3.5" />
                Vaciar carrito
              </Button>
            </motion.div>
          </motion.div>

          {/* Order summary — desktop */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="hidden h-fit rounded-xl border bg-card p-5 lg:block"
          >
            <h2 className="mb-4 text-lg font-bold">Resumen</h2>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Subtotal ({itemCount} productos)
                </span>
                <motion.span
                  key={total}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="font-medium"
                >
                  ${total.toLocaleString("es-UY")}
                </motion.span>
              </div>
              {totalSocio < total && (
                <div className="flex justify-between text-bordo">
                  <span>Precio socio</span>
                  <span className="font-medium">
                    ${totalSocio.toLocaleString("es-UY")}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>Envío</span>
                <span>Retiro en el club</span>
              </div>
            </div>

            <Separator className="my-4" />

            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <motion.span
                key={total}
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={springSmooth}
              >
                ${total.toLocaleString("es-UY")}
              </motion.span>
            </div>

            <Link href="/tienda/checkout" className="mt-4 block">
              <motion.div whileTap={{ scale: 0.97 }}>
                <Button className="w-full gap-2" size="lg">
                  Ir al checkout
                  <ArrowRight className="size-4" />
                </Button>
              </motion.div>
            </Link>

            <p className="mt-3 text-center text-xs text-muted-foreground">
              Retirá tu pedido en el club una vez confirmado el pago
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
          className="fixed inset-x-0 bottom-0 z-50 border-t border-linea bg-white/95 backdrop-blur-lg lg:hidden"
        >
          <div className="px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {itemCount} {itemCount === 1 ? "producto" : "productos"}
              </span>
              <motion.span
                key={total}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={springSmooth}
                className="text-xl font-bold"
              >
                ${total.toLocaleString("es-UY")}
              </motion.span>
            </div>
            <Link href="/tienda/checkout">
              <motion.div whileTap={{ scale: 0.97 }}>
                <Button className="w-full gap-2 text-base" size="lg">
                  Ir al checkout
                  <ArrowRight className="size-4" />
                </Button>
              </motion.div>
            </Link>
          </div>
        </motion.div>
      )}
    </div>
  );
}
