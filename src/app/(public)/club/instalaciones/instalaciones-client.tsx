"use client";

import { HeroSection } from "@/components/shared/hero-section";
import {
  AnimateOnScroll,
  AnimateStaggerGroup,
} from "@/components/shared/animate-on-scroll";
import { motion } from "framer-motion";
import { fadeInUp, springBouncy } from "@/lib/motion";
import { MapPin, Navigation, Lightbulb, Shield } from "lucide-react";

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

      {/* Canchas */}
      <section className="py-16 sm:py-24 bg-fondo">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimateOnScroll>
            <div className="text-center mb-12 sm:mb-16">
              <span className="font-heading uppercase tracking-editorial text-xs text-bordo-800 block mb-3">
                Infraestructura
              </span>
              <h2 className="font-display text-title-1 uppercase tracking-tightest text-foreground">
                Nuestras canchas
              </h2>
              <p className="mt-4 font-body text-lg text-muted-foreground max-w-2xl mx-auto">
                Un predio en constante mejora, con instalaciones pensadas para la
                práctica deportiva de todas nuestras disciplinas.
              </p>
            </div>
          </AnimateOnScroll>

          <AnimateStaggerGroup className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {CANCHAS.map((cancha) => (
              <motion.div
                key={cancha.nombre}
                variants={fadeInUp}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="group relative rounded-2xl bg-white p-6 sm:p-8 shadow-card hover:shadow-card-hover transition-shadow duration-300 overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-bordo-800 to-bordo-600 scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />
                <div className="flex items-center gap-4 mb-3">
                  <div className="flex items-center justify-center size-10 rounded-xl bg-bordo-50 text-bordo-800">
                    <cancha.icon className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-display text-title-3 uppercase tracking-tightest text-foreground">
                      {cancha.nombre}
                    </h3>
                    {cancha.detalle && (
                      <p className="font-body text-sm text-muted-foreground">
                        {cancha.detalle}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimateStaggerGroup>
        </div>
      </section>

      {/* Servicios */}
      <section className="relative py-16 sm:py-24 bg-[rgba(115,13,50,0.95)] overflow-hidden">
        {/* Iluminaciones amarillas */}
        <div className="absolute top-0 left-1/4 w-80 h-80 rounded-full bg-dorado-300/15 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-64 h-64 rounded-full bg-dorado-300/10 blur-[100px] pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-48 rounded-full bg-dorado-300/8 blur-[80px] pointer-events-none" />

        <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimateOnScroll>
            <div className="text-center mb-12">
              <span className="font-heading uppercase tracking-editorial text-xs text-dorado-300 block mb-3">
                Servicios
              </span>
              <h2 className="font-display text-title-1 uppercase tracking-tightest text-white">
                Todo lo que necesitás
              </h2>
            </div>
          </AnimateOnScroll>

          <AnimateStaggerGroup className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            {SERVICIOS.map((servicio) => (
              <motion.div
                key={servicio}
                variants={fadeInUp}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-center gap-3 rounded-xl bg-white/10 border border-dorado-300/20 px-4 py-3 backdrop-blur-sm"
              >
                <span className="size-2 rounded-full bg-dorado-300 shrink-0 shadow-[0_0_8px_rgba(247,182,67,0.6)]" />
                <span className="font-body text-sm text-white/90">
                  {servicio}
                </span>
              </motion.div>
            ))}
          </AnimateStaggerGroup>

          {/* Quote */}
          <AnimateOnScroll variant="blurIn" className="mt-16">
            <div className="rounded-2xl bg-white/5 border border-dorado-300/15 p-8 sm:p-12 text-center backdrop-blur-sm">
              <blockquote className="font-heading text-title-3 text-white/70 italic max-w-2xl mx-auto">
                &ldquo;Estamos mejorando en forma constante el CUPRA para
                hacerlo un lugar cada vez más cómodo, amigable y completo para
                nuestros deportistas.&rdquo;
              </blockquote>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* Mapa */}
      <section className="py-16 sm:py-24 bg-fondo">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimateOnScroll>
            <div className="text-center mb-10 sm:mb-14">
              <span className="font-heading uppercase tracking-editorial text-xs text-bordo-800 block mb-3">
                Ubicación
              </span>
              <h2 className="font-display text-title-1 uppercase tracking-tightest text-foreground">
                Cómo llegar
              </h2>
              <div className="mt-4 inline-flex items-center gap-2 text-muted-foreground font-body">
                <MapPin className="size-4 text-bordo-800" />
                <span>Cochabamba 2882, Montevideo</span>
              </div>
            </div>
          </AnimateOnScroll>

          <AnimateOnScroll variant="blurIn">
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ scale: 1.005 }}
              className="relative rounded-2xl overflow-hidden shadow-card aspect-[16/9] sm:aspect-[2/1] lg:aspect-[5/2]"
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
            >
              <motion.span
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={springBouncy}
                className="inline-flex items-center gap-2 rounded-full bg-bordo-800 px-6 py-3 font-heading text-xs uppercase tracking-editorial text-white hover:bg-bordo-900 transition-colors"
              >
                <MapPin className="size-4" />
                Ir con Google Maps
              </motion.span>
            </a>
            <a
              href="https://www.waze.com/ul?ll=-34.8528471,-56.1092333&navigate=yes&zoom=17"
              target="_blank"
              rel="noopener noreferrer"
            >
              <motion.span
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={springBouncy}
                className="inline-flex items-center gap-2 rounded-full border border-bordo-800 px-6 py-3 font-heading text-xs uppercase tracking-editorial text-bordo-800 hover:bg-bordo-800 hover:text-white transition-colors"
              >
                <Navigation className="size-4" />
                Ir con Waze
              </motion.span>
            </a>
          </AnimateOnScroll>
        </div>
      </section>
    </>
  );
}
