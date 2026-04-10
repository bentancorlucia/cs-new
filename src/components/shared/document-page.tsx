"use client";

import { HeroSection } from "@/components/shared/hero-section";
import { AnimateOnScroll } from "@/components/shared/animate-on-scroll";
import {
  FileText,
  Mail,
  Phone,
  MapPin,
  Download,
  ExternalLink,
} from "lucide-react";
import { motion } from "framer-motion";
import { springBouncy, springSmooth } from "@/lib/motion";

interface DocumentPageProps {
  title: string;
  eyebrow: string;
  description: string;
  documentLabel: string;
  heroImage?: string;
  pdfUrl?: string;
}

export function DocumentPageClient({
  title,
  eyebrow,
  description,
  documentLabel,
  heroImage,
  pdfUrl,
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

      {/* PDF Viewer Section */}
      {pdfUrl && (
        <section className="py-16 sm:py-24 bg-fondo">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            {/* Document header with actions */}
            <AnimateOnScroll variant="fadeInUp">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-bordo-50 flex items-center justify-center">
                    <FileText className="size-5 text-bordo-800" />
                  </div>
                  <h2 className="font-heading text-title-3 text-foreground">
                    {documentLabel}
                  </h2>
                </div>
                <div className="flex items-center gap-3">
                  <motion.a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    transition={springBouncy}
                    className="inline-flex items-center gap-2 border border-bordo-200 bg-white px-4 py-2.5 font-heading text-xs uppercase tracking-editorial text-bordo-800 hover:bg-bordo-50 transition-colors"
                  >
                    <ExternalLink className="size-3.5" />
                    Abrir en nueva pestaña
                  </motion.a>
                  <motion.a
                    href={pdfUrl}
                    download
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    transition={springBouncy}
                    className="inline-flex items-center gap-2 bg-bordo-800 px-4 py-2.5 font-heading text-xs uppercase tracking-editorial text-white hover:bg-bordo-900 transition-colors"
                  >
                    <Download className="size-3.5" />
                    Descargar PDF
                  </motion.a>
                </div>
              </div>
            </AnimateOnScroll>

            {/* PDF Embed */}
            <AnimateOnScroll variant="scaleIn">
              <motion.div
                className="relative overflow-hidden rounded-2xl shadow-card bg-white"
                whileHover={{ boxShadow: "0 20px 60px -12px rgba(115, 13, 50, 0.15)" }}
                transition={springSmooth}
              >
                {/* Decorative top bar */}
                <div className="h-1.5 bg-gradient-to-r from-bordo-800 via-bordo-600 to-dorado-400" />

                {/* PDF embed */}
                <div className="relative w-full" style={{ height: "80vh", minHeight: "600px" }}>
                  <iframe
                    src={encodeURI(pdfUrl)}
                    className="absolute inset-0 w-full h-full border-0"
                    title={documentLabel}
                    allow="fullscreen"
                  />
                </div>
              </motion.div>
            </AnimateOnScroll>

            {/* Mobile fallback - shown below iframe for small devices where PDF viewing may be poor */}
            <AnimateOnScroll variant="fadeInUp" delay={0.15}>
              <div className="mt-6 sm:hidden">
                <motion.a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  transition={springBouncy}
                  className="flex items-center justify-center gap-2 w-full rounded-xl bg-bordo-800 px-6 py-4 font-heading text-sm uppercase tracking-editorial text-white hover:bg-bordo-900 transition-colors"
                >
                  <FileText className="size-5" />
                  Ver documento completo
                </motion.a>
              </div>
            </AnimateOnScroll>
          </div>
        </section>
      )}

      {/* Fallback when no PDF is available */}
      {!pdfUrl && (
        <section className="py-16 sm:py-24 bg-fondo">
          <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
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
          </div>
        </section>
      )}

      {/* Contact info */}
      <section className="py-12 sm:py-16 bg-fondo border-t border-bordo-100/50">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <AnimateOnScroll variant="fadeInUp">
            <div className="text-center space-y-3">
              <p className="font-heading uppercase tracking-editorial text-xs text-muted-foreground">
                ¿Tenés consultas sobre este documento?
              </p>
              <div className="flex flex-col items-center gap-2">
                <a
                  href="tel:+59891965438"
                  className="inline-flex items-center gap-2 font-body text-sm text-muted-foreground hover:text-bordo-800 transition-colors"
                >
                  <Phone className="size-4" />
                  +598 91 965 438
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
                  Martes, Jueves y Viernes de 12:30 a 15:30 hs
                </span>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>
    </>
  );
}
