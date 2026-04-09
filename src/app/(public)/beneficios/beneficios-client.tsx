"use client";

import { motion } from "framer-motion";
import { HeroSection } from "@/components/shared/hero-section";
import {
  AnimateOnScroll,
  AnimateStaggerGroup,
} from "@/components/shared/animate-on-scroll";
import { fadeInUp, springBouncy } from "@/lib/motion";
import {
  CreditCard,
  GraduationCap,
  Dumbbell,
  Activity,
  Footprints,
  ArrowUpRight,
} from "lucide-react";

const BENEFICIOS = [
  {
    nombre: "UCU",
    descuento: "10% de descuento",
    descripcion: "Universidad Católica del Uruguay — descuento en carreras de grado y posgrado.",
    icon: GraduationCap,
  },
  {
    nombre: "New Balance",
    descuento: "20% de descuento",
    descripcion: "Indumentaria y calzado deportivo en tiendas oficiales.",
    icon: Footprints,
  },
  {
    nombre: "OMNIA Wellness",
    descuento: "Descuentos exclusivos",
    descripcion: "Bienestar integral — planes y sesiones con tarifas preferenciales.",
    icon: Activity,
  },
  {
    nombre: "MS Recovery",
    descuento: "Descuentos exclusivos",
    descripcion: "Recuperación deportiva — crioterapia, masajes y más.",
    icon: Dumbbell,
  },
];

const SPONSORS_MAIN = [
  { nombre: "Renato Conti", logo: "/images/sponsors/logo-rc.png", url: "https://renatoconti.uy/" },
  { nombre: "Itaú", logo: "/images/sponsors/logo-itau.png", url: "https://www.itau.com.uy/inst/" },
  { nombre: "UCU", logo: "/images/sponsors/logo-ucu.png", url: "https://www.ucu.edu.uy/" },
  { nombre: "Summum", logo: "/images/sponsors/logo-summum.png", url: "https://summum.com.uy/" },
];

