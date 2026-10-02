"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { springBouncy } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Botón pill con micro-interacción (hover/tap) del sistema de motion. */
export function BotonAnimado({
  className,
  disabled,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <motion.span
      className="inline-flex"
      whileHover={disabled ? undefined : { scale: 1.02, y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={springBouncy}
    >
      <Button className={cn("rounded-full px-3.5", className)} disabled={disabled} {...props} />
    </motion.span>
  );
}
