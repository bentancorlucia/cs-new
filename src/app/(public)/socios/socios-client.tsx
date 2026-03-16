"use client";

import { HeroSection } from "@/components/shared/hero-section";
import {
  AnimateStaggerGroup,
} from "@/components/shared/animate-on-scroll";
import { motion } from "framer-motion";
import { fadeInUp, springBouncy } from "@/lib/motion";
import { CreditCard, Users, ArrowRight } from "lucide-react";
import Link from "next/link";

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
                  $510
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

    </>
  );
}
