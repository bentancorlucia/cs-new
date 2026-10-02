"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { springBouncy } from "@/lib/motion";

/** Casilla visual (sin input propio: la fila entera es el control). */
export function Marca({ activa, className }: { activa: boolean; className?: string }) {
  return (
    <motion.span
      aria-hidden
      animate={{ scale: activa ? 1 : 0.92 }}
      transition={springBouncy}
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        activa ? "border-bordo-800 bg-bordo-800 text-white" : "border-foreground/25 bg-white",
        className
      )}
    >
      <AnimatePresence initial={false}>
        {activa && (
          <motion.span
            key="check"
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0 }}
            transition={springBouncy}
          >
            <Check className="size-3" strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.span>
  );
}
