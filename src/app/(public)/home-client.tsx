"use client";

import { HeroSection } from "@/components/shared/hero-section";
import { SectionHeader } from "@/components/shared/section-header";
import { SportCard } from "@/components/shared/sport-card";
import { StatsCard } from "@/components/shared/stats-card";
import {
  AnimateOnScroll,
  AnimateStaggerGroup,
} from "@/components/shared/animate-on-scroll";
import Link from "next/link";
import { motion } from "framer-motion";
import { staggerContainer, fadeInUp } from "@/lib/motion";
import { ArrowRight } from "lucide-react";

const DEPORTES = [
  { nombre: "Rugby", slug: "rugby", imagen: "/images/deportes/Rugby.jpg" },
  { nombre: "Hockey", slug: "hockey", imagen: "/images/deportes/Hockey.jpg" },
  { nombre: "Fútbol", slug: "futbol", imagen: "/images/deportes/foto-futfem.webp" },
  { nombre: "Handball", slug: "handball", imagen: "/images/deportes/hb-masculino.jpg" },
  { nombre: "Básquetbol", slug: "basquetbol", imagen: "/images/deportes/PapiBasket.JPG" },
  { nombre: "Vóleibol", slug: "voley", imagen: "/images/deportes/Papivolley.jpeg" },
  { nombre: "Corredores", slug: "corredores", imagen: "/images/deportes/Corredores.jpg" },
];

const SPONSORS_PRINCIPALES = [
  { nombre: "Renato Conti", logo: "/images/sponsors/logo-rc.png", url: "https://renatoconti.uy/" },
  { nombre: "Itaú", logo: "/images/sponsors/logo-itau.png", url: "https://www.itau.com.uy/inst/" },
  { nombre: "UCU", logo: "/images/sponsors/logo-ucu.png", url: "https://www.ucu.edu.uy/" },
  { nombre: "Summum", logo: "/images/sponsors/logo-summum.png", url: "https://summum.com.uy/" },
];
const SPONSORS_SECUNDARIOS = [
  { nombre: "Zillertal", logo: "/images/sponsors/logo-zillertal.png", url: "https://www.fnc.com.uy/" },
  { nombre: "SUAT", logo: "/images/sponsors/logo-suat.png", url: "https://www.suat.com.uy/" },
  { nombre: "Gatorade", logo: "/images/sponsors/logo-gatorade.png", url: "https://www.gatorade-uruguay.com/" },
];

