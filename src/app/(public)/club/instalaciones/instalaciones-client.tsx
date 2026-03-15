"use client";

import { HeroSection } from "@/components/shared/hero-section";
import {
  AnimateOnScroll,
  AnimateStaggerGroup,
} from "@/components/shared/animate-on-scroll";
import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/motion";
import { MapPin } from "lucide-react";

const SEDES = [
  {
    nombre: "Parque CUPRA",
    direccion: "Cochabamba 2882",
    detalles: [
      "2 canchas de rugby (1 iluminada)",
      "5 canchas de fútbol (3 iluminadas)",
      "1 cancha de fútbol 8",
    ],
    principal: true,
  },
  {
    nombre: "Polideportivo Gonzaga",
    direccion: null,
    detalles: [
      "Básquetbol",
      "Mami Fútbol",
      "Vóleibol",
      "Handball",
    ],
    principal: false,
  },
  {
    nombre: "Parque Loyola",
    direccion: null,
    detalles: ["Hockey", "Handball"],
    principal: false,
  },
];

export function InstalacionesClient() {
  return (
    <>
      <HeroSection
        title="Instalaciones"
        eyebrow="El Club"
        subtitle="Nuestros espacios deportivos para la práctica y la competencia."
        backgroundImage="/images/instalaciones/foto-cupra.webp"
        variant="full"
      />

      <section className="py-16 sm:py-24 bg-fondo">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimateStaggerGroup className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {SEDES.map((sede) => (
              <motion.div
                key={sede.nombre}
                variants={fadeInUp}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className={`rounded-2xl p-6 sm:p-8 shadow-card hover:shadow-card-hover transition-shadow duration-300 ${
                  sede.principal
                    ? "bg-bordo-950 text-white md:col-span-3 lg:col-span-1"
                    : "bg-white"
                }`}
              >
                <div className="flex items-start gap-3 mb-4">
                  <MapPin
                    className={`size-5 shrink-0 mt-0.5 ${
                      sede.principal ? "text-dorado-300" : "text-bordo-800"
                    }`}
                  />
                  <div>
                    <h3
                      className={`font-display text-title-3 uppercase tracking-tightest ${
                        sede.principal ? "text-white" : "text-foreground"
                      }`}
                    >
                      {sede.nombre}
                    </h3>
                    {sede.direccion && (
                      <p
                        className={`mt-1 font-body text-sm ${
                          sede.principal ? "text-white/60" : "text-muted-foreground"
                        }`}
                      >
                        {sede.direccion}
                      </p>
                    )}
                  </div>
                </div>

                <ul className="space-y-2 mt-4">
                  {sede.detalles.map((detalle) => (
                    <li
                      key={detalle}
                      className={`flex items-center gap-2 font-body text-sm ${
                        sede.principal ? "text-white/70" : "text-muted-foreground"
                      }`}
                    >
                      <span
                        className={`size-1.5 rounded-full shrink-0 ${
                          sede.principal ? "bg-dorado-300" : "bg-bordo-800"
                        }`}
                      />
                      {detalle}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </AnimateStaggerGroup>

          {/* Quote */}
          <AnimateOnScroll variant="blurIn" className="mt-16">
            <div className="bg-superficie rounded-2xl p-8 sm:p-12 text-center">
              <blockquote className="font-heading text-title-3 text-foreground/80 italic max-w-2xl mx-auto">
                &ldquo;Estamos mejorando en forma constante el CUPRA para
                hacerlo un lugar cada vez más cómodo, amigable y completo para
                nuestros deportistas.&rdquo;
              </blockquote>
            </div>
          </AnimateOnScroll>
        </div>
      </section>
    </>
  );
}
