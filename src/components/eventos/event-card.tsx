"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Calendar, MapPin, Ticket, ArrowRight, Users } from "lucide-react";
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
  imagenUrl,
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

  return (
    <motion.div variants={fadeInUp} layout>
      <Link href={`/eventos/${slug}`} className="group block">
        <motion.div
          whileTap={{ scale: 0.98 }}
          transition={springBouncy}
          className="overflow-hidden rounded-2xl border border-linea bg-white shadow-card transition-shadow duration-300 hover:shadow-cardHover active:shadow-sm"
        >
          {/* Image */}
          <div className="relative aspect-[16/9] overflow-hidden bg-superficie">
            {imagenUrl ? (
              <Image
                src={imagenUrl}
                alt={titulo}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Calendar className="size-12 text-muted-foreground/30" />
              </div>
            )}

            {/* Status badges */}
            <div className="absolute top-3 left-3 flex gap-2">
              {agotado && (
                <Badge variant="destructive" className="font-body text-xs shadow-sm">
                  Agotado
                </Badge>
              )}
              {casiAgotado && !agotado && (
                <Badge className="bg-amber-500 text-white font-body text-xs shadow-sm">
                  Últimas entradas
                </Badge>
              )}
              {esGratuito && (
                <Badge className="bg-dorado text-foreground font-body text-xs shadow-sm">
                  Gratis
                </Badge>
              )}
            </div>

            {/* Date badge */}
            <div className="absolute bottom-3 left-3 rounded-xl bg-white/95 backdrop-blur-sm px-3 py-2 shadow-sm">
              <p className="font-display text-xl font-bold leading-none text-bordo-800">
                {format(fecha, "dd")}
              </p>
              <p className="font-body text-[11px] uppercase tracking-wide text-muted-foreground">
                {format(fecha, "MMM", { locale: es })}
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="p-4">
            <h3 className="font-heading text-base font-bold text-foreground line-clamp-2 group-hover:text-bordo-800 transition-colors sm:text-lg">
              {titulo}
            </h3>

            {descripcionCorta && (
              <p className="mt-1.5 text-sm text-muted-foreground line-clamp-2">
                {descripcionCorta}
              </p>
            )}

            {/* Meta info */}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar className="size-3.5 shrink-0" />
                {format(fecha, "EEE d MMM, HH:mm", { locale: es })}
              </span>
              {lugar && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-3.5 shrink-0" />
                  <span className="line-clamp-1">{lugar}</span>
                </span>
              )}
            </div>

            {/* Price + CTA row */}
            <div className="mt-3 flex items-center justify-between border-t border-linea/50 pt-3">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <Ticket className="size-4 text-bordo-800" />
                {esGratuito
                  ? "Entrada libre"
                  : precioMinimo
                    ? `Desde $${precioMinimo.toLocaleString("es-UY")}`
                    : "Consultar"}
              </span>
              <span className="flex items-center gap-1 rounded-full bg-bordo-50 px-3 py-1.5 text-xs font-semibold text-bordo-800 transition-colors group-hover:bg-bordo group-hover:text-white">
                Ver evento
                <ArrowRight className="size-3.5" />
              </span>
            </div>
          </div>
        </motion.div>
      </Link>
    </motion.div>
  );
}