const SPONSORS_SECONDARY = [
  { nombre: "Zillertal", logo: "/images/sponsors/logo-zillertal.png", url: "https://www.fnc.com.uy/" },
  { nombre: "SUAT", logo: "/images/sponsors/logo-suat.png", url: "https://www.suat.com.uy/" },
  { nombre: "Gatorade", logo: "/images/sponsors/logo-gatorade.png", url: "https://www.gatorade-uruguay.com/" },
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

      {/* ============================================ */}
      {/* CARNET DIGITAL — Premium card showcase       */}
      {/* ============================================ */}
      <section className="py-16 sm:py-24 bg-fondo">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimateOnScroll variant="scaleIn">
            <div className="relative overflow-hidden rounded-none sm:rounded-sm bg-gradient-to-br from-bordo-950 via-bordo-900 to-bordo-800 noise-overlay">
              {/* Decorative elements */}
              <div className="absolute top-0 right-0 w-72 h-72 bg-dorado-400/8 rounded-full blur-3xl translate-x-1/3 -translate-y-1/3" />
              <div className="absolute bottom-0 left-0 w-56 h-56 bg-dorado-400/5 rounded-full blur-3xl -translate-x-1/4 translate-y-1/4" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-bordo-700/20 rounded-full blur-3xl" />

              <div className="relative z-10 grid grid-cols-1 lg:grid-cols-5 gap-0">
                {/* Info */}
                <div className="lg:col-span-3 p-8 sm:p-10 lg:p-14">
                  <motion.span
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                    className="inline-block font-heading uppercase tracking-editorial text-[11px] text-dorado-400/70 mb-6"
                  >
                    Carnet digital
                  </motion.span>
                  <motion.h2
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                    className="font-display text-title-1 sm:text-display uppercase tracking-tightest leading-[0.9] text-white"
                  >
                    Tu tarjeta,
                    <br />
                    <span className="text-dorado-400">siempre con vos</span>
                  </motion.h2>
                  <motion.p
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="mt-5 font-body text-sm leading-relaxed text-white/50 max-w-sm"
                  >
                    Accedé a tu tarjeta de socio digital desde tu cuenta en el
                    sitio web, con código QR único. Presentala desde tu celular
                    para acceder a los descuentos.
                  </motion.p>
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                    className="mt-8 flex flex-wrap gap-4"
                  >
                    {["QR único", "Siempre disponible", "Sin plásticos"].map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-dorado-400/20 text-dorado-300/80 font-heading text-[10px] uppercase tracking-editorial"
                      >
                        <span className="size-1 rounded-full bg-dorado-400" />
                        {tag}
                      </span>
                    ))}
                  </motion.div>
                </div>

                {/* Card mockup */}
                <div className="lg:col-span-2 flex items-center justify-center p-8 sm:p-10 lg:p-12 lg:pl-0">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9, rotateY: -10 }}
                    whileInView={{ opacity: 1, scale: 1, rotateY: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="w-full max-w-[260px] aspect-[3/4.2] rounded-2xl bg-gradient-to-b from-white/10 to-white/[0.03] border border-white/10 backdrop-blur-sm p-5 flex flex-col items-center justify-between shadow-2xl"
                  >
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
                        <motion.div
                          key={i}
                          initial={{ opacity: 0 }}
                          whileInView={{ opacity: 1 }}
                          viewport={{ once: true }}
                          transition={{ delay: 0.4 + i * 0.03 }}
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
                  </motion.div>
                </div>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ============================================ */}
      {/* BENEFICIOS — Premium card grid               */}
      {/* ============================================ */}
      <section className="py-16 sm:py-24 bg-white border-y border-linea">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-10">
            <AnimateOnScroll variant="fadeInUp">
              <span className="font-heading uppercase tracking-editorial text-xs text-bordo-800 block mb-3">
                Convenios activos
              </span>
              <h2 className="font-display text-title-2 sm:text-title-1 uppercase tracking-tightest text-foreground">
                Nuestros beneficios
              </h2>
            </AnimateOnScroll>
          </div>

          <AnimateStaggerGroup className="grid grid-cols-1 sm:grid-cols-2 gap-[2px] sm:gap-4">
            {BENEFICIOS.map((b, idx) => (
              <motion.div
                key={b.nombre}
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
                      <b.icon className="size-6 text-bordo-800 group-hover:text-dorado-300 transition-colors duration-500" />
                    </motion.div>
                    <div className="pt-1">
                      <h3 className="font-display text-lg uppercase tracking-tightest text-foreground group-hover:text-white leading-tight transition-colors duration-500">
                        {b.nombre}
                      </h3>
                      <p className="font-body text-sm text-muted-foreground group-hover:text-white/50 mt-1 transition-colors duration-500">
                        {b.descripcion}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-linea group-hover:border-white/10 pt-4 flex items-center justify-between transition-colors duration-500">
                    <span className="inline-flex items-center gap-2 font-heading text-sm font-semibold text-bordo-800 group-hover:text-dorado-300 transition-colors duration-500">
                      <span className="size-1.5 rounded-full bg-dorado-500 group-hover:bg-dorado-300" />
                      {b.descuento}
                    </span>
                    <div className="size-8 rounded-full border border-bordo-800/10 group-hover:border-dorado-300/30 group-hover:bg-dorado-300/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                      <ArrowUpRight className="size-3.5 text-dorado-300" />
                    </div>
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

          <AnimateOnScroll variant="fadeInUp" delay={0.4} className="mt-6 text-center">
            <p className="font-body text-xs text-muted-foreground">
              Presentá tu tarjeta de socio y documento de identidad para acceder a los descuentos.
            </p>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ============================================ */}
      {/* SPONSORS — Logo showcase                     */}
      {/* ============================================ */}
      <section className="py-16 sm:py-24 bg-fondo">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-10">
            <AnimateOnScroll variant="fadeInUp">
              <span className="font-heading uppercase tracking-editorial text-xs text-bordo-800 block mb-3">
                Sponsors
              </span>
              <h2 className="font-display text-title-2 sm:text-title-1 uppercase tracking-tightest text-foreground">
                Nos acompañan
              </h2>
            </AnimateOnScroll>
          </div>

          {/* Main sponsors */}
          <AnimateStaggerGroup className="flex flex-wrap items-center justify-center gap-10 sm:gap-16 mb-12">
            {SPONSORS_MAIN.map((s) => (
              <motion.a
                key={s.nombre}
                variants={fadeInUp}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.05 }}
                transition={springBouncy}
              >
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

          {/* Divider */}
          <div className="w-24 h-px bg-bordo-800/10 mx-auto mb-12" />

          {/* Secondary sponsors */}
          <AnimateStaggerGroup className="flex flex-wrap items-center justify-center gap-8 sm:gap-12">
            {SPONSORS_SECONDARY.map((s) => (
              <motion.a
                key={s.nombre}
                variants={fadeInUp}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                whileHover={{ scale: 1.05 }}
                transition={springBouncy}
              >
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
