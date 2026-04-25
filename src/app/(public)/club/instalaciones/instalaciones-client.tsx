"use client";

import { HeroSection } from "@/components/shared/hero-section";
import {
  AnimateOnScroll,
  AnimateStaggerGroup,
} from "@/components/shared/animate-on-scroll";
import { motion } from "framer-motion";
import { fadeInUp, springBouncy } from "@/lib/motion";
import {
  MapPin,
  Navigation,
  Lightbulb,
  Shield,
  ArrowUpRight,
} from "lucide-react";

const CANCHAS = [
  {
    nombre: "2 canchas de rugby",
    detalle: "1 iluminada",
    icon: Shield,
  },
  {
    nombre: "5 canchas de fútbol",
    detalle: "3 iluminadas",
    icon: Lightbulb,
  },
  {
    nombre: "1 cancha de fútbol 8",
    detalle: null,
    icon: Shield,
  },
];

const SERVICIOS = [
  "Estacionamiento amplio",
  "Cantina",
  "Vestuarios",
  "Tribuna",
  "Parrillero",
  "Iluminación deportiva",
];

export function InstalacionesClient() {
  return (
    <>
      <HeroSection
        title="Parque CUPRA"
        eyebrow="Instalaciones"
        subtitle="Nuestro predio deportivo en Cochabamba 2882 — el corazón de la actividad deportiva del Club Seminario."
        backgroundImage="/images/instalaciones/foto-cupra.webp"
        variant="full"
      />

      {/* ============================================ */}
      {/* MAPA — Location with map embed               */}
      {/* ============================================ */}
      <section className="py-16 sm:py-24 bg-fondo">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between mb-10 gap-4">
            <AnimateOnScroll variant="fadeInUp">
              <span className="font-heading uppercase tracking-editorial text-xs text-bordo-800 block mb-3">
                Ubicación
              </span>
              <h2 className="font-display text-title-2 sm:text-title-1 uppercase tracking-tightest text-foreground">
                Cómo llegar
              </h2>
            </AnimateOnScroll>
            <AnimateOnScroll variant="fadeInUp" delay={0.1}>
              <div className="inline-flex items-center gap-2 text-muted-foreground font-body">
                <MapPin className="size-4 text-bordo-800" />
                <span>Cochabamba 2882, Montevideo</span>
              </div>
            </AnimateOnScroll>
          </div>

          <AnimateOnScroll variant="scaleIn">
            <motion.div
              whileHover={{ scale: 1.003 }}
              transition={{ duration: 0.4 }}
              className="relative overflow-hidden shadow-card aspect-[16/9] sm:aspect-[2/1] lg:aspect-[5/2]"
            >
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d1636.2!2d-56.1092333!3d-34.8528471!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x959f87a9637f1767%3A0xea1ebc05c867c9c4!2sClub+Seminario!5e0!3m2!1ses-419!2suy!4v1710000000000!5m2!1ses-419!2suy"
                className="absolute inset-0 w-full h-full border-0"
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Ubicación Parque CUPRA — Cochabamba 2882, Montevideo"
              />
            </motion.div>
          </AnimateOnScroll>

          <AnimateOnScroll delay={0.2} className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="https://www.google.com/maps/place/Club+Seminario./@-34.8523961,-56.1102264,17z/data=!4m14!1m7!3m6!1s0x959f874d70b16b89:0xcc6fe5bc4cef43ef!2sCochabamba+2882,+13000+Montevideo,+Departamento+de+Montevideo!3b1!8m2!3d-34.8520968!4d-56.1117284!3m5!1s0x959f87a9637f1767:0xea1ebc05c867c9c4!8m2!3d-34.8528471!4d-56.1092333!16s%2Fg%2F11h07dkdxq?entry=ttu"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-56"
            >
              <motion.span
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={springBouncy}
                className="w-full inline-flex items-center justify-center gap-2 bg-bordo-800 px-6 py-3 font-heading text-xs uppercase tracking-editorial text-white hover:bg-bordo-900 transition-colors"
              >
                <MapPin className="size-4" />
                Ir con Google Maps
              </motion.span>
            </a>
            <a
              href="https://www.waze.com/ul?ll=-34.8528471,-56.1092333&navigate=yes&zoom=17"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-56"
            >
              <motion.span
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={springBouncy}
                className="w-full inline-flex items-center justify-center gap-2 border border-bordo-800 px-6 py-3 font-heading text-xs uppercase tracking-editorial text-bordo-800 hover:bg-bordo-800 hover:text-white transition-colors"
              >
                <Navigation className="size-4" />
                Ir con Waze
              </motion.span>
            </a>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ============================================ */}
      {/* CANCHAS — Premium card grid                  */}
      {/* ============================================ */}
      <section className="py-16 sm:py-24 bg-white border-b border-linea">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-10">
            <AnimateOnScroll variant="fadeInUp">
              <span className="font-heading uppercase tracking-editorial text-xs text-bordo-800 block mb-3">
                Infraestructura
              </span>
              <h2 className="font-display text-title-2 sm:text-title-1 uppercase tracking-tightest text-foreground">
                Nuestras canchas
              </h2>
            </AnimateOnScroll>
          </div>

          <AnimateOnScroll variant="fadeInUp" delay={0.1} className="mb-10">
            <p className="font-body text-lg text-muted-foreground max-w-2xl">
              Un predio en constante mejora, con instalaciones pensadas para la
              práctica deportiva de todas nuestras disciplinas.
            </p>
          </AnimateOnScroll>

          <AnimateStaggerGroup className="grid grid-cols-1 md:grid-cols-3 gap-[2px] md:gap-4">
            {CANCHAS.map((cancha, idx) => (
              <motion.div
                key={cancha.nombre}
                variants={fadeInUp}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="group relative overflow-hidden bg-fondo hover:bg-bordo-800 transition-colors duration-500"
              >
                <div className="relative p-6 sm:p-8 lg:p-10">
                  {/* Number index */}
                  <span className="absolute top-6 right-6 sm:top-8 sm:right-8 font-display text-[clamp(3rem,6vw,5rem)] leading-none text-bordo-800/[0.06] group-hover:text-dorado-300/10 transition-colors duration-500 select-none">
                    {String(idx + 1).padStart(2, "0")}
                  </span>

                  <div className="flex items-start gap-4 mb-5">
                    <motion.div
                      whileHover={{ scale: 1.1 }}
                      transition={springBouncy}
                      className="size-14 rounded-xl bg-bordo-50 group-hover:bg-dorado-300/20 flex items-center justify-center shrink-0 transition-colors duration-500"
                    >
                      <cancha.icon className="size-6 text-bordo-800 group-hover:text-dorado-300 transition-colors duration-500" />
                    </motion.div>
                    <div className="pt-1">
                      <h3 className="font-display text-lg uppercase tracking-tightest text-foreground group-hover:text-white leading-tight transition-colors duration-500">
                        {cancha.nombre}
                      </h3>
                      {cancha.detalle && (
                        <p className="font-body text-sm text-muted-foreground group-hover:text-white/50 mt-1 transition-colors duration-500">
                          {cancha.detalle}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-linea group-hover:border-white/10 pt-4 flex items-center justify-between transition-colors duration-500">
                    <span className="inline-flex items-center gap-2 font-heading text-xs uppercase tracking-editorial text-bordo-800/60 group-hover:text-dorado-300/70 transition-colors duration-500">
                      <span className="size-1.5 rounded-full bg-dorado-500 group-hover:bg-dorado-300" />
                      Parque CUPRA
                    </span>
                    <div className="size-8 rounded-full border border-bordo-800/10 group-hover:border-dorado-300/30 group-hover:bg-dorado-300/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                      <ArrowUpRight className="size-3.5 text-dorado-300" />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimateStaggerGroup>
        </div>
      </section>

      {/* ============================================ */}
      {/* SERVICIOS — Dark section with glow           */}
      {/* ============================================ */}
      <section className="relative py-16 sm:py-24 bg-bordo-800 noise-overlay overflow-hidden">
        {/* Animated gradient orbs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <motion.div
            className="absolute -bottom-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full blur-[120px]"
            style={{ backgroundColor: "#f7b643" }}
            animate={{
              scale: [1, 1.08, 1],
              opacity: [0.2, 0.3, 0.2],
            }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute -top-[20%] -left-[10%] w-[50vw] h-[50vw] rounded-full blur-[120px]"
            style={{ backgroundColor: "#3a0417" }}
            animate={{
              scale: [1.1, 1, 1.1],
              opacity: [0.7, 0.9, 0.7],
            }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-10">
            <AnimateOnScroll variant="fadeInUp">
              <span className="font-heading uppercase tracking-editorial text-xs text-dorado-300 block mb-3">
                Servicios
              </span>
              <h2 className="font-display text-title-2 sm:text-title-1 uppercase tracking-tightest text-white">
                Todo lo que necesitás
              </h2>
            </AnimateOnScroll>
          </div>

          <AnimateStaggerGroup className="grid grid-cols-2 sm:grid-cols-3 gap-[2px] sm:gap-3">
            {SERVICIOS.map((servicio) => (
              <motion.div
                key={servicio}
                variants={fadeInUp}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="group flex items-center gap-3 bg-white/[0.05] hover:bg-white/[0.1] border border-dorado-300/10 hover:border-dorado-300/25 px-5 py-4 backdrop-blur-sm transition-all duration-500"
              >
                <span className="size-1.5 rounded-full bg-dorado-300 shrink-0 shadow-[0_0_8px_rgba(247,182,67,0.5)]" />
                <span className="font-body text-sm text-white/80 group-hover:text-white transition-colors duration-300">
                  {servicio}
                </span>
              </motion.div>
            ))}
          </AnimateStaggerGroup>

          {/* Quote */}
          <AnimateOnScroll variant="fadeInUp" delay={0.2} className="mt-14">
            <div className="relative overflow-hidden bg-white/[0.04] border border-dorado-300/10 p-8 sm:p-12 backdrop-blur-sm">
              {/* Large decorative quote mark */}
              <span className="absolute -top-2 left-6 font-display text-[6rem] leading-none text-dorado-300/10 select-none">
                &ldquo;
              </span>
              <blockquote className="relative z-10 font-heading text-title-3 text-white/70 italic max-w-2xl">
                Estamos mejorando en forma constante el CUPRA para hacerlo un
                lugar cada vez más cómodo, amigable y completo para nuestros
                deportistas.
              </blockquote>
            </div>
          </AnimateOnScroll>
        </div>
      </section>
    </>
  );
}
