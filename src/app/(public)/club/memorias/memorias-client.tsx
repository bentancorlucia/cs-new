"use client";

import { HeroSection } from "@/components/shared/hero-section";
import {
  AnimateOnScroll,
  AnimateStaggerGroup,
} from "@/components/shared/animate-on-scroll";
import { motion } from "framer-motion";
import {
  fadeInUp,
  scaleIn,
  springBouncy,
  springSmooth,
  easeDramatic,
} from "@/lib/motion";
import { Download, FileText, Star, ExternalLink, Calendar } from "lucide-react";

interface Memoria {
  year: number;
  label?: string;
  pdfUrl: string;
}

const MEMORIAS: Memoria[] = [
  {
    year: 2024,
    label: "Memoria mas reciente",
    pdfUrl: "/documentos/memorias/Memoria-2024-Club-Seminario.pdf",
  },
  {
    year: 2023,
    pdfUrl: "/documentos/memorias/Memoria-2023-Club-Seminario.pdf",
  },
  {
    year: 2022,
    pdfUrl: "/documentos/memorias/Memoria-2022-Club-Seminario.pdf",
  },
  {
    year: 2020,
    pdfUrl: "/documentos/memorias/Memoria-2020-Club-Seminario.pdf",
  },
  {
    year: 2019,
    pdfUrl: "/documentos/memorias/Memoria-2019-Club-Seminario.pdf",
  },
  {
    year: 2018,
    pdfUrl: "/documentos/memorias/Memoria-2018-Club-Seminario.pdf",
  },
  {
    year: 2017,
    pdfUrl: "/documentos/memorias/Memoria-2017-Club-Seminario.pdf",
  },
  {
    year: 2016,
    pdfUrl: "/documentos/memorias/Memoria-2016-Club-Seminario.pdf",
  },
  {
    year: 2015,
    pdfUrl: "/documentos/memorias/Memoria-2015-Club-Seminario.pdf",
  },
  {
    year: 2014,
    pdfUrl: "/documentos/memorias/Memoria-2014-Club-Seminario.pdf",
  },
];

function FeaturedMemoria({ memoria }: { memoria: Memoria }) {
  return (
    <AnimateOnScroll variant="scaleIn">
      <motion.div
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-bordo-900 via-bordo-800 to-bordo-950 p-8 sm:p-10 lg:p-12 shadow-elevated noise-overlay"
        whileHover={{ y: -4 }}
        transition={springSmooth}
      >
        {/* Decorative accent line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-dorado-300 via-dorado-400 to-dorado-300" />

        {/* Decorative circles */}
        <div className="absolute -top-20 -right-20 size-64 rounded-full bg-dorado-300/5 blur-2xl" />
        <div className="absolute -bottom-16 -left-16 size-48 rounded-full bg-bordo-700/30 blur-2xl" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="flex-1">
            <motion.div
              initial={{ opacity: 0, x: -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="inline-flex items-center gap-2 rounded-full bg-dorado-300/15 px-3.5 py-1.5 mb-5"
            >
              <Star className="size-3.5 text-dorado-300 fill-dorado-300" />
              <span className="font-heading text-[11px] uppercase tracking-editorial text-dorado-300">
                {memoria.label}
              </span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ ...easeDramatic, delay: 0.3 }}
              className="flex items-baseline gap-3"
            >
              <span className="font-display text-[4rem] sm:text-[5rem] lg:text-[6rem] leading-none uppercase tracking-tightest text-dorado-300">
                {memoria.year}
              </span>
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="mt-3 font-body text-sm sm:text-base text-white/60 max-w-md"
            >
              Memoria anual del Club Seminario. Resumen de actividades,
              logros y balance del ejercicio {memoria.year}.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.6 }}
              className="mt-6 flex flex-wrap gap-3"
            >
              <motion.a
                href={memoria.pdfUrl}
                download
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                transition={springBouncy}
                className="inline-flex items-center gap-2 rounded-full bg-dorado-300 px-6 py-3 font-heading text-xs uppercase tracking-editorial text-bordo-950 hover:bg-dorado-200 transition-colors"
              >
                <Download className="size-4" />
                Descargar PDF
              </motion.a>
              <motion.a
                href={memoria.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                transition={springBouncy}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 font-heading text-xs uppercase tracking-editorial text-white/80 hover:bg-white/10 hover:text-white transition-colors"
              >
                <ExternalLink className="size-4" />
                Ver online
              </motion.a>
            </motion.div>
          </div>

          {/* Large decorative icon */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8, rotate: -8 }}
            whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
            viewport={{ once: true }}
            transition={{ ...easeDramatic, delay: 0.4 }}
            className="hidden sm:flex items-center justify-center"
          >
            <div className="relative size-32 lg:size-40 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center">
              <FileText className="size-16 lg:size-20 text-dorado-300/40" />
              <div className="absolute -top-2 -right-2 size-6 rounded-full bg-dorado-300 flex items-center justify-center">
                <Star className="size-3 text-bordo-950 fill-bordo-950" />
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </AnimateOnScroll>
  );
}

