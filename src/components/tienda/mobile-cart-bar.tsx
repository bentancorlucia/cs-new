"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ShoppingCart, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useCart } from "@/hooks/use-cart";
import { springSmooth } from "@/lib/motion";

export function MobileCartBar() {
  const { itemCount, total, loaded } = useCart();
  const visible = loaded && itemCount > 0;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={springSmooth}
          className="fixed inset-x-0 bottom-0 z-50 md:hidden"
        >
          {/* Gradient fade above bar */}
          <div className="pointer-events-none h-6 bg-gradient-to-t from-white/80 to-transparent" />

          <div className="border-t border-linea bg-white/95 backdrop-blur-lg px-4 pb-[env(safe-area-inset-bottom,8px)]">
            <Link href="/tienda/carrito" className="flex items-center gap-3 py-3">
              {/* Cart icon with badge */}
              <div className="relative">
                <div className="flex size-11 items-center justify-center rounded-full bg-bordo text-white">
                  <ShoppingCart className="size-5" />
                </div>
                <motion.span
                  key={itemCount}
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  transition={springSmooth}
                  className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-dorado text-[10px] font-bold text-texto"
                >
                  {itemCount}
                </motion.span>
              </div>

              {/* Total */}
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">
                  {itemCount} {itemCount === 1 ? "producto" : "productos"}
                </p>
                <motion.p
                  key={total}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={springSmooth}
                  className="text-lg font-bold text-foreground"
                >
                  ${total.toLocaleString("es-UY")}
                </motion.p>
              </div>

              {/* CTA */}
              <motion.div
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-1.5 rounded-full bg-bordo px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-bordo/25"
              >
                Ver carrito
                <ArrowRight className="size-4" />
              </motion.div>
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
