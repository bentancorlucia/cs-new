"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useCart } from "@/hooks/use-cart";
import { springSmooth, fadeInRight } from "@/lib/motion";

export function CartSheet() {
  const { items, itemCount, total, updateQuantity, removeItem } = useCart();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="ghost" size="icon" className="relative" onClick={() => setOpen(true)}>
        <ShoppingCart className="size-5" />
        <AnimatePresence>
          {itemCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={springSmooth}
              className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-bordo text-[10px] font-bold text-white"
            >
              {itemCount}
            </motion.span>
          )}
        </AnimatePresence>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <ShoppingCart className="size-5" />
              Carrito ({itemCount})
            </SheetTitle>
          </SheetHeader>

          {items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
              <ShoppingCart className="size-16 opacity-20" />
              <p className="text-sm">Tu carrito está vacío</p>
              <Link href="/tienda" onClick={() => setOpen(false)}>
                <Button variant="outline" size="sm">
                  Ir a la tienda
                </Button>
              </Link>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-y-auto">
                <AnimatePresence mode="popLayout">
                  {items.map((item) => {
                    const key = `${item.productoId}-${item.varianteId ?? ""}`;
                    return (
                      <motion.div
                        key={key}
                        variants={fadeInRight}
                        initial="hidden"
                        animate="visible"
                        exit={{ opacity: 0, x: 50, transition: { duration: 0.2 } }}
                        layout
                        transition={springSmooth}
                        className="flex gap-3 border-b py-3"
                      >
                        <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                          {item.imagenUrl ? (
                            <Image
                              src={item.imagenUrl}
                              alt={item.nombre}
                              fill
                              className="object-cover"
                              sizes="64px"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center">
                              <ShoppingCart className="size-5 opacity-20" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col gap-1">
                          <Link
                            href={`/tienda/${item.slug}`}
                            className="text-sm font-medium leading-tight hover:text-bordo"
                            onClick={() => setOpen(false)}
                          >
                            {item.nombre}
                          </Link>
                          <span className="text-sm font-bold text-bordo">
                            ${item.precio.toLocaleString("es-UY")}
                          </span>
                          <div className="mt-auto flex items-center gap-2">
                            <div className="flex items-center rounded-md border">
                              <button
                                onClick={() =>
                                  updateQuantity(item.productoId, item.varianteId, item.cantidad - 1)
                                }
                                className="flex size-7 items-center justify-center text-muted-foreground hover:text-foreground"
                              >
                                <Minus className="size-3" />
                              </button>
                              <span className="min-w-[2ch] text-center text-xs font-medium">
                                {item.cantidad}
                              </span>
                              <button
                                onClick={() =>
                                  updateQuantity(item.productoId, item.varianteId, item.cantidad + 1)
                                }
                                disabled={item.cantidad >= item.maxStock}
                                className="flex size-7 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
                              >
                                <Plus className="size-3" />
                              </button>
                            </div>
                            <button
                              onClick={() => removeItem(item.productoId, item.varianteId)}
                              className="ml-auto text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>

              <div className="space-y-3 border-t pt-3">
                <div className="flex items-center justify-between text-base font-bold">
                  <span>Total</span>
                  <motion.span
                    key={total}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={springSmooth}
                  >
                    ${total.toLocaleString("es-UY")}
                  </motion.span>
                </div>
                <Link href="/tienda/carrito" className="block" onClick={() => setOpen(false)}>
                  <Button className="w-full" size="lg">
                    Ver carrito completo
                  </Button>
                </Link>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
