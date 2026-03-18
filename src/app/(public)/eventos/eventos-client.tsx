"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { EventCard } from "@/components/eventos/event-card";
import { HeroSection } from "@/components/shared/hero-section";
import { staggerContainer, fadeInUp } from "@/lib/motion";

interface Evento {
  id: number;
  titulo: string;
  slug: string;
  descripcion_corta: string | null;
  imagen_url: string | null;
  lugar: string | null;
  fecha_inicio: string;
  capacidad_total: number | null;
  estado: string;
  es_gratuito: boolean;
  precio_minimo: number | null;
  entradas_vendidas: number;
}

export function EventosClient() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"proximos" | "pasados">("proximos");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchEventos() {
      setLoading(true);
      try {
        const res = await fetch(`/api/eventos?tab=${tab}`);
        const data = await res.json();
        if (Array.isArray(data)) setEventos(data);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchEventos();
  }, [tab]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const eventosFiltrados = search
    ? eventos.filter(
        (e) =>
          e.titulo.toLowerCase().includes(search.toLowerCase()) ||
          e.lugar?.toLowerCase().includes(search.toLowerCase())
      )
    : eventos;

  return (
    <>
      <HeroSection
        eyebrow="Agenda del club"
        title="Eventos"
        subtitle="Eventos deportivos, sociales y culturales de Club Seminario. Comprá tus entradas online."
        variant="minimal"
      />

      <div className="mx-auto max-w-5xl px-4 py-8">

      {/* Tabs + Search */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex gap-2">
          {(["proximos", "pasados"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full border px-5 py-1.5 text-sm font-medium transition-all ${
                tab === t
                  ? "border-bordo-800 bg-bordo-800 text-white shadow-sm"
                  : "border-bordo-800/20 bg-white text-foreground/70 hover:border-bordo-800/40 hover:text-foreground shadow-sm"
              }`}
            >
              {t === "proximos" ? "Próximos" : "Pasados"}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar eventos..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
      </motion.div>

      {/* Results */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mb-4 text-sm text-muted-foreground"
      >
        {eventosFiltrados.length} evento
        {eventosFiltrados.length !== 1 ? "s" : ""}
        {search && ` para "${search}"`}
      </motion.p>

      {/* Events list */}
      {loading ? (
        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex flex-col sm:flex-row overflow-hidden rounded-3xl border border-linea">
              <Skeleton className="h-40 w-full sm:h-auto sm:w-[160px]" />
              <div className="flex-1 space-y-4 p-6 sm:p-8">
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <div className="flex gap-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <div className="flex items-center justify-between border-t border-linea/50 pt-5">
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-10 w-32 rounded-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : eventosFiltrados.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground"
        >
          <Calendar className="size-16 opacity-20" />
          <p className="text-lg font-medium">
            {tab === "proximos"
              ? "No hay eventos próximos"
              : "No hay eventos pasados"}
          </p>
          <p className="text-sm">Volvé a consultar más adelante</p>
        </motion.div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {eventosFiltrados.map((evento) => (
              <EventCard
                key={evento.id}
                slug={evento.slug}
                titulo={evento.titulo}
                imagenUrl={evento.imagen_url}
                fechaInicio={evento.fecha_inicio}
                lugar={evento.lugar}
                descripcionCorta={evento.descripcion_corta}
                precioMinimo={evento.precio_minimo}
                esGratuito={evento.es_gratuito}
                estado={evento.estado}
                capacidadTotal={evento.capacidad_total}
                entradasVendidas={evento.entradas_vendidas}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
    </>
  );
}
