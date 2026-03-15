"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  Plus,
  Ticket,
  QrCode,
  Edit,
  DollarSign,
  Eye,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { staggerContainer, fadeInUp } from "@/lib/motion";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface EventoAdmin {
  id: number;
  titulo: string;
  slug: string;
  fecha_inicio: string;
  estado: string;
  capacidad_total: number | null;
  es_gratuito: boolean;
  entradas_vendidas: number;
  recaudacion: number;
}

const ESTADO_COLORS: Record<string, string> = {
  borrador: "bg-gray-100 text-gray-700",
  publicado: "bg-green-100 text-green-700",
  agotado: "bg-red-100 text-red-700",
  finalizado: "bg-blue-100 text-blue-700",
  cancelado: "bg-red-50 text-red-500",
};

type Tab = "todos" | "proximos" | "pasados" | "borradores";

const TABS: { id: Tab; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "proximos", label: "Próximos" },
  { id: "pasados", label: "Pasados" },
  { id: "borradores", label: "Borradores" },
];

export function EventosAdminClient() {
  const [eventos, setEventos] = useState<EventoAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("todos");

  useEffect(() => {
    async function fetchEventos() {
      try {
        const res = await fetch("/api/admin/eventos");
        if (res.ok) {
          const data = await res.json();
          setEventos(data);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchEventos();
  }, []);

  const now = new Date();
  const filteredEventos = eventos.filter((e) => {
    const fecha = new Date(e.fecha_inicio);
    const estado = (e.estado || "").toLowerCase().trim();

    switch (tab) {
      case "todos":
        return true;
      case "proximos":
        return fecha >= now && estado !== "borrador";
      case "pasados":
        return fecha < now && estado !== "borrador";
      case "borradores":
        return estado === "borrador";
      default:
        return true;
    }
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">
            Eventos
          </h1>
          <p className="mt-1 text-muted-foreground">
            Gestioná los eventos del club
          </p>
        </div>
        <Link href="/eventos/crear" className={buttonVariants({ className: "bg-primary hover:bg-bordo-900 text-white" })}>
          <Plus className="mr-2 size-4" />
          Nuevo evento
        </Link>
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {[
          {
            label: "Total eventos",
            value: eventos.length,
            icon: Calendar,
          },
          {
            label: "Publicados",
            value: eventos.filter((e) => e.estado === "publicado").length,
            icon: Eye,
          },
          {
            label: "Entradas vendidas",
            value: eventos.reduce((s, e) => s + e.entradas_vendidas, 0),
            icon: Ticket,
          },
          {
            label: "Recaudación",
            value: `$${eventos
              .reduce((s, e) => s + e.recaudacion, 0)
              .toLocaleString("es-UY")}`,
            icon: DollarSign,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-linea bg-white p-4"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <stat.icon className="size-4" />
              <span className="text-xs font-medium">{stat.label}</span>
            </div>
            <p className="mt-1 font-display text-2xl font-bold text-foreground">
              {stat.value}
            </p>
          </div>
        ))}
      </motion.div>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mb-6 flex gap-2"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-all ${
              tab === t.id
                ? "border-primary bg-primary text-white"
                : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </motion.div>

      {/* Events list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredEventos.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground"
        >
          <Calendar className="size-12 opacity-20" />
          <p className="text-lg font-medium">Sin eventos en esta categoría</p>
        </motion.div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-3"
        >
          <AnimatePresence>
            {filteredEventos.map((evento) => (
              <EventoAdminRow key={evento.id} evento={evento} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}

function EventoAdminRow({ evento }: { evento: EventoAdmin }) {
  const fecha = new Date(evento.fecha_inicio);

  return (
    <motion.div
      variants={fadeInUp}
      layout
      className="rounded-xl border border-linea bg-white p-4 transition-shadow hover:shadow-card"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-heading font-bold text-foreground truncate">
              {evento.titulo}
            </h3>
            <Badge className={ESTADO_COLORS[evento.estado] || "bg-gray-100 text-gray-700"}>
              {evento.estado}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="size-3.5" />
              {format(fecha, "d MMM yyyy, HH:mm", { locale: es })}
            </span>
            <span className="flex items-center gap-1">
              <Ticket className="size-3.5" />
              {evento.entradas_vendidas}
              {evento.capacidad_total ? ` / ${evento.capacidad_total}` : ""} entradas
            </span>
            {!evento.es_gratuito && evento.recaudacion > 0 && (
              <span className="flex items-center gap-1">
                <DollarSign className="size-3.5" />
                ${evento.recaudacion.toLocaleString("es-UY")}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/eventos/${evento.id}/entradas`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Ticket className="mr-1 size-3.5" />
            Entradas
          </Link>
          <Link href={`/eventos/${evento.id}/editar`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Edit className="mr-1 size-3.5" />
            Editar
          </Link>
          <Link href="/eventos/scanner" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <QrCode className="mr-1 size-3.5" />
            Scanner
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
