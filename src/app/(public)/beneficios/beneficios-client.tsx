"use client";

import { HeroSection } from "@/components/shared/hero-section";
import { SectionHeader } from "@/components/shared/section-header";
import {
  AnimateOnScroll,
  AnimateStaggerGroup,
} from "@/components/shared/animate-on-scroll";
import { motion } from "framer-motion";
import { fadeInUp, springBouncy } from "@/lib/motion";
import {
  CreditCard,
  Utensils,
  UtensilsCrossed,
  Car,
  Laptop,
  Heart,
  Hotel,
  Shirt,
  Sparkles,
  Dumbbell,
  PawPrint,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

const DISCOUNT_CATEGORIES = [
  { name: "Gastronomía", icon: Utensils },
  { name: "Automotor", icon: Car },
  { name: "Catering", icon: UtensilsCrossed },
  { name: "Tecnología", icon: Laptop },
  { name: "Veterinaria", icon: PawPrint },
  { name: "Hotelería", icon: Hotel },
  { name: "Indumentaria", icon: Shirt },
  { name: "Bienestar", icon: Heart },
  { name: "Estética", icon: Sparkles },
  { name: "Deportes", icon: Dumbbell },
];

const SPONSORS_PRINCIPALES = [
  { nombre: "Renato Conti", logo: "/images/sponsors/logo-rc.png" },
  { nombre: "Itaú", logo: "/images/sponsors/logo-itau.png" },
  { nombre: "UCU", logo: "/images/sponsors/logo-ucu.png" },
  { nombre: "Summum", logo: "/images/sponsors/logo-summum.png" },
];
const SPONSORS_SECUNDARIOS = [
  { nombre: "Zillertal", logo: "/images/sponsors/logo-zillertal.png" },
  { nombre: "SUAT", logo: "/images/sponsors/logo-suat.png" },
  { nombre: "Gatorade", logo: "/images/sponsors/logo-gatorade.png" },
];

export function BeneficiosClient() {
  return (
    <>
      <HeroSection
        title="Tus ventajas como socio"
        eyebrow="Beneficios"
        subtitle="Descuentos exclusivos del 5% al 50% en múltiples categorías con tu tarjeta de membresía."
        backgroundImage="/images/club/foto-beneficios.webp"
        variant="full"
      />

      {/* Membership card */}
      <section className="py-16 sm:py-24 bg-fondo">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <AnimateOnScroll variant="scaleIn">
            <div className="bg-gradient-to-br from-bordo-950 to-bordo-800 rounded-2xl p-8 sm:p-12 text-white relative overflow-hidden noise-overlay">
              <div className="relative z-10">
                <div className="flex items-start gap-4 mb-6">
                  <CreditCard className="size-8 text-dorado-300 shrink-0" />
                  <div>
                    <h2 className="font-display text-title-2 uppercase tracking-tightest">
                      Tarjeta de membresía
                    </h2>
                    <p className="mt-2 font-body text-sm text-white/60 max-w-lg">
                      Cada socio recibe una tarjeta personalizada con nombre,
                      apellido y cédula de identidad. Es intransferible y
                      requiere presentación de documento para acceder a los
                      descuentos.
                    </p>
                  </div>
                </div>
                <div className="mt-8 p-6 bg-white/5 rounded-xl border border-white/10">
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-display tracking-tightest text-dorado-300">
                      5–50%
                    </span>
                    <span className="font-body text-sm text-white/50">
                      de descuento
                    </span>
                  </div>
                  <p className="mt-2 font-body text-sm text-white/40">
                    En gastronomía, automotor, catering, tecnología, veterinaria,
                    hotelería, indumentaria, bienestar, estética y deportes.
                  </p>
                </div>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* Discount categories */}
      <section className="py-16 sm:py-20 bg-superficie border-t border-linea">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Categorías"
            title="Descuentos en"
            description="Presentá tu tarjeta y documento de identidad para acceder a los beneficios."
          />

          <AnimateStaggerGroup className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {DISCOUNT_CATEGORIES.map((cat) => (
              <motion.div
                key={cat.name}
                variants={fadeInUp}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="bg-white rounded-xl p-5 shadow-card hover:shadow-card-hover transition-shadow duration-300 flex items-center gap-3"
              >
                <div className="size-10 rounded-lg bg-bordo-50 flex items-center justify-center shrink-0">
                  <cat.icon className="size-5 text-bordo-800" />
                </div>
                <span className="font-heading text-sm font-medium text-foreground">
                  {cat.name}
                </span>
              </motion.div>
            ))}
          </AnimateStaggerGroup>

          <AnimateOnScroll variant="fadeInUp" delay={0.2} className="mt-8 text-center">
            <p className="font-body text-sm text-muted-foreground italic">
              Se está trabajando activamente en la actualización y obtención de
              nuevos beneficios.
            </p>
          </AnimateOnScroll>
        </div>
      </section>

      {/* Sponsors */}
      <section className="py-16 sm:py-20 bg-fondo border-t border-linea">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Partners"
            title="Nos acompañan"
          />

          <AnimateStaggerGroup className="flex flex-wrap items-center justify-center gap-10 sm:gap-16 mb-10">
            {SPONSORS_PRINCIPALES.map((s) => (
              <motion.div
                key={s.nombre}
                variants={fadeInUp}
              >
                <div
                  role="img"
                  aria-label={s.nombre}
                  className="h-10 sm:h-14 w-28 sm:w-40 sponsor-logo opacity-60 hover:opacity-100 transition-opacity duration-300"
                  style={{ "--logo-src": `url(${s.logo})` } as React.CSSProperties}
                />
              </motion.div>
            ))}
          </AnimateStaggerGroup>

          <AnimateStaggerGroup className="flex flex-wrap items-center justify-center gap-8 sm:gap-12">
            {SPONSORS_SECUNDARIOS.map((s) => (
              <motion.div
                key={s.nombre}
                variants={fadeInUp}
              >
                <div
                  role="img"
                  aria-label={s.nombre}
                  className="h-7 sm:h-10 w-24 sm:w-32 sponsor-logo opacity-40 hover:opacity-80 transition-opacity duration-300"
                  style={{ "--logo-src": `url(${s.logo})` } as React.CSSProperties}
                />
              </motion.div>
            ))}
          </AnimateStaggerGroup>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-20 bg-superficie border-t border-linea">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 text-center">
          <AnimateOnScroll variant="scaleIn">
            <h2 className="font-display text-title-2 uppercase tracking-tightest text-foreground mb-4">
              ¿Todavía no sos socio?
            </h2>
            <p className="font-body text-sm text-muted-foreground mb-6">
              Por $480/mes accedé a todos estos beneficios y formá parte de la
              comunidad del Club Seminario.
            </p>
            <Link href="/socios">
              <motion.span
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={springBouncy}
                className="inline-flex items-center gap-2 rounded-full bg-bordo-800 px-7 py-3.5 font-heading text-xs uppercase tracking-editorial text-white hover:bg-bordo-900 transition-colors"
              >
                Hacete socio
                <ArrowRight className="size-4" />
              </motion.span>
            </Link>
          </AnimateOnScroll>
        </div>
      </section>
    </>
  );
}
