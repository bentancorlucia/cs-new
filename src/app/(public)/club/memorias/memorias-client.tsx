"use client";

import { HeroSection } from "@/components/shared/hero-section";
import { AnimateStaggerGroup } from "@/components/shared/animate-on-scroll";
import { motion } from "framer-motion";
import { fadeInUp, springBouncy } from "@/lib/motion";
import { Download, FileText } from "lucide-react";

const YEARS = [2024, 2023, 2022, 2020, 2019, 2018, 2017, 2016, 2015, 2014];

export function MemoriasClient() {
  return (
    <>
      <HeroSection
        title="Memorias"
        eyebrow="El Club"
        subtitle="Informes anuales del Club Seminario. Descargá la memoria de cada año."
        backgroundImage="/images/club/foto-memorias.webp"
        variant="full"
      />

      <section className="py-16 sm:py-24 bg-fondo">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <AnimateStaggerGroup className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {YEARS.map((year) => (
              <motion.div
                key={year}
                variants={fadeInUp}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="group bg-white rounded-2xl p-6 shadow-card hover:shadow-card-hover transition-shadow duration-300 flex flex-col items-center text-center"
              >
                <div className="size-12 rounded-xl bg-bordo-50 flex items-center justify-center mb-4 group-hover:bg-bordo-100 transition-colors">
                  <FileText className="size-6 text-bordo-800" />
                </div>
                <span className="font-display text-title-1 uppercase tracking-tightest text-foreground">
                  {year}
                </span>
                <span className="mt-1 font-body text-xs text-muted-foreground">
                  Memoria anual
                </span>
                <motion.a
                  href="#"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  transition={springBouncy}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-bordo-800 px-4 py-2 font-heading text-[11px] uppercase tracking-editorial text-white hover:bg-bordo-900 transition-colors"
                >
                  <Download className="size-3.5" />
                  Descargar
                </motion.a>
              </motion.div>
            ))}
          </AnimateStaggerGroup>
        </div>
      </section>
    </>
  );
}
