"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { fadeInUp, easeSmooth, springBouncy } from "@/lib/motion";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-fondo flex items-center justify-center px-4">
      <motion.div
        className="text-center max-w-lg"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1, delayChildren: 0.1 },
          },
        }}
      >
        <motion.div
          variants={fadeInUp}
          transition={easeSmooth}
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10"
        >
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </motion.div>

        <motion.h1
          variants={fadeInUp}
          transition={easeSmooth}
          className="font-display text-title-2 text-foreground mb-4"
        >
          Algo salió mal
        </motion.h1>

        <motion.p
          variants={fadeInUp}
          transition={easeSmooth}
          className="text-muted-foreground text-lg mb-8"
        >
          Ocurrió un error inesperado. Intentá de nuevo o contactá al soporte si
          el problema persiste.
        </motion.p>

        <motion.div
          variants={fadeInUp}
          transition={easeSmooth}
        >
          <motion.button
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={springBouncy}
            onClick={reset}
            className={cn(
              buttonVariants({ size: "lg" }),
              "inline-flex items-center gap-2"
            )}
          >
            <RotateCcw className="h-4 w-4" />
            Intentar de nuevo
          </motion.button>
        </motion.div>
      </motion.div>
    </div>
  );
}
