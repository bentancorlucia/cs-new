"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { fadeInUp } from "@/lib/motion";

interface SportCardProps {
  nombre: string;
  slug: string;
  imagen?: string;
  descripcion?: string;
}

export function SportCard({ nombre, slug, imagen, descripcion }: SportCardProps) {
  return (
    <motion.div variants={fadeInUp} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
      <Link href={`/deportes/${slug}`} className="group block relative aspect-[3/4] overflow-hidden">
        {/* Image */}
        <motion.div
          className="absolute inset-0"
          whileHover={{ scale: 1.06 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          {imagen ? (
            <img
              src={imagen}
              alt={nombre}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-bordo-800 to-bordo-950" />
          )}
        </motion.div>

        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-bordo-950 via-bordo-950/70 to-bordo-950/40 group-hover:from-bordo-950/90 transition-all duration-500" />

        {/* Content */}
        <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-6">
          <h3 className="font-display text-title-2 uppercase tracking-tightest text-white group-hover:-translate-y-1 transition-transform duration-300">
            {nombre}
          </h3>
          {descripcion && (
            <p className="mt-1 font-body text-sm text-white/50 line-clamp-2">
              {descripcion}
            </p>
          )}
        </div>

        {/* Arrow */}
        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <motion.div
            initial={{ x: -8, y: 8 }}
            whileHover={{ x: 0, y: 0 }}
            className="size-8 rounded-full bg-dorado-300 flex items-center justify-center"
          >
            <ArrowUpRight className="size-4 text-bordo-950" />
          </motion.div>
        </div>
      </Link>
    </motion.div>
  );
}
