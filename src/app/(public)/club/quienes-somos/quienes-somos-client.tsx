"use client";

import { HeroSection } from "@/components/shared/hero-section";
import { SectionHeader } from "@/components/shared/section-header";
import { StatsCard } from "@/components/shared/stats-card";
import {
  AnimateOnScroll,
} from "@/components/shared/animate-on-scroll";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  staggerContainer,
  springBouncy,
} from "@/lib/motion";
import { ArrowRight } from "lucide-react";

export function QuienesSomosClient() {
  return (
    <>
      {/* Hero */}
      <HeroSection
        title="Quiénes Somos"
        subtitle="Club deportivo, social y cultural que reúne a la comunidad jesuita en Uruguay desde 2010"
        eyebrow="Club Seminario"
        backgroundImage="/images/club/foto-estatuto.webp"
        variant="full"
      />

      {/* Nuestra Historia + Stats */}
      <section className="py-16 sm:py-20 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <AnimateOnScroll variant="fadeInUp">
                <SectionHeader
                  eyebrow="Nuestra historia"
                  title="Desde 2010"
                  align="left"
                />
              </AnimateOnScroll>
              <AnimateOnScroll variant="fadeInUp" delay={0.1}>
                <p className="font-body text-base leading-relaxed text-muted-foreground">
                  Fundado el 13 de mayo de 2010, el Club Seminario nuclea a equipos
                  deportivos de exalumnos, padres y madres del Colegio Seminario que, hasta entonces,
                  funcionaban de forma independiente. Además, dio cabida al nacimiento y la consolidación de nuevas disciplinas deportivas.
                </p>
              </AnimateOnScroll>
              <AnimateOnScroll variant="fadeInUp" delay={0.15}>
                <p className="mt-4 font-body text-base leading-relaxed text-muted-foreground">
                  Nos unen los valores ignacianos, con el denominador común de sentirnos parte de la familia del Colegio Seminario y el orgullo de llevar los lobos de Loyola en nuestras camisetas.
                </p>
              </AnimateOnScroll>
              <AnimateOnScroll variant="fadeInUp" delay={0.2}>
                <p className="mt-4 font-body text-base leading-relaxed text-muted-foreground">
                  A través del deporte ponemos al servicio del otro nuestras habilidades y potencialidades, nos superamos a nosotros mismos, damos nuestro más. Organizamos instancias de colaboración con quien lo necesita, promovemos el deporte como ámbito educativo en realidades de contexto crítico, nos sumamos a campañas del Colegio o la Fundación Jesuitas.
                </p>
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

          <div className="h-px bg-linea my-14 sm:my-16" />

          <AnimateOnScroll variant="fadeInUp">
            <SectionHeader
              eyebrow="Nuestros pilares"
              title="Visión, Misión y Valores"
            />
          </AnimateOnScroll>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12 items-stretch">
            <AnimateOnScroll variant="fadeInUp" className="h-full">
              <div className="pl-5 border-l-[3px] border-bordo-800 h-full">
                <h3 className="font-heading uppercase tracking-editorial text-xs text-bordo-800 mb-3">
                  Visión
                </h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Somos un club deportivo y social que une a todas las personas vinculadas a los jesuitas en Uruguay, que pretenden llevar a cada deporte la espiritualidad ignaciana.
                </p>
              </div>
            </AnimateOnScroll>

            <AnimateOnScroll variant="fadeInUp" delay={0.08} className="h-full">
              <div className="pl-5 border-l-[3px] border-dorado-400 h-full">
                <h3 className="font-heading uppercase tracking-editorial text-xs text-bordo-800 mb-3">
                  Misión
                </h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Trabajamos para ser competitivos deportivamente, reconocidos por nuestro por jugar limpio en todas las canchas y promover el deporte como estrategia educativa, de integración y recreativa.
                </p>
              </div>
            </AnimateOnScroll>

            <AnimateOnScroll variant="fadeInUp" delay={0.16} className="h-full">
              <div className="pl-5 border-l-[3px] border-bordo-800/30 h-full">
                <h3 className="font-heading uppercase tracking-editorial text-xs text-bordo-800 mb-3">
                  Valores
                </h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  Ofrecemos a nuestros asociados un espacio donde practicar deportes, desarrollar actividades culturales y sociales para contribuir, con sus diversas manifestaciones, a fortalecer los valores cristianos para las formación de personas espiritual y físicamente sanas y fuertes.
                </p>
              </div>
            </AnimateOnScroll>
          </div>
        </div>
      </section>

      {/* Filosofía — Quote */}
      <section className="py-14 sm:py-16 bg-bordo-800 noise-overlay relative overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-dorado-400/30 via-dorado-300/10 to-transparent rounded-full blur-3xl -translate-x-1/4 -translate-y-1/4" />
        <div className="absolute bottom-0 right-0 w-[28rem] h-[28rem] bg-gradient-to-tl from-dorado-400/25 via-dorado-300/10 to-transparent rounded-full blur-3xl translate-x-1/5 translate-y-1/5" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-px bg-gradient-to-r from-transparent via-dorado-400/60 to-transparent" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2/3 h-px bg-gradient-to-r from-transparent via-dorado-400/60 to-transparent" />
        <div className="relative z-10 mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          <AnimateOnScroll variant="fadeInUp">
            <p className="font-body text-sm leading-relaxed text-white/60 mb-6">
              En definitiva, vivimos el deporte como lo describe Alfonso Alonso-Lasheras, SJ.{" "}
              <a
                href="http://jesuitasaru.org/deporte-encuentro-fraternal-y-paz-en-el-mundo/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-dorado-300/70 hover:text-dorado-300 transition-colors align-super text-[10px]"
              >
                1
              </a>
            </p>
          </AnimateOnScroll>
          <AnimateOnScroll variant="blurIn" delay={0.1}>
            <blockquote className="font-body text-base sm:text-lg text-white/80 leading-relaxed italic">
              &ldquo;…La vida es como un gran partido en el que uno sólo se puede
              sentir contento si sabe que lo ha dado todo haciéndolo lo mejor
              posible. Porque en la vida, casi todas las cosas realmente
              importantes están cuesta arriba, empezando por la propia felicidad.
              Y es ahí donde el deporte nos enseña a todos a luchar y a
              desgastarnos por aquello que merece la pena (…) Ojalá que el
              deporte hoy, como entonces, también sea herramienta que ayude a
              crear fraternidad, a tender puentes y a derribar muros&rdquo;.
            </blockquote>
          </AnimateOnScroll>
          <AnimateOnScroll variant="fadeInUp" delay={0.25}>
            <div className="mt-6 flex items-center justify-center gap-3">
              <span className="w-6 h-px bg-dorado-300/40" />
              <a
                href="http://jesuitasaru.org/deporte-encuentro-fraternal-y-paz-en-el-mundo/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-heading uppercase tracking-editorial text-[10px] text-dorado-300/50 hover:text-dorado-300 transition-colors"
              >
                Alfonso Alonso-Lasheras, SJ
              </a>
              <span className="w-6 h-px bg-dorado-300/40" />
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* Nuestro Escudo */}
      <section className="py-14 sm:py-20 bg-fondo">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <AnimateOnScroll variant="fadeInUp">
            <SectionHeader
              eyebrow="Identidad"
              title="Nuestro Escudo"
            />
          </AnimateOnScroll>

          <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8 lg:gap-12 items-start">
            <AnimateOnScroll variant="scaleIn">
              <div className="flex justify-center lg:justify-start">
                <motion.div
                  whileHover={{ scale: 1.04, rotate: 1 }}
                  transition={springBouncy}
                >
                  <Image
                    src="/images/escudo/logo-cs.png"
                    alt="Escudo del Club Seminario"
                    width={200}
                    height={200}
                    className="drop-shadow-2xl"
                  />
                </motion.div>
              </div>
            </AnimateOnScroll>

            <div>
              <AnimateOnScroll variant="fadeInUp">
                <h3 className="font-heading uppercase tracking-editorial text-xs text-bordo-800 mb-3">
                  El escudo
                </h3>
                <p className="font-body text-sm leading-relaxed text-muted-foreground">
                  El escudo del Club toma uno de los tres símbolos representados en el escudo del Colegio Seminario. Los lobos apoyados en el caldero son la imagen de la familia de San Ignacio de Loyola, fundador de la Compañía de Jesús.
                </p>
              </AnimateOnScroll>
              <AnimateOnScroll variant="fadeInUp" delay={0.08}>
                <p className="mt-3 font-body text-sm leading-relaxed text-muted-foreground">
                  Es un símbolo que identifica a los jesuitas en todo el mundo. Los Loyola tienen un escudo que expresa la virtud de ese hogar: la hospitalidad. Este sentimiento está expresado por dos lobos pardos en sable. Es decir, &ldquo;la hospitalidad de los Loyola se extiende aún a las fieras de la montaña, a todos reciben sin miramientos&rdquo;.
                </p>
              </AnimateOnScroll>
            </div>
          </div>

          {/* Los colores */}
          <div className="mt-12">
            <AnimateOnScroll variant="fadeInUp">
              <h3 className="font-heading uppercase tracking-editorial text-xs text-bordo-800 mb-3">
                Los colores
              </h3>
              <p className="font-body text-sm leading-relaxed text-muted-foreground">
                El escudo de Los Oñaz, la línea materna de San Ignacio, representa sobre campo de oro (hidalguía, heroísmo, fidelidad) siete barras de color sangre, la derramada en la batalla por los siete hijos del señor de Oñaz.
              </p>
            </AnimateOnScroll>
            <AnimateOnScroll variant="fadeInUp" delay={0.08}>
              <p className="mt-3 font-body text-sm leading-relaxed text-muted-foreground">
                El bordó representa el sacrificio y la entrega de cada persona que practica deportes en el Club. El oro representa la voluntad y esfuerzo de cada integrante del Club por superarse a sí mismo, en servicio de sus compañeros y de la institución. Ser generosos y nobles en nuestro desempeño dentro y fuera de las canchas. Ser fieles a los valores cristianos en nuestro accionar.
              </p>
            </AnimateOnScroll>

            <AnimateOnScroll variant="fadeInUp" delay={0.12}>
              <div className="mt-5 flex items-start gap-8">
                <div className="flex items-center gap-2.5">
                  <span className="size-4 rounded-full bg-bordo-800 ring-2 ring-bordo-800/20" />
                  <div>
                    <span className="font-heading uppercase tracking-editorial text-xs text-foreground block">Bordó</span>
                    <span className="font-body text-xs text-muted-foreground">Sacrificio y entrega</span>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="size-4 rounded-full bg-dorado-400 ring-2 ring-dorado-400/20" />
                  <div>
                    <span className="font-heading uppercase tracking-editorial text-xs text-foreground block">Oro</span>
                    <span className="font-body text-xs text-muted-foreground">Voluntad y esfuerzo</span>
                  </div>
                </div>
              </div>
            </AnimateOnScroll>
          </div>

          {/* Quote final escudo */}
          <AnimateOnScroll variant="fadeInUp" delay={0.15}>
            <div className="mt-8 border-y border-linea py-6 flex items-center justify-center gap-4 text-center">
              <span className="font-display text-3xl text-bordo-800/30 leading-none">&ldquo;</span>
              <p className="font-body text-sm italic text-muted-foreground">
                Nuestro escudo y sus colores representan una forma de ser, actuar y vivir.
              </p>
              <span className="font-display text-3xl text-bordo-800/30 leading-none">&rdquo;</span>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

    </>
  );
}
