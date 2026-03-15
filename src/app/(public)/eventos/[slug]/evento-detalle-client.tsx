"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Calendar,
  MapPin,
  Ticket,
  Users,
  Minus,
  Plus,
  Lock,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  fadeInUp,
  fadeInLeft,
  staggerContainer,
  staggerContainerFast,
  easeSmooth,
  easeDramatic,
  scaleIn,
  springSmooth,
} from "@/lib/motion";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

interface LoteEntrada {
  id: number;
  nombre: string;
  precio: number;
  cantidad: number;
  vendidas: number;
  fecha_inicio: string;
  fecha_fin: string | null;
  estado: string;
}

interface TipoEntrada {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: number;
  capacidad: number | null;
  solo_socios: boolean;
  lotes: LoteEntrada[];
  lote_activo: LoteEntrada | null;
  vendidas: number;
  disponibles: number;
}

interface EventoDetalle {
  id: number;
  titulo: string;
  slug: string;
  descripcion: string | null;
  descripcion_corta: string | null;
  imagen_url: string | null;
  lugar: string | null;
  direccion: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  capacidad_total: number | null;
  estado: string;
  es_gratuito: boolean;
  requiere_registro: boolean;
  tipo_entradas: TipoEntrada[];
  total_vendidas: number;
}

export function EventoDetalleClient({ slug }: { slug: string }) {
  const [evento, setEvento] = useState<EventoDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTipo, setSelectedTipo] = useState<TipoEntrada | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const [showCompra, setShowCompra] = useState(false);
  const [comprando, setComprando] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [perfil, setPerfil] = useState<any>(null);

  const searchParams = useSearchParams();
  const compraStatus = searchParams.get("compra");

  // Fetch event data
  useEffect(() => {
    async function fetchEvento() {
      try {
        const res = await fetch(`/api/eventos/${slug}`);
        if (res.ok) {
          const data = await res.json();
          setEvento(data);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchEvento();
  }, [slug]);

  // Fetch user/profile
  useEffect(() => {
    async function fetchUser() {
      const supabase = createBrowserClient();
      const {
        data: { user: u },
      } = await supabase.auth.getUser();
      setUser(u);

      if (u) {
        const { data: p } = await (supabase as any)
          .from("perfiles")
          .select("nombre, apellido, cedula, es_socio")
          .eq("id", u.id)
          .single();
        setPerfil(p);
      }
    }
    fetchUser();
  }, []);

  // Show status toast
  useEffect(() => {
    if (compraStatus === "exitosa") {
      toast.success("¡Compra exitosa!", {
        description: "Tus entradas ya están disponibles en Mi Cuenta",
      });
    } else if (compraStatus === "fallida") {
      toast.error("La compra no se pudo completar");
    }
  }, [compraStatus]);

  const handleComprar = (tipo: TipoEntrada) => {
    if (!user) {
      window.location.href = `/login?redirect=/eventos/${slug}`;
      return;
    }
    if (tipo.solo_socios && !perfil?.es_socio) {
      toast.error("Esta entrada es solo para socios del club");
      return;
    }
    setSelectedTipo(tipo);
    setCantidad(1);
    setShowCompra(true);
  };

  const handleConfirmarCompra = async (formData: {
    nombre: string;
    cedula: string;
    email: string;
  }) => {
    if (!selectedTipo || !evento) return;

    setComprando(true);
    try {
      const res = await fetch("/api/eventos/comprar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evento_id: evento.id,
          tipo_entrada_id: selectedTipo.id,
          lote_id: selectedTipo.lote_activo!.id,
          cantidad,
          nombre_asistente: formData.nombre,
          cedula_asistente: formData.cedula || undefined,
          email_asistente: formData.email,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Error al procesar la compra");
        return;
      }

      if (data.gratuito) {
        toast.success("¡Registro exitoso!", {
          description: "Tus entradas ya están en Mi Cuenta",
        });
        setShowCompra(false);
        // Refresh event data
        const refreshRes = await fetch(`/api/eventos/${slug}`);
        if (refreshRes.ok) setEvento(await refreshRes.json());
      } else if (data.checkout_url) {
        window.location.href = data.checkout_url;
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setComprando(false);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: evento?.titulo,
        url: window.location.href,
      });
    } else {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copiado al portapapeles");
    }
  };

  if (loading) {
    return <EventoDetailSkeleton />;
  }

  if (!evento) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-20 text-center">
        <XCircle className="mx-auto mb-4 size-16 text-muted-foreground/30" />
        <h1 className="text-xl font-heading font-bold">
          Evento no encontrado
        </h1>
        <Link
          href="/eventos"
          className="mt-4 inline-block text-bordo-800 underline"
        >
          Ver todos los eventos
        </Link>
      </div>
    );
  }

  const fecha = new Date(evento.fecha_inicio);
  const capacidadPorcentaje = evento.capacidad_total
    ? Math.round((evento.total_vendidas / evento.capacidad_total) * 100)
    : null;

  const minPrice = evento.tipo_entradas.reduce((min, tipo) => {
    const precio = tipo.lote_activo ? tipo.lote_activo.precio : tipo.precio;
    return precio < min ? precio : min;
  }, Infinity);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* ====== HERO SECTION ====== */}
      <div className="relative">
        {/* Hero image / gradient background */}
        <div className="relative h-[50vh] min-h-[360px] max-h-[520px] w-full overflow-hidden bg-bordo-950">
          {evento.imagen_url ? (
            <>
              <Image
                src={evento.imagen_url}
                alt={evento.titulo}
                fill
                className="object-cover"
                priority
                sizes="100vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-bordo-950/90 via-bordo-950/40 to-transparent" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-bordo-950 via-bordo-800 to-bordo-900">
              <div className="absolute inset-0 opacity-[0.04]" style={{
                backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
                backgroundSize: "32px 32px",
              }} />
            </div>
          )}

          {/* Back button overlay */}
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="absolute top-6 left-6 z-10"
          >
            <Link
              href="/eventos"
              className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md px-4 py-2 text-sm font-medium text-white/90 hover:bg-white/20 transition-colors"
            >
              <ArrowLeft className="size-4" />
              Eventos
            </Link>
          </motion.div>

          {/* Share button */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="absolute top-6 right-6 z-10"
          >
            <button
              onClick={handleShare}
              className="inline-flex items-center justify-center size-10 rounded-full bg-white/10 backdrop-blur-md text-white/90 hover:bg-white/20 transition-colors"
            >
              <Share2 className="size-4" />
            </button>
          </motion.div>

          {/* Hero content */}
          <div className="absolute inset-x-0 bottom-0 z-10">
            <div className="mx-auto max-w-5xl px-6 pb-8 md:pb-10">
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
              >
                {/* Badges */}
                <motion.div
                  variants={fadeInUp}
                  className="mb-3 flex flex-wrap items-center gap-2"
                >
                  {evento.es_gratuito && (
                    <span className="inline-flex items-center rounded-full bg-dorado-300/90 px-3 py-1 text-xs font-bold uppercase tracking-wider text-bordo-950">
                      Gratis
                    </span>
                  )}
                  {evento.estado === "agotado" && (
                    <span className="inline-flex items-center rounded-full bg-red-500/90 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
                      Agotado
                    </span>
                  )}
                </motion.div>

                {/* Title */}
                <motion.h1
                  variants={fadeInUp}
                  className="font-display text-4xl font-bold text-white md:text-5xl lg:text-6xl tracking-tightest leading-[0.95]"
                >
                  {evento.titulo}
                </motion.h1>

                {/* Short description */}
                {evento.descripcion_corta && (
                  <motion.p
                    variants={fadeInUp}
                    className="mt-3 max-w-2xl text-base text-white/70 md:text-lg"
                  >
                    {evento.descripcion_corta}
                  </motion.p>
                )}
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* ====== META BAR ====== */}
      <div className="border-b border-linea bg-white">
        <div className="mx-auto max-w-5xl px-6">
          <motion.div
            variants={staggerContainerFast}
            initial="hidden"
            animate="visible"
            className="flex flex-wrap items-center gap-x-6 gap-y-3 py-5"
          >
            <motion.div
              variants={fadeInUp}
              className="flex items-center gap-2.5 text-sm text-foreground"
            >
              <div className="flex items-center justify-center size-9 rounded-lg bg-bordo-50 text-bordo-800">
                <Calendar className="size-4" />
              </div>
              <div>
                <p className="font-heading font-bold capitalize">
                  {format(fecha, "EEEE d 'de' MMMM", { locale: es })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {format(fecha, "yyyy — HH:mm'hs'", { locale: es })}
                </p>
              </div>
            </motion.div>

            {evento.lugar && (
              <>
                <Separator orientation="vertical" className="hidden sm:block h-8" />
                <motion.div
                  variants={fadeInUp}
                  className="flex items-center gap-2.5 text-sm text-foreground"
                >
                  <div className="flex items-center justify-center size-9 rounded-lg bg-bordo-50 text-bordo-800">
                    <MapPin className="size-4" />
                  </div>
                  <div>
                    <p className="font-heading font-bold">{evento.lugar}</p>
                    {evento.direccion && (
                      <p className="text-xs text-muted-foreground">
                        {evento.direccion}
                      </p>
                    )}
                  </div>
                </motion.div>
              </>
            )}

            {capacidadPorcentaje !== null && (
              <>
                <Separator orientation="vertical" className="hidden sm:block h-8" />
                <motion.div
                  variants={fadeInUp}
                  className="flex items-center gap-2.5 text-sm text-foreground"
                >
                  <div className="flex items-center justify-center size-9 rounded-lg bg-bordo-50 text-bordo-800">
                    <Users className="size-4" />
                  </div>
                  <div>
                    <p className="font-heading font-bold">
                      {evento.total_vendidas} / {evento.capacidad_total}
                    </p>
                    <div className="mt-0.5 h-1.5 w-20 rounded-full bg-superficie overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${capacidadPorcentaje}%` }}
                        transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.5 }}
                        className={`h-full rounded-full ${
                          capacidadPorcentaje > 90
                            ? "bg-red-500"
                            : capacidadPorcentaje > 70
                              ? "bg-dorado-400"
                              : "bg-bordo-800"
                        }`}
                      />
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </motion.div>
        </div>
      </div>

      {/* ====== MAIN CONTENT ====== */}
      <div className="mx-auto max-w-5xl px-6 py-10 md:py-14">
        <div className="grid gap-10 md:grid-cols-[1fr_380px] md:gap-14">
          {/* Left column — description */}
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {evento.descripcion && (
              <motion.div variants={fadeInUp}>
                <h2 className="mb-4 font-heading text-lg font-bold text-foreground tracking-tight">
                  Sobre el evento
                </h2>
                <div
                  className="prose prose-neutral max-w-none text-muted-foreground prose-headings:font-heading prose-headings:text-foreground prose-a:text-bordo-800"
                  dangerouslySetInnerHTML={{
                    __html: evento.descripcion.replace(/\n/g, "<br/>"),
                  }}
                />
              </motion.div>
            )}

            {/* Additional event info */}
            {evento.fecha_fin && (
              <motion.div
                variants={fadeInUp}
                className="mt-8 flex items-center gap-3 rounded-xl bg-superficie/80 border border-linea p-4"
              >
                <Clock className="size-5 text-bordo-800 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-foreground">Duración del evento</p>
                  <p className="text-muted-foreground">
                    {format(fecha, "HH:mm", { locale: es })} —{" "}
                    {format(new Date(evento.fecha_fin), "HH:mm'hs'", { locale: es })}
                  </p>
                </div>
              </motion.div>
            )}
          </motion.div>

          {/* Right column — tickets */}
          <div className="md:sticky md:top-24 md:self-start">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...easeSmooth, delay: 0.3 }}
              className="rounded-2xl border border-linea bg-white shadow-card overflow-hidden"
            >
              {/* Ticket header */}
              <div className="bg-gradient-to-r from-bordo-800 to-bordo-900 px-6 py-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white">
                    <Ticket className="size-5" />
                    <h2 className="font-heading text-lg font-bold">Entradas</h2>
                  </div>
                  {!evento.es_gratuito && minPrice < Infinity && (
                    <p className="text-sm text-white/70">
                      desde{" "}
                      <span className="font-display text-lg font-bold text-dorado-300">
                        ${minPrice.toLocaleString("es-UY")}
                      </span>
                    </p>
                  )}
                </div>
              </div>

              {/* Ticket list */}
              <div className="divide-y divide-linea">
                {evento.tipo_entradas.map((tipo, i) => (
                  <TicketTypeCard
                    key={tipo.id}
                    tipo={tipo}
                    esGratuito={evento.es_gratuito}
                    onComprar={() => handleComprar(tipo)}
                    index={i}
                  />
                ))}

                {evento.tipo_entradas.length === 0 && (
                  <div className="px-6 py-8 text-center">
                    <Ticket className="mx-auto mb-2 size-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      No hay entradas disponibles
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* ====== MOBILE STICKY CTA ====== */}
      {evento.tipo_entradas.some((t) => t.lote_activo && t.disponibles > 0) && (
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          transition={{ delay: 0.8, ...springSmooth }}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-linea bg-white/95 backdrop-blur-md p-4 md:hidden"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              {!evento.es_gratuito && minPrice < Infinity ? (
                <p className="text-sm text-muted-foreground">
                  Desde{" "}
                  <span className="font-display text-xl font-bold text-foreground">
                    ${minPrice.toLocaleString("es-UY")}
                  </span>
                </p>
              ) : (
                <p className="font-heading font-bold text-foreground">
                  Entrada gratuita
                </p>
              )}
            </div>
            <Button
              className="bg-bordo-800 hover:bg-bordo-900 text-white px-6"
              size="lg"
              onClick={() => {
                const ticketSection = document.querySelector("[data-tickets]");
                ticketSection?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              {evento.es_gratuito ? "Registrarse" : "Comprar"}
            </Button>
          </div>
        </motion.div>
      )}

      {/* Purchase dialog */}
      <CompraDialog
        open={showCompra}
        onOpenChange={setShowCompra}
        tipo={selectedTipo}
        cantidad={cantidad}
        setCantidad={setCantidad}
        evento={evento}
        user={user}
        perfil={perfil}
        comprando={comprando}
        onConfirmar={handleConfirmarCompra}
      />

      {/* Success banner */}
      <AnimatePresence>
        {compraStatus === "exitosa" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl bg-green-50 border border-green-200 px-6 py-4 shadow-lg"
          >
            <CheckCircle2 className="size-5 text-green-600" />
            <div>
              <p className="font-medium text-green-800">¡Compra exitosa!</p>
              <Link
                href="/mi-cuenta/entradas"
                className="text-sm text-green-600 underline"
              >
                Ver mis entradas
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// --- Skeleton ---

function EventoDetailSkeleton() {
  return (
    <div>
      <Skeleton className="h-[50vh] min-h-[360px] max-h-[520px] w-full" />
      <div className="border-b border-linea bg-white">
        <div className="mx-auto max-w-5xl px-6 py-5 flex gap-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-36" />
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="grid gap-10 md:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

// --- Ticket type card ---

function TicketTypeCard({
  tipo,
  esGratuito,
  onComprar,
  index,
}: {
  tipo: TipoEntrada;
  esGratuito: boolean;
  onComprar: () => void;
  index: number;
}) {
  const lote = tipo.lote_activo;
  const agotado = !lote || tipo.disponibles <= 0;
  const precio = lote ? lote.precio : tipo.precio;

  return (
    <motion.div
      data-tickets
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 + index * 0.08, ...easeSmooth }}
      className={`group px-6 py-5 transition-colors ${
        agotado
          ? "opacity-50"
          : "hover:bg-bordo-50/40 cursor-pointer"
      }`}
      onClick={agotado ? undefined : onComprar}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-heading font-bold text-foreground truncate">
              {tipo.nombre}
            </h3>
            {tipo.solo_socios && (
              <Badge
                variant="outline"
                className="gap-1 text-[10px] shrink-0 border-bordo-200 text-bordo-800"
              >
                <Lock className="size-2.5" />
                Socios
              </Badge>
            )}
          </div>

          {lote && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {lote.nombre}
              {!agotado && (
                <span className="ml-1.5 text-xs text-muted-foreground/70">
                  · {tipo.disponibles} disponible
                  {tipo.disponibles !== 1 ? "s" : ""}
                </span>
              )}
            </p>
          )}

          {tipo.descripcion && (
            <p className="mt-1 text-xs text-muted-foreground/80 line-clamp-1">
              {tipo.descripcion}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <p className="font-display text-xl font-bold text-foreground">
            {esGratuito
              ? "Gratis"
              : `$${precio.toLocaleString("es-UY")}`}
          </p>
          {!agotado && (
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Button
                size="sm"
                className="bg-bordo-800 hover:bg-bordo-900 text-white rounded-lg shadow-sm font-medium"
                onClick={(e) => {
                  e.stopPropagation();
                  onComprar();
                }}
              >
                {esGratuito ? "Ir" : "Comprar"}
              </Button>
            </motion.div>
          )}
          {agotado && (
            <Badge variant="secondary" className="text-xs">
              Agotado
            </Badge>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// --- Purchase dialog ---

function CompraDialog({
  open,
  onOpenChange,
  tipo,
  cantidad,
  setCantidad,
  evento,
  user,
  perfil,
  comprando,
  onConfirmar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tipo: TipoEntrada | null;
  cantidad: number;
  setCantidad: (n: number) => void;
  evento: EventoDetalle | null;
  user: any;
  perfil: any;
  comprando: boolean;
  onConfirmar: (data: {
    nombre: string;
    cedula: string;
    email: string;
  }) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [cedula, setCedula] = useState("");
  const [email, setEmail] = useState("");

  // Pre-fill from profile
  useEffect(() => {
    if (open && perfil && user) {
      setNombre(
        `${perfil.nombre || ""} ${perfil.apellido || ""}`.trim()
      );
      setCedula(perfil.cedula || "");
      setEmail(user.email || "");
    }
  }, [open, perfil, user]);

  if (!tipo || !evento) return null;

  const lote = tipo.lote_activo;
  if (!lote) return null;

  const maxCantidad = Math.min(tipo.disponibles, 10);
  const total = lote.precio * cantidad;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md overflow-hidden p-0">
        {/* Dialog header with color */}
        <div className="bg-gradient-to-r from-bordo-800 to-bordo-900 px-6 py-5 text-white">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg text-white">
              {evento.es_gratuito ? "Registrarse" : "Comprar entradas"}
            </DialogTitle>
            <DialogDescription className="text-white/70">
              {evento.titulo} — {tipo.nombre}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* Quantity selector */}
          <div>
            <Label className="text-sm font-medium">Cantidad</Label>
            <div className="mt-2 flex items-center gap-3">
              <motion.div whileTap={{ scale: 0.9 }}>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9 rounded-lg"
                  onClick={() => setCantidad(Math.max(1, cantidad - 1))}
                  disabled={cantidad <= 1}
                >
                  <Minus className="size-3.5" />
                </Button>
              </motion.div>
              <span className="w-8 text-center font-display text-xl font-bold">
                {cantidad}
              </span>
              <motion.div whileTap={{ scale: 0.9 }}>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-9 rounded-lg"
                  onClick={() =>
                    setCantidad(Math.min(maxCantidad, cantidad + 1))
                  }
                  disabled={cantidad >= maxCantidad}
                >
                  <Plus className="size-3.5" />
                </Button>
              </motion.div>
            </div>
          </div>

          {/* Attendee info */}
          <div className="space-y-3">
            <div>
              <Label htmlFor="nombre">Nombre del asistente</Label>
              <Input
                id="nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre completo"
                required
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="cedula">Cédula (opcional)</Label>
              <Input
                id="cedula"
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
                placeholder="1.234.567-8"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                className="mt-1"
              />
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-xl bg-superficie border border-linea p-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {tipo.nombre} · {lote.nombre} x{cantidad}
              </span>
              <span className="font-medium">
                {evento.es_gratuito
                  ? "Gratis"
                  : `$${total.toLocaleString("es-UY")}`}
              </span>
            </div>
            {!evento.es_gratuito && (
              <div className="mt-3 flex justify-between border-t border-linea pt-3">
                <span className="font-heading font-bold">Total</span>
                <span className="font-display text-xl font-bold text-bordo-800">
                  ${total.toLocaleString("es-UY")}
                </span>
              </div>
            )}
          </div>

          {/* Submit */}
          <motion.div whileTap={{ scale: 0.98 }}>
            <Button
              className="w-full bg-bordo-800 hover:bg-bordo-900 text-white"
              size="lg"
              disabled={comprando || !nombre || !email}
              onClick={() => onConfirmar({ nombre, cedula, email })}
            >
              {comprando
                ? "Procesando..."
                : evento.es_gratuito
                  ? "Confirmar registro"
                  : "Pagar con MercadoPago"}
            </Button>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
