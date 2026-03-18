"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Scanner } from "@yudiel/react-qr-scanner";
import { createBrowserClient } from "@/lib/supabase/client";
import { feedbackForResult, resultadoConfig } from "@/lib/qr/feedback";
import {
  fadeInUp,
  staggerContainer,
  springSmooth,
  scaleIn,
} from "@/lib/motion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ScanLine,
  Loader2,
  Users,
  Shield,
  ShieldCheck,
  ShieldX,
  ShieldAlert,
} from "lucide-react";

// --- Types ---

type ScanResultado =
  | "valido"
  | "ya_usado"
  | "no_encontrado"
  | "evento_incorrecto"
  | "cancelada";

interface ScanResponse {
  resultado: ScanResultado;
  mensaje: string;
  entrada: {
    id: number;
    nombre_asistente: string | null;
    cedula_asistente: string | null;
    tipo_entrada: string | null;
    codigo: string;
  } | null;
}

interface Evento {
  id: number;
  titulo: string;
  slug: string;
  fecha_inicio: string;
  capacidad_total: number | null;
}

interface EscaneoLog {
  id: number;
  resultado: ScanResultado;
  codigo_escaneado: string;
  created_at: string;
  nombre?: string | null;
  tipo_entrada?: string | null;
}

// --- Full-screen overlay config ---

const overlayConfig: Record<
  ScanResultado,
  {
    gradient: string;
    Icon: typeof CheckCircle2;
    title: string;
    subtitle: string;
  }
> = {
  valido: {
    gradient: "from-green-500 to-emerald-600",
    Icon: ShieldCheck,
    title: "INGRESO VÁLIDO",
    subtitle: "Entrada registrada correctamente",
  },
  ya_usado: {
    gradient: "from-amber-500 to-orange-600",
    Icon: ShieldAlert,
    title: "YA INGRESÓ",
    subtitle: "Esta entrada ya fue escaneada",
  },
  no_encontrado: {
    gradient: "from-red-500 to-rose-700",
    Icon: ShieldX,
    title: "QR NO VÁLIDO",
    subtitle: "No se encontró ninguna entrada",
  },
  evento_incorrecto: {
    gradient: "from-red-500 to-rose-700",
    Icon: ShieldX,
    title: "OTRO EVENTO",
    subtitle: "Esta entrada no corresponde a este evento",
  },
  cancelada: {
    gradient: "from-red-500 to-rose-700",
    Icon: ShieldX,
    title: "CANCELADA",
    subtitle: "Esta entrada fue cancelada",
  },
};

// --- Component ---

