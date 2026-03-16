"use client";

import { HeroSection } from "@/components/shared/hero-section";
import {
  AnimateOnScroll,
  AnimateStaggerGroup,
} from "@/components/shared/animate-on-scroll";
import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/motion";

const DIRECTIVOS = [
  { cargo: "Presidente", nombre: "Atilano Abella" },
  { cargo: "Vicepresidenta", nombre: "Natalia Orellano" },
  { cargo: "Secretario", nombre: "Mathías Rojas" },
  { cargo: "Tesorero", nombre: "Juan Abou-Nigm" },
  { cargo: "Pro-Tesorero", nombre: "Luis Scremini" },
];

const VOCALES_TITULARES = [
  "Alejandra Castro",
  "Paula Prato",
  "Sebastián Perona",
  "Santiago Cerisola",
];

const VOCALES_SUPLENTES = [
  "Laura Sotelo",
  "Lucía Alvariza",
  "Facundo Domínguez",
  "Gonzalo Hernández",
  "Guillermo Murissich",
  "Lola Delafond",
  "Santiago Pérez",
  "Lucía Bentancor",
  "Jose Pedro Montero",
];

const COMISION_FISCAL = [
  "Juan Andrés Guimaraes",
  "José Luis Olivera",
  "Luis Andrés Vilaró",
  "Isaac Pérez",
  "María Inés Lombardo",
  "Eugenio Balestie",
];

function PersonCard({
  nombre,
  cargo,
}: {
  nombre: string;
  cargo?: string;
}) {
  return (
    <motion.div
      variants={fadeInUp}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="bg-white rounded-xl p-5 shadow-card hover:shadow-card-hover transition-shadow duration-300"
    >
      {cargo && (
        <span className="font-heading uppercase tracking-editorial text-[11px] text-bordo-800 block mb-1">
          {cargo}
        </span>
      )}
      <p className="font-heading text-base font-medium text-foreground">
        {nombre}
      </p>
    </motion.div>
  );
}

export function DirectivaClient() {
  return (
    <>
      <HeroSection
        title="Comisión Directiva"
        eyebrow="El Club"
        subtitle="Las personas que lideran y trabajan por el crecimiento del Club Seminario."
        backgroundImage="/images/club/foto-directiva.webp"
        variant="full"
      />

      {/* Cargos Directivos */}
      <section className="py-16 sm:py-24 bg-fondo">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimateOnScroll variant="fadeInUp">
            <h2 className="font-display text-title-2 uppercase tracking-tightest text-foreground mb-8">
              Titulares
            </h2>
          </AnimateOnScroll>

          <AnimateStaggerGroup className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {DIRECTIVOS.map((d) => (
              <PersonCard key={d.nombre} nombre={d.nombre} cargo={d.cargo} />
            ))}
            {VOCALES_TITULARES.map((nombre) => (
              <PersonCard key={nombre} nombre={nombre} />
            ))}
          </AnimateStaggerGroup>

          {/* Vocales Suplentes */}
          <AnimateOnScroll variant="fadeInUp" className="mt-16">
            <h2 className="font-display text-title-2 uppercase tracking-tightest text-foreground mb-8">
              Suplentes
            </h2>
          </AnimateOnScroll>

          <AnimateStaggerGroup className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {VOCALES_SUPLENTES.map((nombre) => (
              <PersonCard key={nombre} nombre={nombre} />
            ))}
          </AnimateStaggerGroup>

          {/* Comisión Fiscal */}
          <AnimateOnScroll variant="fadeInUp" className="mt-16">
            <h2 className="font-display text-title-2 uppercase tracking-tightest text-foreground mb-8">
              Comisión Fiscal
            </h2>
          </AnimateOnScroll>

          <AnimateStaggerGroup className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {COMISION_FISCAL.map((nombre) => (
              <PersonCard key={nombre} nombre={nombre} />
            ))}
          </AnimateStaggerGroup>
        </div>
      </section>
    </>
  );
}
