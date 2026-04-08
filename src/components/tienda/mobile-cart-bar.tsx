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
          <div className="pointer-events-none h-4 bg-gradient-to-t from-bordo-950/20 to-transparent" />

          <div className="bg-bordo-800 border-t-2 border-dorado-300/30 px-4 pb-[env(safe-area-inset-bottom,8px)]">
            <Link href="/tienda/carrito" className="flex items-center gap-3 py-3">
              {/* Cart icon with badge */}
              <div className="relative">
                <ShoppingCart className="size-6 text-dorado-300" />
                <motion.span
                  key={itemCount}
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  transition={springSmooth}
                  className="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-dorado text-[10px] font-bold text-bordo-950"
                >
                  {itemCount}
                </motion.span>
              </div>

              {/* Total */}
              <div className="flex-1">
                <p className="text-[10px] font-heading uppercase tracking-editorial text-dorado-300/80">
                  {itemCount} {itemCount === 1 ? "producto" : "productos"}
                </p>
                <motion.p
                  key={total}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={springSmooth}
                  className="text-xl font-bold text-white font-body"
                >
                  ${total.toLocaleString("es-UY")}
                </motion.p>
              </div>

              {/* CTA */}
              <motion.div
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-1.5 bg-dorado-300 px-5 py-2.5 font-heading text-xs uppercase tracking-editorial font-bold text-bordo-950 border border-bordo-950/20"
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
