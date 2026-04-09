"use client";

import { HeroSection } from "@/components/shared/hero-section";
import {
  AnimateStaggerGroup,
} from "@/components/shared/animate-on-scroll";
import { motion } from "framer-motion";
import { fadeInUp, springBouncy } from "@/lib/motion";
import { CreditCard, Users, ArrowRight } from "lucide-react";

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
          <AnimateStaggerGroup className="grid grid-cols-1 md:grid-cols-2 gap-[2px] md:gap-4">
            {/* Socio Colaborador */}
            <motion.div
              variants={fadeInUp}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="group bg-white border border-bordo-800/10 relative flex flex-col"
            >

              <div className="p-6 sm:p-8 flex flex-col flex-1">
                <div className="flex items-start gap-4 mb-6">
                  <div className="size-12 bg-bordo-800/5 flex items-center justify-center shrink-0 border border-bordo-800/5">
                    <CreditCard className="size-6 text-bordo-800" />
                  </div>
                  <div>
                    <h3 className="font-display text-sm md:text-base uppercase leading-tight text-bordo-950">
                      Socio Colaborador
                    </h3>
                    <p className="mt-1 font-body text-sm text-muted-foreground">
                      Tarjeta de membresía + beneficios
                    </p>
                  </div>
                </div>

                <div className="mb-6">
                  <span className="font-bold text-[22px] sm:text-2xl text-bordo-800 leading-none">
                    $510
                  </span>
                  <span className="font-body text-sm text-bordo-800/50 ml-1">
                    /mes
                  </span>
                </div>

                <ul className="space-y-2.5 mb-8 border-t border-dashed border-bordo-800/15 pt-6">
                  {[
                    "Tarjeta de membresía personalizada",
                    "Descuentos del 5% al 50%",
                    "Acceso a eventos exclusivos",
                    "Parte de la comunidad del club",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-center gap-2.5 font-body text-sm text-foreground"
                    >
                      <span className="size-1.5 rounded-full bg-bordo-800 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto">
                  <a href="https://forms.gle/S672snEbvEPWgfHm9" target="_blank" rel="noopener noreferrer">
                    <motion.span
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      transition={springBouncy}
                      className="w-full inline-flex items-center justify-center gap-2 bg-bordo-950 px-6 py-3 font-display text-[10px] md:text-xs uppercase tracking-wider text-white hover:bg-bordo-800 transition-colors duration-300"
                    >
                      Quiero ser socio
                      <ArrowRight className="size-4" />
                    </motion.span>
                  </a>
                </div>
              </div>
            </motion.div>

            {/* Socio Deportivo */}
            <motion.div
              variants={fadeInUp}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="group bg-white border border-bordo-800/5 flex flex-col"
            >
              <div className="p-6 sm:p-8 flex flex-col flex-1">
                <div className="flex items-start gap-4 mb-6">
                  <div className="size-12 bg-superficie flex items-center justify-center shrink-0 border border-bordo-800/5">
                    <Users className="size-6 text-foreground/60" />
                  </div>
                  <div>
                    <h3 className="font-display text-sm md:text-base uppercase leading-tight text-bordo-950">
                      Socio Deportivo
                    </h3>
                    <p className="mt-1 font-body text-sm text-muted-foreground">
                      Para participantes de disciplinas deportivas
                    </p>
                  </div>
                </div>

                <div className="mb-6">
                  <span className="font-display text-sm uppercase tracking-wider text-foreground/40">
                    Contactar coordinador
                  </span>
                </div>

                <ul className="space-y-2.5 mb-8 border-t border-dashed border-bordo-800/15 pt-6">
                  {[
                    "Participación en tu disciplina",
                    "Entrenamientos y competencias",
                    "Uso de instalaciones deportivas",
                    "Comunidad y compañerismo",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-center gap-2.5 font-body text-sm text-foreground"
                    >
                      <span className="size-1.5 rounded-full bg-bordo-800/20 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto">
                  <a href="mailto:secretaria@clubseminario.com.uy">
                    <motion.span
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      transition={springBouncy}
                      className="w-full inline-flex items-center justify-center gap-2 border border-dashed border-bordo-800/15 px-6 py-3 font-display text-[10px] md:text-xs uppercase tracking-wider text-bordo-950 hover:bg-superficie transition-colors duration-300"
                    >
                      Consultar
                    </motion.span>
                  </a>
                </div>
              </div>
            </motion.div>
          </AnimateStaggerGroup>
        </div>
      </section>

    </>
  );
}
