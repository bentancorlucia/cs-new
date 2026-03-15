"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { fadeInUp, easeSmooth, springBouncy } from "@/lib/motion";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function DashboardError({
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
    <motion.div
      className="flex flex-col items-center justify-center py-24 px-4"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { staggerChildren: 0.08 },
        },
      }}
    >
      <motion.div
        variants={fadeInUp}
        transition={easeSmooth}
        className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10"
      >
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </motion.div>

      <motion.h2
        variants={fadeInUp}
        transition={easeSmooth}
        className="font-heading text-title-3 text-foreground mb-2"
      >
        Error en el panel
      </motion.h2>

      <motion.p
        variants={fadeInUp}
        transition={easeSmooth}
        className="text-muted-foreground mb-8 text-center max-w-md"
      >
        Ocurrió un error al cargar esta sección. Intentá de nuevo o volvé al inicio.
      </motion.p>

      <motion.div
        variants={fadeInUp}
        transition={easeSmooth}
        className="flex gap-3"
      >
        <motion.div
          whileHover={{ scale: 1.02, y: -1 }}
          whileTap={{ scale: 0.97 }}
          transition={springBouncy}
        >
          <Link
            href="/"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "inline-flex items-center gap-2"
            )}
          >
            <Home className="h-4 w-4" />
            Inicio
          </Link>
        </motion.div>
        <motion.button
          whileHover={{ scale: 1.02, y: -1 }}
          whileTap={{ scale: 0.97 }}
          transition={springBouncy}
          onClick={reset}
          className={cn(
            buttonVariants(),
            "inline-flex items-center gap-2"
          )}
        >
          <RotateCcw className="h-4 w-4" />
          Reintentar
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
