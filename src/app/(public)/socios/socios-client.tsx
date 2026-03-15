"use client";

import { HeroSection } from "@/components/shared/hero-section";
import {
  AnimateOnScroll,
  AnimateStaggerGroup,
} from "@/components/shared/animate-on-scroll";
import { motion } from "framer-motion";
import { fadeInUp, springBouncy } from "@/lib/motion";
import { CreditCard, Users, ArrowRight, Phone, Mail, MapPin, Clock } from "lucide-react";
import Link from "next/link";

const BENEFIT_CATEGORIES = [
  "Gastronomía",
  "Automotor",
  "Catering",
  "Tecnología",
  "Veterinaria",
  "Hotelería",
  "Indumentaria",
  "Bienestar",
  "Estética",
  "Deportes",
];

export function SociosClient() {
  return (
    <>
      <HeroSection
        title="Formá parte del club"
        eyebrow="Socios"
        subtitle="Sumate a la comunidad del Club Seminario y accedé a beneficios exclusivos."
        backgroundImage="/images/club/foto-socios.webp"
        variant="full"
      />

      {/* Membership types */}
      <section className="py-16 sm:py-24 bg-fondo">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <AnimateStaggerGroup className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Socio Colaborador */}
            <motion.div
              variants={fadeInUp}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white rounded-2xl p-8 shadow-card hover:shadow-card-hover transition-shadow duration-300 ring-2 ring-bordo-800 relative"
            >
              <span className="absolute -top-3 left-6 bg-bordo-800 text-white font-heading text-[11px] uppercase tracking-editorial px-3 py-1 rounded-full">
                Popular
              </span>
              <div className="flex items-start gap-4 mb-6">
                <div className="size-12 rounded-xl bg-bordo-50 flex items-center justify-center shrink-0">
                  <CreditCard className="size-6 text-bordo-800" />
                </div>
                <div>
                  <h3 className="font-display text-title-3 uppercase tracking-tightest text-foreground">
                    Socio Colaborador
                  </h3>
                  <p className="mt-1 font-body text-sm text-muted-foreground">
                    Tarjeta de membresía + beneficios
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <span className="font-display text-hero tracking-tightest text-bordo-800">
                  $480
                </span>
                <span className="font-body text-sm text-muted-foreground ml-1">
                  /mes
                </span>
              </div>

              <ul className="space-y-2 mb-8">
                {[
                  "Tarjeta de membresía personalizada",
                  "Descuentos del 5% al 50%",
                  "Acceso a eventos exclusivos",
                  "Parte de la comunidad del club",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-2 font-body text-sm text-foreground"
                  >
                    <span className="size-1.5 rounded-full bg-bordo-800 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>

              <Link href="/registro">
                <motion.span
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  transition={springBouncy}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-bordo-800 px-6 py-3 font-heading text-xs uppercase tracking-editorial text-white hover:bg-bordo-900 transition-colors"
                >
                  Quiero ser socio
                  <ArrowRight className="size-4" />
                </motion.span>
              </Link>
            </motion.div>

            {/* Socio Deportivo */}
            <motion.div
              variants={fadeInUp}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white rounded-2xl p-8 shadow-card hover:shadow-card-hover transition-shadow duration-300"
            >
              <div className="flex items-start gap-4 mb-6">
                <div className="size-12 rounded-xl bg-superficie flex items-center justify-center shrink-0">
                  <Users className="size-6 text-foreground/60" />
                </div>
                <div>
                  <h3 className="font-display text-title-3 uppercase tracking-tightest text-foreground">
                    Socio Deportivo
                  </h3>
                  <p className="mt-1 font-body text-sm text-muted-foreground">
                    Para participantes de disciplinas deportivas
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <span className="font-heading text-title-2 text-foreground/60">
                  Contactar coordinador
                </span>
              </div>

              <ul className="space-y-2 mb-8">
                {[
                  "Participación en tu disciplina",
                  "Entrenamientos y competencias",
                  "Uso de instalaciones deportivas",
                  "Comunidad y compañerismo",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-2 font-body text-sm text-foreground"
                  >
                    <span className="size-1.5 rounded-full bg-linea shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>

              <a href="mailto:secretaria@clubseminario.com.uy">
                <motion.span
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  transition={springBouncy}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-linea px-6 py-3 font-heading text-xs uppercase tracking-editorial text-foreground hover:bg-superficie transition-colors"
                >
                  Consultar
                </motion.span>
              </a>
            </motion.div>
          </AnimateStaggerGroup>
        </div>
      </section>

      {/* Benefits preview */}
      <section className="py-16 sm:py-20 bg-superficie border-t border-linea">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center">
          <AnimateOnScroll variant="fadeInUp">
            <span className="font-heading uppercase tracking-editorial text-xs text-bordo-800 block mb-3">
              Beneficios
            </span>
            <h2 className="font-display text-title-2 uppercase tracking-tightest text-foreground mb-4">
              Descuentos del 5% al 50%
            </h2>
            <p className="font-body text-sm text-muted-foreground mb-8 max-w-lg mx-auto">
              Tu tarjeta de membresía te da acceso a descuentos en múltiples
              categorías.
            </p>
          </AnimateOnScroll>

          <AnimateStaggerGroup className="flex flex-wrap justify-center gap-2">
            {BENEFIT_CATEGORIES.map((cat) => (
              <motion.span
                key={cat}
                variants={fadeInUp}
                className="inline-flex items-center rounded-full bg-white px-4 py-2 font-body text-sm text-foreground shadow-card"
              >
                {cat}
              </motion.span>
            ))}
          </AnimateStaggerGroup>

          <AnimateOnScroll variant="fadeInUp" delay={0.3}>
            <Link href="/beneficios" className="inline-block mt-8">
              <motion.span
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={springBouncy}
                className="inline-flex items-center gap-2 font-heading text-xs uppercase tracking-editorial text-bordo-800 hover:text-bordo-900"
              >
                Ver todos los beneficios
                <ArrowRight className="size-4" />
              </motion.span>
            </Link>
          </AnimateOnScroll>
        </div>
      </section>

      {/* Contact */}
      <section className="py-12 sm:py-16 bg-fondo border-t border-linea">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <AnimateOnScroll variant="fadeInUp">
            <div className="bg-white rounded-2xl p-8 sm:p-10 shadow-card">
              <h3 className="font-display text-title-3 uppercase tracking-tightest text-foreground mb-6 text-center">
                Contacto Secretaría
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
                <a
                  href="tel:099613671"
                  className="flex items-center gap-3 font-body text-sm text-muted-foreground hover:text-bordo-800 transition-colors"
                >
                  <Phone className="size-4 text-bordo-800 shrink-0" />
                  099 613 671
                </a>
                <a
                  href="mailto:secretaria@clubseminario.com.uy"
                  className="flex items-center gap-3 font-body text-sm text-muted-foreground hover:text-bordo-800 transition-colors"
                >
                  <Mail className="size-4 text-bordo-800 shrink-0" />
                  secretaria@clubseminario.com.uy
                </a>
                <span className="flex items-center gap-3 font-body text-sm text-muted-foreground">
                  <MapPin className="size-4 text-bordo-800 shrink-0" />
                  Soriano 1472, Colegio Seminario
                </span>
                <span className="flex items-center gap-3 font-body text-sm text-muted-foreground">
                  <Clock className="size-4 text-bordo-800 shrink-0" />
                  Mar, Jue, Vie de 10 a 13 hs
                </span>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>
    </>
  );
}
