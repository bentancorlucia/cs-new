"use client";

import { HeroSection } from "@/components/shared/hero-section";
import { motion } from "framer-motion";
import Image from "next/image";
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[2px] md:gap-4">
            {categories.map((cat, idx) => (
              <motion.div
                key={cat.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{
                  duration: 0.6,
                  delay: idx * 0.08,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="group relative overflow-hidden bg-superficie border border-bordo-800/5 transition-colors duration-500 ease-out hover:border-bordo-800/10"
              >
                {/* Image section */}
                {cat.image && (
                  <div className="relative aspect-[16/9] overflow-hidden">
                    <Image
                      src={cat.image}
                      alt={cat.name}
                      fill
                      sizes="(min-width: 768px) 50vw, 100vw"
                      loading={idx === 0 ? "eager" : "lazy"}
                      className="object-cover mix-blend-multiply transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
                    />
                    {/* Gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-bordo-950/60 via-bordo-950/10 to-transparent transition-colors duration-700 ease-out group-hover:from-bordo-800/50" />
                  </div>
                )}

                {/* Info section */}
                <div className="p-5 sm:p-6">
                  <h3 className="font-display text-title-3 sm:text-title-2 uppercase tracking-tightest text-bordo-950 group-hover:text-bordo-800 transition-colors duration-500 ease-out">
                    {cat.name}
                  </h3>
                  {cat.description && (
                    <p className="mt-2 font-body text-sm leading-relaxed text-bordo-800/60">
                      {cat.description}
                    </p>
                  )}

                  {/* Details grid */}
                  <div className="mt-5 pt-5 border-t border-dashed border-bordo-800/15 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex items-start gap-2.5">
                      <Clock className="size-3.5 text-dorado-500 mt-0.5 shrink-0" />
                      <span className="font-heading text-[11px] uppercase tracking-editorial text-bordo-950">
                        {cat.schedule}
                      </span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <MapPin className="size-3.5 text-dorado-500 mt-0.5 shrink-0" />
                      <span className="font-heading text-[11px] uppercase tracking-editorial text-bordo-950">
                        {cat.location}
                      </span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <User className="size-3.5 text-dorado-500 mt-0.5 shrink-0" />
                      <span className="font-heading text-[11px] uppercase tracking-editorial text-bordo-950">
                        {cat.contact.name}
                      </span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <Phone className="size-3.5 text-dorado-500 mt-0.5 shrink-0" />
                      <a
                        href={`tel:${cat.contact.phone.replace(/\s/g, "")}`}
                        className="font-heading text-[11px] uppercase tracking-editorial text-bordo-800 hover:text-bordo-950 transition-colors"
                      >
                        {cat.contact.phone}
                      </a>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

    </>
  );
}
