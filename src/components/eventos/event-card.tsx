"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { MapPin, Ticket, ArrowRight, Clock, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fadeInUp, springBouncy } from "@/lib/motion";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface EventCardProps {
  slug: string;
  titulo: string;
  imagenUrl?: string | null;
  fechaInicio: string;
  lugar?: string | null;
  descripcionCorta?: string | null;
  precioMinimo?: number | null;
  esGratuito: boolean;
  estado: string;
  capacidadTotal?: number | null;
  entradasVendidas?: number;
}

export function EventCard({
  slug,
  titulo,
  fechaInicio,
  lugar,
  descripcionCorta,
  precioMinimo,
  esGratuito,
  estado,
  capacidadTotal,
  entradasVendidas = 0,
}: EventCardProps) {
  const fecha = new Date(fechaInicio);
  const agotado = estado === "agotado" || (capacidadTotal && entradasVendidas >= capacidadTotal);
  const casiAgotado = capacidadTotal && !agotado && (entradasVendidas / capacidadTotal) >= 0.8;
  const isPast = fecha < new Date();
  const disponibles = capacidadTotal ? capacidadTotal - entradasVendidas : null;

  return (
    <motion.div variants={fadeInUp} layout>
      <Link href={`/eventos/${slug}`} className="group block">
        <motion.div
          whileTap={{ scale: 0.985 }}
          transition={springBouncy}
          className={`relative overflow-hidden rounded-3xl border transition-all duration-500 ${
            isPast
              ? "border-stone-200 bg-stone-50 opacity-75 hover:opacity-100"
              : "border-linea bg-white shadow-card hover:shadow-cardHover hover:-translate-y-1"
          }`}
        >
          <div className="flex flex-col sm:flex-row">
            {/* Left: large date block */}
            <div className={`relative flex flex-col items-center justify-center px-8 py-8 sm:min-w-[160px] sm:py-10 ${
              isPast
                ? "bg-stone-100"
                : "bg-gradient-to-br from-bordo-800 via-bordo-900 to-bordo-950"
            }`}>
              {/* Subtle pattern */}
              <svg className={`absolute inset-0 h-full w-full ${isPast ? "opacity-[0.04]" : "opacity-[0.07]"}`} xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id={`dots-${slug}`} width="16" height="16" patternUnits="userSpaceOnUse">
                    <circle cx="2" cy="2" r="1" fill="currentColor" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill={`url(#dots-${slug})`} className={isPast ? "text-stone-500" : "text-white"} />
              </svg>

              {/* Accent stripe */}
              <div className={`absolute left-0 top-0 h-full w-1.5 ${isPast ? "bg-stone-300" : "bg-dorado-400"}`} />

              <div className="relative z-10 text-center">
                <span className={`block font-display text-5xl font-bold leading-none sm:text-6xl ${
                  isPast ? "text-stone-400" : "text-dorado-300"
                }`}>
                  {format(fecha, "dd")}
                </span>
                <span className={`mt-1 block text-sm font-bold uppercase tracking-widest ${
                  isPast ? "text-stone-400" : "text-white/70"
                }`}>
                  {format(fecha, "MMM", { locale: es })}
                </span>
                <span className={`mt-0.5 block text-xs ${
                  isPast ? "text-stone-400" : "text-white/40"
                }`}>
                  {format(fecha, "yyyy")}
                </span>
              </div>

              {/* Badges stacked below date on mobile, overlaid on desktop */}
              <div className="relative z-10 mt-4 flex flex-wrap justify-center gap-1.5 sm:mt-5">
                {agotado && (
                  <Badge variant="destructive" className="text-[10px] font-bold uppercase tracking-wide">
                    Agotado
                  </Badge>
                )}
                {casiAgotado && !agotado && (
                  <Badge className="bg-amber-500 text-white text-[10px] font-bold uppercase tracking-wide">
                    Ultimas entradas
                  </Badge>
                )}
                {esGratuito && (
                  <Badge className={`text-[10px] font-bold uppercase tracking-wide ${
                    isPast ? "bg-stone-300 text-stone-600" : "bg-dorado-400 text-bordo-950"
                  }`}>
                    Gratis
                  </Badge>
                )}
              </div>
            </div>

            {/* Right: content */}
            <div className="flex flex-1 flex-col justify-between p-6 sm:p-8">
              <div>
                <h3 className={`font-display text-2xl font-bold leading-tight sm:text-3xl ${
                  isPast
                    ? "text-stone-500 group-hover:text-stone-700"
                    : "text-foreground group-hover:text-bordo-800"
                } transition-colors line-clamp-2`}>
                  {titulo}
                </h3>

                {descripcionCorta && (
                  <p className={`mt-3 text-base leading-relaxed line-clamp-2 ${
                    isPast ? "text-stone-400" : "text-muted-foreground"
                  }`}>
                    {descripcionCorta}
                  </p>
                )}

                {/* Meta row */}
                <div className={`mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm ${
                  isPast ? "text-stone-400" : "text-muted-foreground"
                }`}>
                  <span className="flex items-center gap-1.5">
                    <Clock className="size-4" />
                    {format(fecha, "EEEE, HH:mm 'hs'", { locale: es })}
                  </span>
                  {lugar && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="size-4" />
                      <span className="line-clamp-1">{lugar}</span>
                    </span>
                  )}
                  {disponibles !== null && disponibles > 0 && !isPast && (
                    <span className="flex items-center gap-1.5">
                      <Users className="size-4" />
                      {disponibles} {disponibles === 1 ? "lugar" : "lugares"}
                    </span>
                  )}
                </div>
              </div>

              {/* Bottom: price + CTA */}
              <div className={`mt-6 flex items-center justify-between border-t pt-5 ${
                isPast ? "border-stone-200" : "border-linea/50"
              }`}>
                <span className={`flex items-center gap-2 text-lg font-semibold ${
                  isPast ? "text-stone-400" : "text-foreground"
                }`}>
                  <Ticket className={`size-5 ${isPast ? "text-stone-400" : "text-bordo-800"}`} />
                  {esGratuito
                    ? "Entrada libre"
                    : precioMinimo
                      ? `Desde $${precioMinimo.toLocaleString("es-UY")}`
                      : "Consultar precio"}
                </span>

                <motion.span
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  transition={springBouncy}
                  className={`flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all ${
                    isPast
                      ? "bg-stone-200 text-stone-500 group-hover:bg-stone-300"
                      : "bg-bordo-800 text-white shadow-sm group-hover:bg-bordo-900 group-hover:shadow-md"
                  }`}
                >
                  {isPast ? "Ver detalle" : "Ver evento"}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </motion.span>
              </div>
            </div>
          </div>
        </motion.div>
      </Link>
    </motion.div>
  );
}
