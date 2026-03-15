"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { fadeInUp, easeSmooth, springBouncy } from "@/lib/motion";
import { Home, ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
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
        <motion.p
          variants={fadeInUp}
          transition={easeSmooth}
          className="text-sm font-medium tracking-editorial text-bordo-800 uppercase mb-4"
        >
          Error 404
        </motion.p>

        <motion.h1
          variants={fadeInUp}
          transition={easeSmooth}
          className="font-display text-display text-foreground mb-4"
        >
          Página no encontrada
        </motion.h1>

        <motion.p
          variants={fadeInUp}
          transition={easeSmooth}
          className="text-muted-foreground text-lg mb-8"
        >
          La página que buscás no existe o fue movida. Revisá la dirección o
          volvé al inicio.
        </motion.p>

        <motion.div
          variants={fadeInUp}
          transition={easeSmooth}
          className="flex flex-col sm:flex-row gap-3 justify-center"
        >
          <motion.div
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={springBouncy}
          >
            <Link
              href="/"
              className={cn(
                buttonVariants({ size: "lg" }),
                "inline-flex items-center gap-2"
              )}
            >
              <Home className="h-4 w-4" />
              Ir al inicio
            </Link>
          </motion.div>
          <motion.div
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={springBouncy}
          >
            <button
              onClick={() => history.back()}
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "inline-flex items-center gap-2"
              )}
            >
              <ArrowLeft className="h-4 w-4" />
              Volver atrás
            </button>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}