function MemoriaCard({ memoria }: { memoria: Memoria }) {
  return (
    <motion.div
      variants={fadeInUp}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="group relative bg-white rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-shadow duration-300"
    >
      {/* Top accent on hover */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-bordo-800 to-dorado-400 scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left z-10" />

      <div className="p-6 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="size-10 rounded-xl bg-bordo-50 flex items-center justify-center mb-4 group-hover:bg-bordo-100 group-hover:scale-110 transition-all duration-300">
              <FileText className="size-5 text-bordo-800" />
            </div>

            <span className="font-display text-3xl sm:text-4xl uppercase tracking-tightest text-foreground block">
              {memoria.year}
            </span>

            <span className="mt-1 font-body text-xs text-muted-foreground flex items-center gap-1.5">
              <Calendar className="size-3" />
              Memoria anual
            </span>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-gray-100 flex items-center gap-3">
          <motion.a
            href={memoria.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={springBouncy}
            className="inline-flex items-center gap-1.5 rounded-full bg-bordo-800 px-4 py-2 font-heading text-[11px] uppercase tracking-editorial text-white hover:bg-bordo-900 transition-colors"
          >
            <ExternalLink className="size-3.5" />
            Ver PDF
          </motion.a>
          <motion.a
            href={memoria.pdfUrl}
            download
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={springBouncy}
            className="inline-flex items-center gap-1.5 rounded-full border border-bordo-200 px-4 py-2 font-heading text-[11px] uppercase tracking-editorial text-bordo-800 hover:bg-bordo-50 transition-colors"
          >
            <Download className="size-3.5" />
            Descargar
          </motion.a>
        </div>
      </div>
    </motion.div>
  );
}

export function MemoriasClient() {
  const [featured, ...rest] = MEMORIAS;

  return (
    <>
      <HeroSection
        title="Memorias"
        eyebrow="El Club"
        subtitle="Informes anuales del Club Seminario. Descarga la memoria de cada año para conocer nuestra historia y actividad."
        backgroundImage="/images/club/foto-memorias.webp"
        variant="full"
      />

      <section className="py-16 sm:py-24 bg-fondo">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          {/* Featured — most recent */}
          <FeaturedMemoria memoria={featured} />

          {/* Section title */}
          <AnimateOnScroll variant="fadeInUp" className="mt-16 sm:mt-20 mb-8 sm:mb-10">
            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-bordo-200 to-transparent" />
              <h2 className="font-heading text-xs uppercase tracking-editorial text-muted-foreground">
                Memorias anteriores
              </h2>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-bordo-200 to-transparent" />
            </div>
          </AnimateOnScroll>

          {/* Grid of remaining years */}
          <AnimateStaggerGroup className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {rest.map((memoria) => (
              <MemoriaCard key={memoria.year} memoria={memoria} />
            ))}
          </AnimateStaggerGroup>
        </div>
      </section>
    </>
  );
}
