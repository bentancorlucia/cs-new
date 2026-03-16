"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  CreditCard,
  Hash,
  Dumbbell,
  Loader2,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  fadeInUp,
  scaleIn,
  staggerContainer,
  springSmooth,
  easeSmooth,
  easeDramatic,
} from "@/lib/motion";

interface SocioData {
  nombre: string;
  apellido: string;
  cedula_masked: string | null;
  numero_socio: string | null;
  estado: "activo" | "inactivo" | "moroso" | "suspendido";
  avatar_url: string | null;
  disciplinas: string[];
}

const estadoConfig = {
  activo: {
    label: "SOCIO ACTIVO",
    color: "text-emerald-700",
    bg: "bg-emerald-50 border-emerald-200",
    icon: CheckCircle2,
    dot: "bg-emerald-500",
  },
  moroso: {
    label: "CUOTA PENDIENTE",
    color: "text-amber-700",
    bg: "bg-amber-50 border-amber-200",
    icon: AlertTriangle,
    dot: "bg-amber-500",
  },
  inactivo: {
    label: "SOCIO INACTIVO",
    color: "text-gray-500",
    bg: "bg-gray-50 border-gray-200",
    icon: XCircle,
    dot: "bg-gray-400",
  },
  suspendido: {
    label: "SOCIO SUSPENDIDO",
    color: "text-red-700",
    bg: "bg-red-50 border-red-200",
    icon: XCircle,
    dot: "bg-red-500",
  },
};

