"use client";

import { HeroSection } from "@/components/shared/hero-section";
import { SectionHeader } from "@/components/shared/section-header";
import {
  AnimateOnScroll,
  AnimateStaggerGroup,
} from "@/components/shared/animate-on-scroll";
import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/motion";
import {
  CreditCard,
  GraduationCap,
  Dumbbell,
  Activity,
  Footprints,
} from "lucide-react";


const BENEFICIOS = [
  {
    nombre: "UCU",
    descuento: "10% de descuento",
    icon: GraduationCap,
  },
  {
    nombre: "New Balance",
    descuento: "20% de descuento",
    icon: Footprints,
  },
  {
    nombre: "OMNIA Wellness",
    descuento: "Descuentos exclusivos",
    icon: Activity,
  },
  {
    nombre: "MS Recovery",
    descuento: "Descuentos exclusivos",
    icon: Dumbbell,
  },
];

export function BeneficiosClient() {
  return (
    <>
      <HeroSection
        title="Beneficios para socios"
        eyebrow="Beneficios"
        subtitle="Descuentos exclusivos para miembros del Club Seminario con tu tarjeta de membresía."
        backgroundImage="/images/club/foto-beneficios.webp"
        variant="full"
      />

      {/* Carnet digital */}
      <section className="py-16 sm:py-24 bg-fondo">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <AnimateOnScroll variant="scaleIn">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-bordo-950 via-bordo-900 to-bordo-800 noise-overlay">
              {/* Decorative elements */}
              <div className="absolute top-0 right-0 w-72 h-72 bg-dorado-400/8 rounded-full blur-3xl translate-x-1/3 -translate-y-1/3" />
              <div className="absolute bottom-0 left-0 w-56 h-56 bg-dorado-400/5 rounded-full blur-3xl -translate-x-1/4 translate-y-1/4" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-bordo-700/20 rounded-full blur-3xl" />

              <div className="relative z-10 grid grid-cols-1 lg:grid-cols-5 gap-0">
                {/* Info */}
                <div className="lg:col-span-3 p-8 sm:p-10 lg:p-12">
                  <span className="inline-block font-heading uppercase tracking-editorial text-[11px] text-dorado-400/70 mb-6">
                    Carnet digital
                  </span>
                  <h2 className="font-display text-title-1 sm:text-display uppercase tracking-tightest leading-[0.9] text-white">
                    Tu tarjeta,
                    <br />
                    <span className="text-dorado-400">siempre con vos</span>
                  </h2>
                  <p className="mt-5 font-body text-sm leading-relaxed text-white/50 max-w-sm">
                    Accedé a tu tarjeta de socio digital desde tu cuenta en el
                    sitio web, con código QR único. Presentala desde tu celular
                    para acceder a los descuentos.
                  </p>
                </div>

                {/* Card mockup */}
                <div className="lg:col-span-2 flex items-center justify-center p-8 sm:p-10 lg:p-12 lg:pl-0">
                  <div className="w-full max-w-[260px] aspect-[3/4.2] rounded-2xl bg-gradient-to-b from-white/10 to-white/[0.03] border border-white/10 backdrop-blur-sm p-5 flex flex-col items-center justify-between shadow-2xl">
                    {/* Club badge */}
                    <div className="text-center">
                      <div className="size-12 mx-auto rounded-full bg-dorado-400/20 flex items-center justify-center mb-3">
                        <CreditCard className="size-5 text-dorado-300" />
                      </div>
                      <p className="font-display text-xs uppercase tracking-editorial text-white/80">
                        Club Seminario
                      </p>
                      <p className="font-body text-[10px] text-white/30 mt-0.5">
                        Carnet de socio
                      </p>
                    </div>

                    {/* QR placeholder */}
                    <div className="w-24 h-24 rounded-xl bg-white/10 border border-white/10 grid grid-cols-4 grid-rows-4 gap-[3px] p-2.5">
                      {Array.from({ length: 16 }).map((_, i) => (
                        <div
                          key={i}
                          className="rounded-[2px]"
                          style={{
                            backgroundColor:
                              [0, 1, 3, 4, 5, 7, 8, 10, 12, 13, 15].includes(i)
                                ? "rgba(247, 182, 67, 0.5)"
                                : "rgba(255,255,255,0.06)",
                          }}
                        />
                      ))}
                    </div>

                    {/* Name placeholder */}
                    <div className="text-center w-full">
                      <div className="h-2 w-24 mx-auto rounded-full bg-white/10 mb-1.5" />
                      <div className="h-1.5 w-16 mx-auto rounded-full bg-white/5" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* Beneficios grid */}
      <section className="py-16 sm:py-24 bg-superficie border-t border-linea">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Convenios activos"
            title="Nuestros beneficios"
            description="Presentá tu tarjeta de socio y documento de identidad para acceder a los descuentos."
          />

          <AnimateStaggerGroup className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {BENEFICIOS.map((b) => (
              <motion.div
                key={b.nombre}
                variants={fadeInUp}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ y: -4 }}
                className="group relative bg-white rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-500 hover:bg-dorado-400"
              >
                <div className="relative p-6 sm:p-8">
                  <div className="flex items-center gap-4 mb-5">
                    <div className="size-14 rounded-xl bg-bordo-50 group-hover:bg-white/30 flex items-center justify-center shrink-0 transition-colors duration-500">
                      <b.icon className="size-6 text-bordo-800 group-hover:text-bordo-950 transition-colors duration-500" />
                    </div>
                    <h3 className="font-display text-lg uppercase tracking-tightest text-foreground group-hover:text-bordo-950 leading-tight transition-colors duration-500">
                      {b.nombre}
                    </h3>
                  </div>

                  <div className="border-t border-linea group-hover:border-bordo-800/20 pt-4 transition-colors duration-500">
                    <p className="font-heading text-sm font-semibold text-bordo-800 group-hover:text-bordo-950 transition-colors duration-500">
                      {b.descuento}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimateStaggerGroup>

          <AnimateOnScroll
            variant="fadeInUp"
            delay={0.3}
            className="mt-10 text-center"
          >
            <div className="inline-flex items-center gap-2 bg-dorado-100/60 rounded-full px-5 py-2.5">
              <div className="size-2 rounded-full bg-dorado-500 animate-pulse" />
              <p className="font-body text-sm text-bordo-800">
                Se está trabajando en la obtención de nuevos beneficios
              </p>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* Sponsors */}
      <section className="py-16 sm:py-20 bg-fondo border-t border-linea">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <SectionHeader eyebrow="Sponsors" title="Nos acompañan" />

          <AnimateStaggerGroup className="flex flex-wrap items-center justify-center gap-10 sm:gap-16 mb-10">
            {[
              { nombre: "Renato Conti", logo: "/images/sponsors/logo-rc.png", url: "https://renatoconti.uy/" },
              { nombre: "Itaú", logo: "/images/sponsors/logo-itau.png", url: "https://www.itau.com.uy/inst/" },
              { nombre: "UCU", logo: "/images/sponsors/logo-ucu.png", url: "https://www.ucu.edu.uy/" },
              { nombre: "Summum", logo: "/images/sponsors/logo-summum.png", url: "https://summum.com.uy/" },
            ].map((s) => (
              <motion.a key={s.nombre} variants={fadeInUp} href={s.url} target="_blank" rel="noopener noreferrer">
                <div
                  role="img"
                  aria-label={s.nombre}
                  className="h-10 sm:h-14 w-28 sm:w-40 sponsor-logo opacity-60 hover:opacity-100 transition-opacity duration-300"
                  style={
                    { "--logo-src": `url(${s.logo})` } as React.CSSProperties
                  }
                />
              </motion.a>
            ))}
          </AnimateStaggerGroup>

          <AnimateStaggerGroup className="flex flex-wrap items-center justify-center gap-8 sm:gap-12">
            {[
              { nombre: "Zillertal", logo: "/images/sponsors/logo-zillertal.png", url: "https://www.fnc.com.uy/" },
              { nombre: "SUAT", logo: "/images/sponsors/logo-suat.png", url: "https://www.suat.com.uy/" },
              { nombre: "Gatorade", logo: "/images/sponsors/logo-gatorade.png", url: "https://www.gatorade-uruguay.com/" },
            ].map((s) => (
              <motion.a key={s.nombre} variants={fadeInUp} href={s.url} target="_blank" rel="noopener noreferrer">
                <div
                  role="img"
                  aria-label={s.nombre}
                  className="h-7 sm:h-10 w-24 sm:w-32 sponsor-logo opacity-40 hover:opacity-80 transition-opacity duration-300"
                  style={
                    { "--logo-src": `url(${s.logo})` } as React.CSSProperties
                  }
                />
              </motion.a>
            ))}
          </AnimateStaggerGroup>
        </div>
      </section>

    </>
  );
}
