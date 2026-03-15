"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { springBouncy } from "@/lib/motion";

interface HeroProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  cta?: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  backgroundImage?: string;
  backgroundVideo?: string;
  variant?: "full" | "split" | "minimal";
}

export function HeroSection({
  title,
  subtitle,
  eyebrow,
  cta,
  secondaryCta,
  backgroundImage,
  backgroundVideo,
  variant = "full",
}: HeroProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll(
    variant === "full"
      ? { target: ref, offset: ["start start", "end start"] }
      : undefined
  );

  const imageY = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);
  const imageScale = useTransform(scrollYProgress, [0, 1], [1, 1.08]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const contentY = useTransform(scrollYProgress, [0, 0.5], [0, -40]);

  if (variant === "minimal") {
    return (
      <>
        <section className="relative -mt-20 pt-40 sm:pt-48 lg:pt-56 pb-28 sm:pb-36 lg:pb-44 gradient-mesh overflow-hidden">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
            {eyebrow && (
              <motion.span
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="font-heading uppercase tracking-editorial text-xs text-bordo-800 block mb-4"
              >
                {eyebrow}
              </motion.span>
            )}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="font-display text-display uppercase tracking-tightest text-foreground"
            >
              {title}
            </motion.h1>
            {subtitle && (
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="mt-4 font-body text-lg text-muted-foreground max-w-2xl mx-auto"
              >
                {subtitle}
              </motion.p>
            )}
          </div>
        </section>
        {/* Decorative border: bordó + amarillo */}
        <div className="h-[3px] bg-bordo-800" />
        <div className="h-[2px] bg-dorado-400" />
      </>
    );
  }

  if (variant === "split") {
    return (
      <section className="relative py-16 sm:py-24 overflow-hidden bg-fondo">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              {eyebrow && (
                <motion.span
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className="font-heading uppercase tracking-editorial text-xs text-bordo-800 block mb-4"
                >
                  {eyebrow}
                </motion.span>
              )}
              <motion.h1
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="font-display text-title-1 uppercase tracking-tightest text-foreground"
              >
                {title}
              </motion.h1>
              {subtitle && (
                <motion.p
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="mt-4 font-body text-lg text-muted-foreground max-w-lg"
                >
                  {subtitle}
                </motion.p>
              )}
              {cta && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.6 }}
                  className="mt-8 flex flex-wrap gap-3"
                >
                  <Link href={cta.href}>
                    <motion.span
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      transition={springBouncy}
                      className="inline-flex items-center rounded-full bg-bordo-800 px-6 py-3 font-heading text-xs uppercase tracking-editorial text-white hover:bg-bordo-900 transition-colors"
                    >
                      {cta.label}
                    </motion.span>
                  </Link>
                  {secondaryCta && (
                    <Link href={secondaryCta.href}>
                      <motion.span
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        transition={springBouncy}
                        className="inline-flex items-center rounded-full border border-bordo-800 px-6 py-3 font-heading text-xs uppercase tracking-editorial text-bordo-800 hover:bg-bordo-800 hover:text-white transition-colors"
                      >
                        {secondaryCta.label}
                      </motion.span>
                    </Link>
                  )}
                </motion.div>
              )}
            </div>
            {backgroundImage && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="relative aspect-[4/3] rounded-2xl overflow-hidden"
              >
                <img
                  src={backgroundImage}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                />
              </motion.div>
            )}
          </div>
        </div>
      </section>
    );
  }

  // Full variant (default)
  return (
    <section ref={ref} className="relative min-h-[85vh] -mt-20 flex items-end overflow-hidden noise-overlay">
      {/* Background Video / Image with Parallax */}
      {backgroundVideo ? (
        <div className="absolute inset-0">
          <video
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          >
            <source src={backgroundVideo} type="video/mp4" />
          </video>
        </div>
      ) : backgroundImage ? (
        <motion.div
          style={{ y: imageY, scale: imageScale }}
          className="absolute inset-0"
        >
          <img
            src={backgroundImage}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        </motion.div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-bordo-950 via-bordo-900 to-bordo-800" />
      )}

      {/* Overlay Gradient — bordó */}
      <div className="absolute inset-0 bg-gradient-to-b from-bordo-950/80 via-bordo-950/50 to-bordo-950/90 z-[1]" />

      {/* Content */}
      <motion.div
        style={{ opacity: contentOpacity, y: contentY }}
        className="relative z-10 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 pb-16 sm:pb-24"
      >
        {eyebrow && (
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="font-heading uppercase tracking-editorial text-xs text-dorado-300 block mb-4"
          >
            {eyebrow}
          </motion.span>
        )}

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="font-display text-hero uppercase tracking-tightest text-dorado-300 max-w-4xl"
        >
          {title}
        </motion.h1>

        {subtitle && (
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 font-body text-lg md:text-xl text-white/70 max-w-xl"
          >
            {subtitle}
          </motion.p>
        )}

        {cta && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.7 }}
            className="mt-8 flex flex-wrap gap-3"
          >
            <Link href={cta.href}>
              <motion.span
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={springBouncy}
                className="inline-flex items-center rounded-full bg-dorado-300 px-7 py-3.5 font-heading text-xs uppercase tracking-editorial text-bordo-950 hover:bg-dorado-200 transition-colors"
              >
                {cta.label}
              </motion.span>
            </Link>
            {secondaryCta && (
              <Link href={secondaryCta.href}>
                <motion.span
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  transition={springBouncy}
                  className="inline-flex items-center rounded-full border border-white/30 px-7 py-3.5 font-heading text-xs uppercase tracking-editorial text-white hover:bg-white hover:text-bordo-950 transition-colors"
                >
                  {secondaryCta.label}
                </motion.span>
              </Link>
            )}
          </motion.div>
        )}
      </motion.div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronDown className="size-6 text-white/40" />
        </motion.div>
      </motion.div>
    </section>
  );
}