export default function VerificarSocioPage() {
  const { id } = useParams<{ id: string }>();
  const [socio, setSocio] = useState<SocioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function fetchSocio() {
      try {
        const res = await fetch(`/api/socios/verificar/${id}`);
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const data = await res.json();
        setSocio(data);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    if (id) fetchSocio();
  }, [id]);

  return (
    <div className="min-h-dvh bg-fondo relative overflow-hidden">
      {/* Background decorations — matching site style */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-bordo-800/[0.04] blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] rounded-full bg-dorado-300/[0.06] blur-3xl" />
      </div>

      {/* Top bar — bordó stripe like the site */}
      <div className="h-1 w-full bg-gradient-to-r from-bordo-800 via-bordo-600 to-dorado-400" />

      <div className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100dvh-4px)] px-4 py-12">
        {/* Logo header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={easeSmooth}
          className="flex flex-col items-center mb-8"
        >
          <Image
            src="/images/escudo/logo-cs.png"
            alt="Club Seminario"
            width={56}
            height={56}
            className="mb-3"
          />
          <p className="font-heading text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Verificación de socio
          </p>
        </motion.div>

        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4"
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "linear",
                }}
              >
                <Loader2 className="w-7 h-7 text-bordo-600" />
              </motion.div>
              <p className="text-muted-foreground font-body text-sm">
                Verificando...
              </p>
            </motion.div>
          ) : notFound ? (
            <motion.div
              key="not-found"
              initial="hidden"
              animate="visible"
              variants={staggerContainer}
              className="text-center max-w-sm"
            >
              <motion.div variants={scaleIn} transition={springSmooth}>
                <div className="w-20 h-20 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-6">
                  <XCircle className="w-9 h-9 text-red-500" />
                </div>
              </motion.div>
              <motion.h1
                variants={fadeInUp}
                transition={easeSmooth}
                className="font-display text-2xl sm:text-3xl text-foreground mb-2 uppercase tracking-tight"
              >
                Socio no encontrado
              </motion.h1>
              <motion.p
                variants={fadeInUp}
                transition={easeSmooth}
                className="text-muted-foreground font-body text-sm leading-relaxed mb-8"
              >
                El código QR escaneado no corresponde a un socio registrado en
                Club Seminario.
              </motion.p>
              <motion.div variants={fadeInUp} transition={easeSmooth}>
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-bordo-800 text-white font-heading text-xs uppercase tracking-[0.15em] hover:bg-bordo-900 transition-colors"
                >
                  Ir al sitio
                </Link>
              </motion.div>
            </motion.div>
          ) : socio ? (
            <motion.div
              key="socio"
              initial="hidden"
              animate="visible"
              variants={staggerContainer}
              className="w-full max-w-md"
            >
              {/* Main card */}
              <motion.div
                variants={scaleIn}
                transition={easeDramatic}
                className="bg-white rounded-2xl shadow-card overflow-hidden border border-linea"
              >
                {/* Card header — bordó gradient */}
                <div className="relative bg-gradient-to-br from-bordo-800 to-bordo-950 px-8 pt-8 pb-14 text-center">
                  {/* Subtle pattern overlay */}
                  <div
                    className="absolute inset-0 opacity-[0.05]"
                    style={{
                      backgroundImage:
                        "radial-gradient(circle at 20% 50%, rgba(247,182,67,0.4), transparent 50%), radial-gradient(circle at 80% 20%, rgba(247,182,67,0.3), transparent 40%)",
                    }}
                  />

                  <motion.div
                    variants={fadeInUp}
                    transition={easeSmooth}
                    className="relative z-10"
                  >
                    <p className="font-heading text-[10px] uppercase tracking-[0.25em] text-dorado-300 mb-1">
                      Club Seminario
                    </p>
                    <h1 className="font-display text-3xl sm:text-4xl text-white uppercase tracking-tight leading-none">
                      {socio.nombre}
                    </h1>
                    <h2 className="font-display text-3xl sm:text-4xl text-white/60 uppercase tracking-tight leading-none mt-1">
                      {socio.apellido}
                    </h2>
                  </motion.div>
                </div>

                {/* Avatar — overlapping header/body */}
                <div className="flex justify-center -mt-10 relative z-10">
                  <motion.div
                    variants={scaleIn}
                    transition={springSmooth}
                  >
                    {socio.avatar_url ? (
                      <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-white shadow-lg">
                        <Image
                          src={socio.avatar_url}
                          alt={`${socio.nombre} ${socio.apellido}`}
                          width={80}
                          height={80}
                          className="object-cover w-full h-full"
                        />
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-bordo-50 border-4 border-white shadow-lg flex items-center justify-center">
                        <span className="font-display text-xl text-bordo-800">
                          {socio.nombre[0]}
                          {socio.apellido[0]}
                        </span>
                      </div>
                    )}
                  </motion.div>
                </div>

                {/* Body */}
                <div className="px-8 pt-5 pb-8">
                  {/* Status badge */}
                  <motion.div
                    variants={scaleIn}
                    transition={springSmooth}
                    className="flex justify-center mb-6"
                  >
                    {(() => {
                      const config = estadoConfig[socio.estado];
                      if (!config) return null;
                      const Icon = config.icon;
                      return (
                        <div
                          className={`inline-flex items-center gap-2 px-5 py-2 rounded-full border ${config.bg}`}
                        >
                          <Icon className={`w-4 h-4 ${config.color}`} />
                          <span
                            className={`font-heading text-xs font-bold tracking-[0.15em] ${config.color}`}
                          >
                            {config.label}
                          </span>
                        </div>
                      );
                    })()}
                  </motion.div>

                  {/* Info rows */}
                  <motion.div
                    variants={fadeInUp}
                    transition={easeSmooth}
                    className="space-y-3"
                  >
                    {socio.numero_socio && (
                      <InfoRow
                        icon={Hash}
                        label="N° de socio"
                        value={socio.numero_socio}
                      />
                    )}

                    {socio.cedula_masked && (
                      <InfoRow
                        icon={CreditCard}
                        label="Cédula"
                        value={socio.cedula_masked}
                      />
                    )}

                    {socio.disciplinas.length > 0 && (
                      <InfoRow
                        icon={Dumbbell}
                        label="Disciplinas"
                        value={socio.disciplinas.join(", ")}
                      />
                    )}
                  </motion.div>
                </div>

                {/* Card footer */}
                <motion.div
                  variants={fadeInUp}
                  transition={easeSmooth}
                  className="border-t border-linea px-8 py-4 flex items-center justify-between bg-superficie/50"
                >
                  <p className="text-muted-foreground font-body text-xs">
                    clubseminario.com.uy
                  </p>
                  <p className="text-muted-foreground font-body text-xs">
                    {new Date().toLocaleDateString("es-UY", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </motion.div>
              </motion.div>

              {/* Link to site */}
              <motion.div
                variants={fadeInUp}
                transition={easeSmooth}
                className="text-center mt-6"
              >
                <Link
                  href="/"
                  className="text-bordo-700 font-heading text-xs uppercase tracking-[0.15em] hover:text-bordo-900 transition-colors underline underline-offset-4 decoration-bordo-200 hover:decoration-bordo-400"
                >
                  Visitar Club Seminario
                </Link>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-xl bg-superficie border border-linea">
      <div className="w-9 h-9 rounded-xl bg-bordo-50 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-bordo-800" />
      </div>
      <div className="min-w-0">
        <p className="text-muted-foreground font-body text-[10px] uppercase tracking-[0.15em]">
          {label}
        </p>
        <p className="text-foreground font-heading text-sm font-medium truncate">
          {value}
        </p>
      </div>
    </div>
  );
}
