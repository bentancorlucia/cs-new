"use client";

import { motion } from "framer-motion";
import { AnimateOnScroll } from "./animate-on-scroll";

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  align = "center",
}: SectionHeaderProps) {
  const isCenter = align === "center";

  return (
    <div className={`mb-12 sm:mb-16 ${isCenter ? "text-center" : "relative pl-6"}`}>
      {!isCenter && (
        <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full bg-bordo-800" />
      )}
      {eyebrow && (
        <AnimateOnScroll variant="fadeInUp" delay={0}>
          <span className="font-heading uppercase tracking-editorial text-xs text-bordo-800 block mb-3">
            {eyebrow}
          </span>
        </AnimateOnScroll>
      )}
      <AnimateOnScroll variant="fadeInUp" delay={0.1}>
        <h2 className="font-display text-display uppercase tracking-tightest text-foreground">
          {title}
        </h2>
      </AnimateOnScroll>
      {description && (
        <AnimateOnScroll variant="fadeInUp" delay={0.2}>
          <p className={`mt-4 font-body text-lg text-muted-foreground ${isCenter ? "max-w-2xl mx-auto" : "max-w-2xl"}`}>
            {description}
          </p>
        </AnimateOnScroll>
      )}
    </div>
  );
}
