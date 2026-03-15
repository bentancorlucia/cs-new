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
    <div className="mx-auto max-w-3xl px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex items-center justify-between"
      >
        <div>
          <h1 className="font-display text-2xl font-bold md:text-3xl">
            Carrito de compras
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {itemCount} {itemCount === 1 ? "producto" : "productos"}
          </p>
        </div>
        <Link href="/tienda">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="size-4" />
            Seguir comprando
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
            <Button>Explorar tienda</Button>
          </Link>
        </motion.div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
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
                    className="flex gap-4 border-b py-4"
                  >
                    <Link
                      href={`/tienda/${item.slug}`}
                      className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-muted"
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
                        className="font-medium hover:text-bordo"
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
                        <div className="flex items-center rounded-lg border">
                          <button
                            onClick={() =>
                              updateQuantity(
                                item.productoId,
                                item.varianteId,
                                item.cantidad - 1
                              )
                            }
                            className="flex size-8 items-center justify-center text-muted-foreground hover:text-foreground"
                          >
                            <Minus className="size-3.5" />
                          </button>
                          <span className="min-w-[2.5ch] text-center text-sm font-medium">
                            {item.cantidad}
                          </span>
                          <button
                            onClick={() =>
                              updateQuantity(
                                item.productoId,
                                item.varianteId,
                                item.cantidad + 1
                              )
                            }
                            disabled={item.cantidad >= item.maxStock}
                            className="flex size-8 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
                          >
                            <Plus className="size-3.5" />
                          </button>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold">
                            ${(item.precio * item.cantidad).toLocaleString("es-UY")}
                          </span>
                          <button
                            onClick={() =>
                              removeItem(item.productoId, item.varianteId)
                            }
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-4" />
                          </button>
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

          {/* Order summary */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="h-fit rounded-xl border bg-card p-5"
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

            <Link href="/tienda/checkout" className="block">
              <Button className="w-full" size="lg">
                Ir al checkout
                <ArrowRight className="ml-1 size-4" />
              </Button>
            </Link>

            <p className="mt-3 text-center text-xs text-muted-foreground">
              Retirá tu pedido en el club una vez confirmado el pago
            </p>
          </motion.div>
        </div>
      )}
    </div>
  );
}
