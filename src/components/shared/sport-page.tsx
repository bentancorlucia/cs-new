"use client";

import { HeroSection } from "@/components/shared/hero-section";
import {
  AnimateStaggerGroup,
} from "@/components/shared/animate-on-scroll";
import { motion } from "framer-motion";
import { fadeInUp } from "@/lib/motion";
import { MapPin, Clock, Phone, User } from "lucide-react";

interface Category {
  name: string;
  description?: string;
  schedule: string;
  location: string;
  contact: { name: string; phone: string };
  image?: string;
}

interface SportPageProps {
  title: string;
  eyebrow?: string;
  description: string;
  heroImage?: string;
  categories: Category[];
}

export function SportPage({
  title,
  eyebrow = "Deportes",
  description,
  heroImage,
  categories,
}: SportPageProps) {
  return (
    <>
      <HeroSection
        title={title}
        subtitle={description}
        eyebrow={eyebrow}
        backgroundImage={heroImage}
        variant={heroImage ? "full" : "minimal"}
      />

      <section className="py-16 sm:py-24 bg-fondo">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <AnimateStaggerGroup className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {categories.map((cat) => (
              <motion.div
                key={cat.name}
                variants={fadeInUp}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="bg-white rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-shadow duration-300"
              >
                {cat.image && (
                  <div className="relative aspect-[16/9] overflow-hidden">
                    <img
                      src={cat.image}
                      alt={cat.name}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="p-6 sm:p-8">
                <h3 className="font-display text-title-3 uppercase tracking-tightest text-foreground">
                  {cat.name}
                </h3>
                {cat.description && (
                  <p className="mt-3 font-body text-sm leading-relaxed text-muted-foreground">
                    {cat.description}
                  </p>
                )}
                <div className="mt-6 space-y-3">
                  <div className="flex items-start gap-3">
                    <Clock className="size-4 text-bordo-800 mt-0.5 shrink-0" />
                    <span className="font-body text-sm text-foreground">
                      {cat.schedule}
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="size-4 text-bordo-800 mt-0.5 shrink-0" />
                    <span className="font-body text-sm text-foreground">
                      {cat.location}
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <User className="size-4 text-bordo-800 mt-0.5 shrink-0" />
                    <span className="font-body text-sm text-foreground">
                      {cat.contact.name}
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Phone className="size-4 text-bordo-800 mt-0.5 shrink-0" />
                    <a
                      href={`tel:${cat.contact.phone.replace(/\s/g, "")}`}
                      className="font-body text-sm text-bordo-800 hover:underline"
                    >
                      {cat.contact.phone}
                    </a>
                  </div>
                </div>
                </div>
              </motion.div>
            ))}
          </AnimateStaggerGroup>
        </div>
      </section>

    </>
  );
}
