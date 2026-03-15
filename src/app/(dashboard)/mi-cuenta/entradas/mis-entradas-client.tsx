"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import {
  Calendar,
  MapPin,
  Ticket,
  QrCode,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { staggerContainer, fadeInUp } from "@/lib/motion";

interface MiEntrada {
  id: number;
  codigo: string;
  estado: string;
  precio_pagado: number;
  nombre_asistente: string;
  created_at: string;
  usado_at: string | null;
  qr_url: string | null;
  eventos: {
    titulo: string;
    slug: string;
    imagen_url: string | null;
    fecha_inicio: string;
    lugar: string | null;
  } | null;
  tipo_entradas: {
    nombre: string;
  } | null;
  lotes_entrada: {
    nombre: string;
  } | null;
}

const ESTADO_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pagada: {
    label: "Válida",
    color: "bg-green-100 text-green-700",
    icon: <CheckCircle2 className="size-3.5" />,
  },
  usada: {
    label: "Usada",
    color: "bg-blue-100 text-blue-700",
    icon: <CheckCircle2 className="size-3.5" />,
  },
  pendiente: {
    label: "Pendiente",
    color: "bg-yellow-100 text-yellow-700",
    icon: <Clock className="size-3.5" />,
  },
  cancelada: {
    label: "Cancelada",
    color: "bg-red-100 text-red-600",
    icon: <XCircle className="size-3.5" />,
  },
  reembolsada: {
    label: "Reembolsada",
    color: "bg-red-50 text-red-500",
    icon: <XCircle className="size-3.5" />,
  },
};

export function MisEntradasClient() {
  const [entradas, setEntradas] = useState<MiEntrada[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntrada, setSelectedEntrada] = useState<MiEntrada | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEntradas() {
      try {
        const res = await fetch("/api/perfil/entradas");
        if (res.ok) {
          setEntradas(await res.json());
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchEntradas();
  }, []);

  const handleShowQR = async (entrada: MiEntrada) => {
    setSelectedEntrada(entrada);
    setQrDataUrl(null);

    if (entrada.qr_url) {
      setQrDataUrl(entrada.qr_url);
      return;
    }

    try {
      const QRCode = (await import("qrcode")).default;
      const dataUrl = await QRCode.toDataURL(entrada.codigo, {
        width: 400,
        margin: 2,
        color: { dark: "#730d32", light: "#ffffff" },
        errorCorrectionLevel: "H",
      });
      setQrDataUrl(dataUrl);
    } catch {
      setQrDataUrl(null);
    }
  };

  const now = new Date();
  const proximas = entradas.filter(
    (e) => e.eventos && new Date(e.eventos.fecha_inicio) >= now
  );
  const pasadas = entradas.filter(
    (e) => e.eventos && new Date(e.eventos.fecha_inicio) < now
  );

  return (
    <div className="mx-auto max-w-3xl">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Link
          href="/mi-cuenta"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Mi cuenta
        </Link>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Mis entradas
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Tus entradas para eventos del club
        </p>
      </motion.div>

      {loading ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : entradas.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mt-12 flex flex-col items-center gap-3 text-muted-foreground"
        >
          <Ticket className="size-16 opacity-20" />
          <p className="text-lg font-medium">No tenés entradas</p>
          <Link href="/eventos" className="text-sm text-bordo-800 underline">
            Ver eventos
          </Link>
        </motion.div>
      ) : (
        <div className="mt-6 space-y-8">
          {proximas.length > 0 && (
            <div>
              <h2 className="mb-3 font-heading font-bold text-foreground">
                Próximos eventos
              </h2>
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="space-y-3"
              >
                {proximas.map((entrada) => (
                  <EntradaCard
                    key={entrada.id}
                    entrada={entrada}
                    onShowQR={() => handleShowQR(entrada)}
                  />
                ))}
              </motion.div>
            </div>
          )}

          {pasadas.length > 0 && (
            <div>
              <h2 className="mb-3 font-heading font-bold text-muted-foreground">
                Eventos pasados
              </h2>
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="space-y-3"
              >
                {pasadas.map((entrada) => (
                  <EntradaCard
                    key={entrada.id}
                    entrada={entrada}
                    onShowQR={() => handleShowQR(entrada)}
                  />
                ))}
              </motion.div>
            </div>
          )}
        </div>
      )}

      {/* QR Dialog */}
      <Dialog
        open={!!selectedEntrada}
        onOpenChange={(v) => !v && setSelectedEntrada(null)}
      >
        <DialogContent className="sm:max-w-sm text-center">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">
              {selectedEntrada?.eventos?.titulo}
            </DialogTitle>
          </DialogHeader>

          <div className="py-4">
            {qrDataUrl ? (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center gap-3"
              >
                <Image
                  src={qrDataUrl}
                  alt="QR de entrada"
                  width={256}
                  height={256}
                  className="rounded-lg"
                />
                <p className="text-xs text-muted-foreground font-mono">
                  {selectedEntrada?.codigo}
                </p>
              </motion.div>
            ) : (
              <div className="flex justify-center">
                <Loader2 className="size-8 animate-spin text-bordo-700" />
              </div>
            )}

            {selectedEntrada && (
              <div className="mt-4 text-sm text-muted-foreground space-y-1">
                <p>
                  <span className="font-medium text-foreground">
                    {selectedEntrada.nombre_asistente}
                  </span>
                </p>
                <p>{selectedEntrada.tipo_entradas?.nombre}</p>
                {selectedEntrada.lotes_entrada && (
                  <p>{selectedEntrada.lotes_entrada.nombre}</p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EntradaCard({
  entrada,
  onShowQR,
}: {
  entrada: MiEntrada;
  onShowQR: () => void;
}) {
  const evento = entrada.eventos;
  if (!evento) return null;

  const fecha = new Date(evento.fecha_inicio);
  const estadoConfig = ESTADO_CONFIG[entrada.estado] || ESTADO_CONFIG.pendiente;

  return (
    <motion.div
      variants={fadeInUp}
      className="rounded-xl border border-linea bg-white p-4 transition-shadow hover:shadow-card"
    >
      <div className="flex gap-4">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-superficie">
          {evento.imagen_url ? (
            <Image
              src={evento.imagen_url}
              alt={evento.titulo}
              fill
              className="object-cover"
              sizes="80px"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Calendar className="size-6 text-muted-foreground/30" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-heading font-bold text-foreground truncate">
                {evento.titulo}
              </h3>
              <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="size-3" />
                  {fecha.toLocaleDateString("es-UY", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {evento.lugar && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" />
                    {evento.lugar}
                  </span>
                )}
              </div>
            </div>
            <Badge className={`gap-1 shrink-0 ${estadoConfig.color}`}>
              {estadoConfig.icon}
              {estadoConfig.label}
            </Badge>
          </div>

          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {entrada.tipo_entradas?.nombre}
              {entrada.lotes_entrada ? ` — ${entrada.lotes_entrada.nombre}` : ""}
            </span>
            {entrada.estado === "pagada" && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={onShowQR}
              >
                <QrCode className="size-3" />
                Ver QR
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
