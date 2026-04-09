"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { AnimateOnScroll } from "@/components/shared/animate-on-scroll";
import { springBouncy } from "@/lib/motion";

const HIDDEN_PATHS = ["/socios"];

export function HaceteSocioCTA() {
  const pathname = usePathname();

  if (HIDDEN_PATHS.includes(pathname)) return null;

  return (
    <section className="pt-20 sm:pt-28 pb-0 gradient-mesh">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center pb-20 sm:pb-28">
        <AnimateOnScroll variant="scaleIn">
          <span className="font-heading uppercase tracking-editorial text-xs text-bordo-800 block mb-4">
            Sumate al club
          </span>
          <h2 className="font-display text-display uppercase tracking-tightest text-foreground">
            Hacete socio
          </h2>
          <p className="mt-4 font-body text-lg text-muted-foreground max-w-xl mx-auto">
            Accedé a beneficios exclusivos y formá parte de La Bordó.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/socios">
              <motion.span
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={springBouncy}
                className="inline-flex items-center justify-center gap-2 bg-bordo-800 px-6 py-3 font-heading text-[11px] uppercase tracking-editorial text-white hover:bg-bordo-900 transition-colors"
              >
                Quiero ser socio
                <ArrowRight className="size-4" />
              </motion.span>
            </Link>
            <Link href="/beneficios">
              <motion.span
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={springBouncy}
                className="inline-flex items-center border border-bordo-800/30 px-6 py-3 font-heading text-[11px] uppercase tracking-editorial text-bordo-800 hover:bg-bordo-800 hover:text-white transition-colors"
              >
                Ver beneficios
              </motion.span>
            </Link>
          </div>
        </AnimateOnScroll>
      </div>
    </section>
  );
}
