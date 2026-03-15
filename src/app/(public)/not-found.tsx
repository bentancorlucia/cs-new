"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { fadeInUp, easeSmooth, springBouncy } from "@/lib/motion";
import { Home, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function PublicNotFound() {
  return (
    <section className="py-24 px-4 flex items-center justify-center min-h-[60vh]">
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
          404
        </motion.p>

        <motion.h1
          variants={fadeInUp}
          transition={easeSmooth}
          className="font-display text-title-1 text-foreground mb-4"
        >
          No encontramos esa página
        </motion.h1>

        <motion.p
          variants={fadeInUp}
          transition={easeSmooth}
          className="text-muted-foreground text-lg mb-8"
        >
          Puede que el enlace esté roto o que la página haya sido eliminada.
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
            <Link
              href="/tienda"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "inline-flex items-center gap-2"
              )}
            >
              <Search className="h-4 w-4" />
              Ver tienda
            </Link>
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
}