export function HomeClient() {
  return (
    <>
      {/* Hero */}
      <HeroSection
        title="Club Seminario"
        subtitle="Club deportivo, social y cultural que reúne a la comunidad jesuita en Uruguay"
        cta={{ label: "Hacete socio", href: "/socios" }}
        secondaryCta={{ label: "Conocé más", href: "/club/quienes-somos" }}
        backgroundVideo="/images/hero/video-inicio-15-reducido.mp4"
        variant="full"
      />

      {/* Quiénes somos — versión compacta + Stats */}
      <section className="py-16 sm:py-24 bg-fondo">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14 items-center">
            <div>
              <AnimateOnScroll variant="fadeInUp">
                <span className="font-heading uppercase tracking-editorial text-xs text-bordo-800 block mb-2">
                  Desde 2010
                </span>
                <p className="font-body text-base leading-relaxed text-muted-foreground">
                  Club Seminario nuclea a la comunidad jesuita en Uruguay — exalumnos, padres y madres del Colegio Seminario unidos por los valores ignacianos y el deporte. Más de 1.000 socios compitiendo en 22 categorías.
                </p>
              </AnimateOnScroll>
              <AnimateOnScroll variant="fadeInUp" delay={0.1}>
                <Link
                  href="/club/quienes-somos"
                  className="inline-flex items-center gap-1.5 mt-4 font-heading uppercase tracking-editorial text-xs text-bordo-800 hover:text-bordo-900 transition-colors group"
                >
                  Conocé nuestra historia
                  <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </AnimateOnScroll>
            </div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={staggerContainer}
              className="grid grid-cols-2 gap-4"
            >
              <StatsCard value={1000} suffix="+" label="Socios" />
              <StatsCard value={22} label="Categorías" />
              <StatsCard value={600} suffix="+" label="Partidos al año" />
              <StatsCard value={7} label="Disciplinas" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Visión & Misión — compact strip */}
      <section className="py-14 sm:py-16 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-10 items-stretch">
            <AnimateOnScroll variant="fadeInUp" className="h-full">
              <div className="pl-5 border-l-[3px] border-bordo-800 h-full">
                <h3 className="font-heading uppercase tracking-editorial text-xs text-bordo-800 mb-2">
                  Visión
                </h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Un club que une a todas las personas vinculadas a los jesuitas en Uruguay, llevando a cada deporte la espiritualidad ignaciana.
                </p>
              </div>
            </AnimateOnScroll>

            <AnimateOnScroll variant="fadeInUp" delay={0.08} className="h-full">
              <div className="pl-5 border-l-[3px] border-dorado-400 h-full">
                <h3 className="font-heading uppercase tracking-editorial text-xs text-bordo-800 mb-2">
                  Misión
                </h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Ser competitivos deportivamente, reconocidos por jugar limpio y promover el deporte como estrategia educativa y de integración.
                </p>
              </div>
            </AnimateOnScroll>

            <AnimateOnScroll variant="fadeInUp" delay={0.16} className="h-full">
              <div className="pl-5 border-l-[3px] border-bordo-800/30 h-full">
                <h3 className="font-heading uppercase tracking-editorial text-xs text-bordo-800 mb-2">
                  Valores
                </h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Deporte, actividades culturales y sociales que fortalecen los valores cristianos para la formación integral de las personas.
                </p>
              </div>
            </AnimateOnScroll>
          </div>
        </div>
      </section>

      {/* Deportes */}
      <section className="py-16 sm:py-24 bg-gradient-to-b from-bordo-800/[0.03] via-fondo to-bordo-800/[0.03]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Nuestras disciplinas"
            title="El deporte nos une"
            description="Más de 600 partidos anuales a través de LUD, ADIC, URU, AUF, FUHC y la Asociación Uruguaya de Handball."
          />

          <AnimateStaggerGroup className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {DEPORTES.map((deporte) => (
              <SportCard
                key={deporte.slug}
                nombre={deporte.nombre}
                slug={deporte.slug}
                imagen={deporte.imagen}
              />
            ))}
          </AnimateStaggerGroup>
        </div>
      </section>

      {/* Sponsors */}
      <section className="py-16 sm:py-20 bg-fondo">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimateOnScroll variant="fadeInUp">
            <p className="text-center font-heading uppercase tracking-editorial text-xs text-muted-foreground mb-8">
              Nos acompañan
            </p>
          </AnimateOnScroll>

          {/* Sponsors principales */}
          <AnimateStaggerGroup className="flex flex-wrap items-center justify-center gap-10 sm:gap-16 mb-8">
            {SPONSORS_PRINCIPALES.map((sponsor) => (
              <motion.a
                key={sponsor.nombre}
                variants={fadeInUp}
                href={sponsor.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <div
                  role="img"
                  aria-label={sponsor.nombre}
                  className="h-10 sm:h-14 w-28 sm:w-40 sponsor-logo opacity-60 hover:opacity-100 transition-opacity duration-300"
                  style={{ "--logo-src": `url(${sponsor.logo})` } as React.CSSProperties}
                />
              </motion.a>
            ))}
          </AnimateStaggerGroup>

          {/* Sponsors secundarios */}
          <AnimateStaggerGroup className="flex flex-wrap items-center justify-center gap-8 sm:gap-12">
            {SPONSORS_SECUNDARIOS.map((sponsor) => (
              <motion.a
                key={sponsor.nombre}
                variants={fadeInUp}
                href={sponsor.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <div
                  role="img"
                  aria-label={sponsor.nombre}
                  className="h-7 sm:h-10 w-24 sm:w-32 sponsor-logo opacity-40 hover:opacity-80 transition-opacity duration-300"
                  style={{ "--logo-src": `url(${sponsor.logo})` } as React.CSSProperties}
                />
              </motion.a>
            ))}
          </AnimateStaggerGroup>
        </div>
      </section>

    </>
  );
}