export function ScannerClient() {
  const supabase = createBrowserClient();

  const [eventos, setEventos] = useState<Evento[]>([]);
  const [eventoId, setEventoId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Scan state
  const [lastScan, setLastScan] = useState<ScanResponse | null>(null);
  const [scanning, setScanning] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const scanningRef = useRef(false);

  // Track ALL scanned codes in this session to prevent double scans
  const scannedCodesRef = useRef<Set<string>>(new Set());
  const overlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Time-based debounce: silently ignore the same code detected repeatedly by the camera
  const lastCodeRef = useRef<string>("");
  const lastCodeTimeRef = useRef<number>(0);

  // Stats
  const [ingresaron, setIngresaron] = useState(0);
  const [capacidadTotal, setCapacidadTotal] = useState<number | null>(null);
  const [escaneos, setEscaneos] = useState<EscaneoLog[]>([]);

  // Load upcoming events
  useEffect(() => {
    async function loadEventos() {
      const { data } = await (supabase as any)
        .from("eventos")
        .select("id, titulo, slug, fecha_inicio, capacidad_total")
        .in("estado", ["publicado", "borrador"])
        .gte(
          "fecha_inicio",
          new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        )
        .order("fecha_inicio", { ascending: true });

      setEventos(data || []);
      setLoading(false);
    }
    loadEventos();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset when event changes
  useEffect(() => {
    if (!eventoId) return;

    const evento = eventos.find((e) => e.id === eventoId);
    setCapacidadTotal(evento?.capacidad_total || null);
    setLastScan(null);
    setEscaneos([]);
    setIngresaron(0);
    scannedCodesRef.current.clear();

    async function loadStats() {
      const { count } = await (supabase as any)
        .from("entradas")
        .select("id", { count: "exact", head: true })
        .eq("evento_id", eventoId)
        .eq("estado", "usada");

      setIngresaron(count || 0);

      // Load recent scans with entry names
      const { data: recentScans } = await (supabase as any)
        .from("escaneos_entrada")
        .select(
          "id, resultado, codigo_escaneado, created_at, entradas(nombre_asistente, tipo_entradas(nombre))"
        )
        .eq("evento_id", eventoId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (recentScans) {
        // Add already-scanned codes to the set
        for (const s of recentScans) {
          if (s.resultado === "valido" || s.resultado === "ya_usado") {
            scannedCodesRef.current.add(s.codigo_escaneado);
          }
        }

        setEscaneos(
          recentScans.map((s: any) => ({
            id: s.id,
            resultado: s.resultado,
            codigo_escaneado: s.codigo_escaneado,
            created_at: s.created_at,
            nombre: s.entradas?.nombre_asistente || null,
            tipo_entrada: s.entradas?.tipo_entradas?.nombre || null,
          }))
        );
      }
    }
    loadStats();
  }, [eventoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Supabase Realtime subscription
  useEffect(() => {
    if (!eventoId) return;

    const channel = supabase
      .channel(`escaneos-${eventoId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "escaneos_entrada",
          filter: `evento_id=eq.${eventoId}`,
        },
        (payload) => {
          const newScan = payload.new as any;
          setEscaneos((prev) => {
            // Avoid duplicates from our own insert
            if (prev.some((s) => s.id === newScan.id)) return prev;
            return [
              {
                id: newScan.id,
                resultado: newScan.resultado,
                codigo_escaneado: newScan.codigo_escaneado,
                created_at: newScan.created_at,
                nombre: newScan.nombre_asistente || null,
              },
              ...prev.slice(0, 49),
            ];
          });
          if (newScan.resultado === "valido") {
            setIngresaron((prev) => prev + 1);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle QR scan
  const handleScan = useCallback(
    async (detectedCodes: { rawValue: string }[]) => {
      if (!eventoId || scanningRef.current) return;

      const code = detectedCodes?.[0]?.rawValue;
      if (!code) return;

      const now = Date.now();

      // Time-based debounce: silently ignore same code within 5 seconds
      // This prevents the camera from re-triggering on a QR still in frame
      if (code === lastCodeRef.current && now - lastCodeTimeRef.current < 5000) {
        return;
      }

      // Update debounce tracker
      lastCodeRef.current = code;
      lastCodeTimeRef.current = now;

      // Block double scans for codes already validated in this session
      // Show warning ONCE (the debounce above prevents repeated triggers)
      if (scannedCodesRef.current.has(code)) {
        feedbackForResult("ya_usado");
        setLastScan({
          resultado: "ya_usado",
          mensaje: "Esta entrada ya fue escaneada",
          entrada: null,
        });
        setShowOverlay(true);
        if (overlayTimeoutRef.current) clearTimeout(overlayTimeoutRef.current);
        overlayTimeoutRef.current = setTimeout(() => setShowOverlay(false), 2000);
        return;
      }

      scanningRef.current = true;
      setScanning(true);

      try {
        const res = await fetch("/api/eventos/escanear", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codigo: code, evento_id: eventoId }),
        });
        const data: ScanResponse = await res.json();

        setLastScan(data);
        feedbackForResult(data.resultado);

        // Track scanned codes to prevent future API calls for the same code
        if (data.resultado === "valido" || data.resultado === "ya_usado") {
          scannedCodesRef.current.add(code);
        }

        // Add to local list immediately with name info
        setEscaneos((prev) => [
          {
            id: Date.now(),
            resultado: data.resultado,
            codigo_escaneado: code,
            created_at: new Date().toISOString(),
            nombre: data.entrada?.nombre_asistente || null,
            tipo_entrada: data.entrada?.tipo_entrada || null,
          },
          ...prev.slice(0, 49),
        ]);

        if (data.resultado === "valido") {
          setIngresaron((prev) => prev + 1);
        }

        // Show full-screen overlay
        setShowOverlay(true);
        if (overlayTimeoutRef.current)
          clearTimeout(overlayTimeoutRef.current);
        overlayTimeoutRef.current = setTimeout(
          () => setShowOverlay(false),
          data.resultado === "valido" ? 1800 : 2500
        );
      } catch {
        setLastScan({
          resultado: "no_encontrado",
          mensaje: "Error de conexión",
          entrada: null,
        });
        setShowOverlay(true);
        if (overlayTimeoutRef.current)
          clearTimeout(overlayTimeoutRef.current);
        overlayTimeoutRef.current = setTimeout(
          () => setShowOverlay(false),
          2500
        );
      } finally {
        // Allow next scan after overlay starts fading — short cooldown
        // so a NEW QR can be scanned right away
        setTimeout(() => {
          scanningRef.current = false;
          setScanning(false);
        }, 800);
      }
    },
    [eventoId]
  );

  const porcentaje = capacidadTotal
    ? Math.min(Math.round((ingresaron / capacidadTotal) * 100), 100)
    : null;

  const eventoNombre = eventos.find((e) => e.id === eventoId)?.titulo || null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-bordo-600" />
      </div>
    );
  }

  return (
    <>
      {/* Full-screen overlay */}
      <AnimatePresence>
        {showOverlay && lastScan && (
          <FullScreenOverlay
            resultado={lastScan.resultado}
            entrada={lastScan.entrada}
            mensaje={lastScan.mensaje}
            eventoNombre={eventoNombre}
            onDismiss={() => setShowOverlay(false)}
          />
        )}
      </AnimatePresence>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="flex flex-col lg:flex-row gap-4 lg:gap-6 max-w-6xl mx-auto p-4 lg:p-6 min-h-[calc(100vh-4rem)]"
      >
        {/* Left column: Camera + Controls */}
        <div className="flex flex-col gap-4 lg:w-[55%] shrink-0">
          {/* Header */}
          <motion.div variants={fadeInUp} className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-bordo-600 flex items-center justify-center">
              <ScanLine className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-heading text-xl font-bold tracking-tight">
                Scanner de Entradas
              </h1>
              <p className="text-muted-foreground text-xs">
                Escaneá el QR para validar ingreso
              </p>
            </div>
          </motion.div>

          {/* Event selector */}
          <motion.div variants={fadeInUp}>
            <Select
              value={eventoId?.toString() || ""}
              onValueChange={(v) => setEventoId(Number(v))}
            >
              <SelectTrigger className="w-full h-12 text-base">
                <SelectValue placeholder="Seleccionar evento" />
              </SelectTrigger>
              <SelectContent>
                {eventos.map((e) => (
                  <SelectItem key={e.id} value={e.id.toString()}>
                    {e.titulo} —{" "}
                    {new Date(e.fecha_inicio).toLocaleDateString("es-UY", {
                      day: "numeric",
                      month: "short",
                    })}
                  </SelectItem>
                ))}
                {eventos.length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    No hay eventos próximos
                  </div>
                )}
              </SelectContent>
            </Select>
          </motion.div>

          {eventoId && (
            <>
              {/* Camera */}
              <motion.div
                variants={scaleIn}
                transition={springSmooth}
                className="relative rounded-2xl overflow-hidden border-2 border-border bg-black aspect-[4/3] lg:aspect-square"
              >
                <Scanner
                  onScan={handleScan}
                  formats={["qr_code"]}
                  sound={false}
                  scanDelay={800}
                  components={{ finder: true }}
                  styles={{
                    container: { width: "100%", height: "100%" },
                    video: { objectFit: "cover" as const },
                  }}
                />

                {/* Scanning indicator */}
                <AnimatePresence>
                  {scanning && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
                    >
                      <motion.div
                        initial={{ scale: 0.5 }}
                        animate={{ scale: 1 }}
                        className="bg-white/20 rounded-full p-4"
                      >
                        <Loader2 className="h-8 w-8 animate-spin text-white" />
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Stats bar overlaid on camera bottom */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-4 py-3">
                  <div className="flex items-center justify-between text-white">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-white/80" />
                      <motion.span
                        key={ingresaron}
                        initial={{ scale: 1.4, color: "#f7b643" }}
                        animate={{ scale: 1, color: "#ffffff" }}
                        transition={{ duration: 0.4 }}
                        className="font-display text-2xl font-bold tabular-nums"
                      >
                        {ingresaron}
                      </motion.span>
                      {capacidadTotal && (
                        <span className="text-white/60 text-sm">
                          / {capacidadTotal}
                        </span>
                      )}
                    </div>
                    {porcentaje !== null && (
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-white/20 rounded-full h-2 overflow-hidden">
                          <motion.div
                            className="h-full rounded-full bg-green-400"
                            initial={{ width: 0 }}
                            animate={{ width: `${porcentaje}%` }}
                            transition={{ duration: 0.6, ease: "easeOut" }}
                          />
                        </div>
                        <span className="text-white/80 text-xs font-medium tabular-nums">
                          {porcentaje}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>

              {/* Last scan result mini-banner (below camera) */}
              <AnimatePresence mode="wait">
                {lastScan && (
                  <motion.div
                    key={
                      lastScan.entrada?.codigo ||
                      lastScan.mensaje + Date.now()
                    }
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={springSmooth}
                    className={`rounded-xl px-4 py-3 text-white flex items-center gap-3 ${
                      resultadoConfig[lastScan.resultado].bgColor
                    }`}
                  >
                    <ResultadoIcon resultado={lastScan.resultado} />
                    <div className="flex-1 min-w-0">
                      <p className="font-heading font-bold text-sm tracking-tight">
                        {resultadoConfig[lastScan.resultado].label}
                      </p>
                      {lastScan.entrada?.nombre_asistente && (
                        <p className="text-white/80 text-xs truncate">
                          {lastScan.entrada.nombre_asistente}
                          {lastScan.entrada.tipo_entrada && (
                            <span className="text-white/60">
                              {" "}
                              — {lastScan.entrada.tipo_entrada}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>

        {/* Right column: Live scan list */}
        {eventoId && (
          <motion.div
            variants={fadeInUp}
            className="flex-1 min-w-0 flex flex-col"
          >
            <div className="rounded-2xl border border-border bg-card flex flex-col overflow-hidden flex-1 max-h-[calc(100vh-6rem)]">
              {/* List header */}
              <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-bordo-600" />
                  <h2 className="font-heading font-semibold text-sm">
                    Escaneos en vivo
                  </h2>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    {escaneos.filter((s) => s.resultado === "valido").length}{" "}
                    válidos
                  </span>
                  <span>
                    {escaneos.filter((s) => s.resultado !== "valido").length}{" "}
                    rechazados
                  </span>
                </div>
              </div>

              {/* Scan list */}
              <div className="flex-1 overflow-y-auto overscroll-contain">
                <AnimatePresence initial={false}>
                  {escaneos.length === 0 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex flex-col items-center justify-center py-16 text-muted-foreground"
                    >
                      <ScanLine className="h-10 w-10 mb-3 opacity-30" />
                      <p className="text-sm">
                        Esperando escaneos...
                      </p>
                      <p className="text-xs mt-1 opacity-60">
                        Apuntá la cámara a un QR de entrada
                      </p>
                    </motion.div>
                  )}
                  {escaneos.map((scan, index) => (
                    <motion.div
                      key={scan.id}
                      layout
                      initial={{ opacity: 0, x: -20, height: 0 }}
                      animate={{ opacity: 1, x: 0, height: "auto" }}
                      exit={{ opacity: 0, x: 20, height: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 35,
                        opacity: { duration: 0.2 },
                      }}
                      className={`flex items-center gap-3 px-4 py-3 border-b border-border/40 ${
                        index === 0 ? "bg-muted/20" : ""
                      }`}
                    >
                      {/* Result icon */}
                      <div
                        className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor:
                            resultadoConfig[scan.resultado].color + "18",
                        }}
                      >
                        <SmallResultIcon resultado={scan.resultado} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {scan.nombre ||
                            `#${scan.codigo_escaneado.slice(0, 8)}`}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {scan.tipo_entrada && (
                            <span>{scan.tipo_entrada} · </span>
                          )}
                          {resultadoConfig[scan.resultado].label}
                        </p>
                      </div>

                      {/* Time */}
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {new Date(scan.created_at).toLocaleTimeString(
                          "es-UY",
                          { hour: "2-digit", minute: "2-digit", second: "2-digit" }
                        )}
                      </span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>
    </>
  );
}

// --- Full-screen scan overlay ---

function FullScreenOverlay({
  resultado,
  entrada,
  mensaje,
  eventoNombre,
  onDismiss,
}: {
  resultado: ScanResultado;
  entrada: ScanResponse["entrada"];
  mensaje: string;
  eventoNombre: string | null;
  onDismiss: () => void;
}) {
  const config = overlayConfig[resultado];
  const Icon = config.Icon;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onDismiss}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br ${config.gradient} cursor-pointer`}
    >
      {/* Background pulse ring */}
      <motion.div
        initial={{ scale: 0, opacity: 0.4 }}
        animate={{ scale: 3, opacity: 0 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
        className="absolute h-40 w-40 rounded-full bg-white/20"
      />
      <motion.div
        initial={{ scale: 0, opacity: 0.3 }}
        animate={{ scale: 2.5, opacity: 0 }}
        transition={{ duration: 1, ease: "easeOut", delay: 0.1 }}
        className="absolute h-40 w-40 rounded-full bg-white/15"
      />

      {/* Content */}
      <div className="relative flex flex-col items-center text-white text-center px-8">
        {/* Icon */}
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 15,
            delay: 0.05,
          }}
        >
          <Icon className="h-28 w-28 lg:h-36 lg:w-36 drop-shadow-2xl" strokeWidth={1.5} />
        </motion.div>

        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.3 }}
          className="font-heading text-4xl lg:text-5xl font-black tracking-tight mt-6"
        >
          {config.title}
        </motion.h2>

        {/* Attendee name */}
        {entrada?.nombre_asistente && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.3 }}
            className="text-2xl lg:text-3xl font-semibold mt-3 text-white/95"
          >
            {entrada.nombre_asistente}
          </motion.p>
        )}

        {/* Tipo de entrada */}
        {entrada?.tipo_entrada && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.35, duration: 0.3 }}
            className="mt-3"
          >
            <span className="inline-block bg-white/20 backdrop-blur-sm rounded-full px-5 py-1.5 text-lg font-medium">
              {entrada.tipo_entrada}
            </span>
          </motion.div>
        )}

        {/* Subtitle / extra info */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          transition={{ delay: 0.4, duration: 0.3 }}
          className="text-sm mt-4"
        >
          {resultado === "ya_usado" ? mensaje : config.subtitle}
        </motion.p>

        {/* Event name */}
        {eventoNombre && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            transition={{ delay: 0.5, duration: 0.3 }}
            className="text-xs mt-2 font-medium"
          >
            {eventoNombre}
          </motion.p>
        )}

        {/* Tap to dismiss hint */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.4 }}
          transition={{ delay: 0.6 }}
          className="text-xs mt-6"
        >
          Tocá para cerrar
        </motion.p>
      </div>
    </motion.div>
  );
}

// --- Sub-components ---

function ResultadoIcon({ resultado }: { resultado: ScanResultado }) {
  const iconClass = "h-6 w-6 text-white";
  switch (resultadoConfig[resultado].icon) {
    case "check":
      return <CheckCircle2 className={iconClass} />;
    case "alert":
      return <AlertTriangle className={iconClass} />;
    case "x":
      return <XCircle className={iconClass} />;
  }
}

function SmallResultIcon({ resultado }: { resultado: ScanResultado }) {
  const iconClass = "h-4 w-4 shrink-0";
  const color = resultadoConfig[resultado].color;
  switch (resultadoConfig[resultado].icon) {
    case "check":
      return <CheckCircle2 className={iconClass} style={{ color }} />;
    case "alert":
      return <AlertTriangle className={iconClass} style={{ color }} />;
    case "x":
      return <XCircle className={iconClass} style={{ color }} />;
  }
}
