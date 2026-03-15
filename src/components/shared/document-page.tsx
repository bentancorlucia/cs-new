"use client";

import { HeroSection } from "@/components/shared/hero-section";
import { AnimateOnScroll } from "@/components/shared/animate-on-scroll";
import { FileText, Mail, Phone, MapPin } from "lucide-react";
import { motion } from "framer-motion";
import { springBouncy } from "@/lib/motion";

interface DocumentPageProps {
  title: string;
  eyebrow: string;
  description: string;
  documentLabel: string;
  heroImage?: string;
}

export function DocumentPageClient({
  title,
  eyebrow,
  description,
  documentLabel,
  heroImage,
}: DocumentPageProps) {
  return (
    <>
      <HeroSection
        title={title}
        eyebrow={eyebrow}
        subtitle={description}
        backgroundImage={heroImage}
        variant={heroImage ? "full" : "minimal"}
      />

      <section className="py-16 sm:py-24 bg-fondo">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          {/* Document card */}
          <AnimateOnScroll variant="scaleIn">
            <div className="bg-white rounded-2xl p-8 sm:p-10 shadow-card text-center">
              <div className="mx-auto size-16 rounded-2xl bg-bordo-50 flex items-center justify-center mb-6">
                <FileText className="size-8 text-bordo-800" />
              </div>
              <h2 className="font-heading text-title-3 text-foreground mb-3">
                {documentLabel}
              </h2>
              <p className="font-body text-sm text-muted-foreground mb-6">
                Para consultar o solicitar una copia del documento, contactá a
                la secretaría del club.
              </p>
              <motion.a
                href="mailto:secretaria@clubseminario.com.uy"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={springBouncy}
                className="inline-flex items-center gap-2 rounded-full bg-bordo-800 px-6 py-3 font-heading text-xs uppercase tracking-editorial text-white hover:bg-bordo-900 transition-colors"
              >
                <Mail className="size-4" />
                Contactar secretaría
              </motion.a>
            </div>
          </AnimateOnScroll>

          {/* Contact info */}
          <AnimateOnScroll variant="fadeInUp" delay={0.2}>
            <div className="mt-10 text-center space-y-3">
              <p className="font-heading uppercase tracking-editorial text-xs text-muted-foreground">
                Contacto
              </p>
              <div className="flex flex-col items-center gap-2">
                <a
                  href="tel:099613671"
                  className="inline-flex items-center gap-2 font-body text-sm text-muted-foreground hover:text-bordo-800 transition-colors"
                >
                  <Phone className="size-4" />
                  099 613 671
                </a>
                <a
                  href="mailto:secretaria@clubseminario.com.uy"
                  className="inline-flex items-center gap-2 font-body text-sm text-muted-foreground hover:text-bordo-800 transition-colors"
                >
                  <Mail className="size-4" />
                  secretaria@clubseminario.com.uy
                </a>
                <span className="inline-flex items-center gap-2 font-body text-sm text-muted-foreground">
                  <MapPin className="size-4" />
                  Soriano 1472, Colegio Seminario
                </span>
                <span className="font-body text-sm text-muted-foreground/70">
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
