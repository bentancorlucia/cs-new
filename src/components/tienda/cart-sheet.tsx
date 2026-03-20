"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Minus,
  Plus,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  ArrowRight,
  Package,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/hooks/use-cart";
import {
  springSmooth,
  springBouncy,
  staggerContainerFast,
  fadeInUp,
} from "@/lib/motion";

export function CartSheet() {
  const { items, itemCount, total, totalSocio, updateQuantity, removeItem } =
    useCart();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Trigger button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(true)}
        className="relative flex size-10 items-center justify-center rounded-full bg-bordo/5 text-bordo transition-colors hover:bg-bordo/10"
      >
        <ShoppingBag className="size-[18px]" />
        <AnimatePresence>
          {itemCount > 0 && (
            <motion.span
              key={itemCount}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={springBouncy}
              className="absolute -right-1.5 -top-1.5 z-10 flex size-[22px] items-center justify-center rounded-full border-2 border-white bg-[#730d32] text-[11px] font-bold text-white shadow-md"
            >
              {itemCount}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[420px]">
          {/* Header */}
          <SheetHeader className="border-b border-linea/60 px-5 py-4">
            <SheetTitle className="flex items-center gap-2.5 text-base font-bold tracking-tight">
              <div className="flex size-8 items-center justify-center rounded-lg bg-bordo/8">
                <ShoppingBag className="size-4 text-bordo" />
              </div>
              Tu carrito
              <AnimatePresence mode="wait">
                {itemCount > 0 && (
                  <motion.span
                    key={itemCount}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={springBouncy}
                    className="ml-auto flex size-7 items-center justify-center rounded-full bg-bordo text-xs font-bold text-white"
                  >
                    {itemCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </SheetTitle>
          </SheetHeader>

          {items.length === 0 ? (
            /* Empty state */
            <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8">
              <motion.div
                initial={{ scale: 0.8, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={springSmooth}
                className="flex size-24 items-center justify-center rounded-2xl bg-muted/60"
              >
                <Package className="size-10 text-muted-foreground/40" />
              </motion.div>
              <div className="text-center">
                <p className="text-base font-semibold text-foreground">
                  Tu carrito está vacío
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Explorá nuestra tienda y encontrá lo que necesitás
                </p>
              </div>
              <Link href="/tienda" onClick={() => setOpen(false)}>
                <Button variant="outline" size="lg" className="gap-2 rounded-xl">
                  Ir a la tienda
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
            </div>
          ) : (
            <>
              {/* Items list */}
              <motion.div
                variants={staggerContainerFast}
                initial="hidden"
                animate="visible"
                className="flex-1 overflow-y-auto px-5 py-3"
              >
                <AnimatePresence mode="popLayout">
                  {items.map((item, index) => {
                    const key = `${item.productoId}-${item.varianteId ?? ""}`;
                    const subtotal = item.precio * item.cantidad;
                    return (
                      <motion.div
                        key={key}
                        variants={fadeInUp}
                        exit={{
                          opacity: 0,
                          x: 60,
                          scale: 0.95,
                          transition: { duration: 0.25 },
                        }}
                        layout
                        transition={springSmooth}
                        className="group relative"
                      >
                        <div className="flex gap-3.5 py-3.5">
                          {/* Product image */}
                          <Link
                            href={`/tienda/${item.slug}`}
                            onClick={() => setOpen(false)}
                            className="relative size-[72px] shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/[0.06] transition-shadow hover:shadow-md"
                          >
                            {item.imagenUrl ? (
                              <Image
                                src={item.imagenUrl}
                                alt={item.nombre}
                                fill
                                className="object-cover transition-transform duration-300 group-hover:scale-105"
                                sizes="72px"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center">
                                <ShoppingCart className="size-5 opacity-20" />
                              </div>
                            )}
                          </Link>

                          {/* Item details */}
                          <div className="flex flex-1 flex-col justify-between py-0.5">
                            <div>
                              <Link
                                href={`/tienda/${item.slug}`}
                                className="line-clamp-2 text-sm font-medium leading-snug text-foreground transition-colors hover:text-bordo"
                                onClick={() => setOpen(false)}
                              >
                                {item.nombre}
                              </Link>
                              <p className="mt-0.5 text-sm font-bold text-bordo">
                                ${item.precio.toLocaleString("es-UY")}
                              </p>
                            </div>

                            {/* Quantity controls + delete */}
                            <div className="flex items-center gap-2">
                              <div className="flex items-center rounded-lg bg-muted/60 ring-1 ring-foreground/[0.06]">
                                <motion.button
                                  whileTap={{ scale: 0.85 }}
                                  onClick={() =>
                                    updateQuantity(
                                      item.productoId,
                                      item.varianteId,
                                      item.cantidad - 1
                                    )
                                  }
                                  className="flex size-8 items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                >
                                  <Minus className="size-3" />
                                </motion.button>
                                <motion.span
                                  key={item.cantidad}
                                  initial={{ scale: 0.6, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  transition={springBouncy}
                                  className="min-w-[2ch] text-center text-xs font-bold"
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
                                  className="flex size-8 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                                >
                                  <Plus className="size-3" />
                                </motion.button>
                              </div>

                              {/* Delete */}
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.85 }}
                                onClick={() =>
                                  removeItem(item.productoId, item.varianteId)
                                }
                                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-destructive/8 hover:text-destructive"
                              >
                                <Trash2 className="size-3.5" />
                              </motion.button>

                              {/* Subtotal */}
                              <motion.span
                                key={subtotal}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="ml-auto text-sm font-semibold text-foreground"
                              >
                                ${subtotal.toLocaleString("es-UY")}
                              </motion.span>
                            </div>
                          </div>
                        </div>

                        {/* Divider between items */}
                        {index < items.length - 1 && (
                          <Separator className="opacity-50" />
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>

              {/* Footer */}
              <SheetFooter className="gap-0 border-t border-linea/60 bg-muted/30 p-5">
                {/* Summary */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      Subtotal ({itemCount}{" "}
                      {itemCount === 1 ? "producto" : "productos"})
                    </span>
                    <span>${total.toLocaleString("es-UY")}</span>
                  </div>

                  {totalSocio < total && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="flex items-center gap-1.5 text-bordo">
                        <span className="inline-block size-1.5 rounded-full bg-bordo" />
                        Precio socio
                      </span>
                      <span className="font-medium text-bordo">
                        ${totalSocio.toLocaleString("es-UY")}
                      </span>
                    </motion.div>
                  )}

                  <Separator className="!my-3" />

                  <div className="flex items-center justify-between">
                    <span className="text-base font-bold">Total</span>
                    <motion.span
                      key={total}
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={springSmooth}
                      className="text-xl font-bold"
                    >
                      ${total.toLocaleString("es-UY")}
                    </motion.span>
                  </div>
                </div>

                {/* CTA buttons */}
                <div className="mt-4 space-y-2">
                  <Link
                    href="/tienda/checkout"
                    className="block"
                    onClick={() => setOpen(false)}
                  >
                    <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                      <Button className="w-full gap-2 text-sm" size="lg">
                        Finalizar compra
                        <ArrowRight className="size-4" />
                      </Button>
                    </motion.div>
                  </Link>
                  <Link
                    href="/tienda/carrito"
                    className="block"
                    onClick={() => setOpen(false)}
                  >
                    <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                      <Button
                        variant="outline"
                        className="w-full gap-2 text-sm"
                        size="lg"
                      >
                        Ver carrito completo
                      </Button>
                    </motion.div>
                  </Link>
                </div>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
