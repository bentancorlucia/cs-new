"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Scanner } from "@yudiel/react-qr-scanner";
import { createBrowserClient } from "@/lib/supabase/client";
import { feedbackForResult, resultadoConfig } from "@/lib/qr/feedback";
import {
  fadeInUp,
  staggerContainer,
  staggerContainerFast,
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
import { CheckCircle2, XCircle, AlertTriangle, ScanLine, Loader2 } from "lucide-react";

// --- Types ---

type ScanResultado = "valido" | "ya_usado" | "no_encontrado" | "evento_incorrecto" | "cancelada";

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
}

// --- Component ---

export function ScannerClient() {
  const supabase = createBrowserClient();

  const [eventos, setEventos] = useState<Evento[]>([]);
  const [eventoId, setEventoId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // Scan state
  const [lastScan, setLastScan] = useState<ScanResponse | null>(null);
  const [scanning, setScanning] = useState(false);
  const [flashColor, setFlashColor] = useState<string | null>(null);
  const lastCodeRef = useRef<string>("");
  const debounceRef = useRef<number>(0);

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
        .gte("fecha_inicio", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("fecha_inicio", { ascending: true });

      setEventos(data || []);
      setLoading(false);
    }
    loadEventos();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load initial stats when event changes
  useEffect(() => {
    if (!eventoId) return;

    const evento = eventos.find((e) => e.id === eventoId);
    setCapacidadTotal(evento?.capacidad_total || null);
    setLastScan(null);
    setEscaneos([]);
    setIngresaron(0);

    async function loadStats() {
      // Count already-entered attendees
      const { count } = await (supabase as any)
        .from("entradas")
        .select("id", { count: "exact", head: true })
        .eq("evento_id", eventoId)
        .eq("estado", "usada");

      setIngresaron(count || 0);

      // Load recent scans
      const { data: recentScans } = await (supabase as any)
        .from("escaneos_entrada")
        .select("id, resultado, codigo_escaneado, created_at")
        .eq("evento_id", eventoId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (recentScans) {
        setEscaneos(
          recentScans.map((s: any) => ({
            id: s.id,
            resultado: s.resultado,
            codigo_escaneado: s.codigo_escaneado,
            created_at: s.created_at,
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
          setEscaneos((prev) => [
            {
              id: newScan.id,
              resultado: newScan.resultado,
              codigo_escaneado: newScan.codigo_escaneado,
              created_at: newScan.created_at,
            },
            ...prev.slice(0, 19),
          ]);
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
      if (!eventoId || scanning) return;

      const code = detectedCodes?.[0]?.rawValue;
      if (!code) return;

      // Debounce: ignore same code within 3 seconds
      const now = Date.now();
      if (code === lastCodeRef.current && now - debounceRef.current < 3000) {
        return;
      }
      lastCodeRef.current = code;
      debounceRef.current = now;

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

        // Flash overlay
        const config = resultadoConfig[data.resultado];
        setFlashColor(config.color);
        setTimeout(() => setFlashColor(null), 600);
      } catch {
        setLastScan({
          resultado: "no_encontrado",
          mensaje: "Error de conexión",
          entrada: null,
        });
      } finally {
        setScanning(false);
      }
    },
    [eventoId, scanning]
  );

  const porcentaje = capacidadTotal
    ? Math.min(Math.round((ingresaron / capacidadTotal) * 100), 100)
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-bordo-600" />
      </div>
    );
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-6 max-w-2xl mx-auto p-4"
    >
      {/* Header */}
      <motion.div variants={fadeInUp}>
        <h1 className="font-heading text-2xl font-bold tracking-tight">
          Scanner de Entradas
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Escaneá el QR de cada entrada para validar el ingreso
        </p>
      </motion.div>

      {/* Event selector */}
      <motion.div variants={fadeInUp}>
        <Select
          value={eventoId?.toString() || ""}
          onValueChange={(v) => setEventoId(Number(v))}
        >
          <SelectTrigger className="w-full">
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
            className="relative rounded-xl overflow-hidden border border-border bg-black aspect-square max-h-[400px]"
          >
            <Scanner
              onScan={handleScan}
              formats={["qr_code"]}
              sound={false}
              scanDelay={1500}
              components={{
                finder: true,
              }}
              styles={{
                container: {
                  width: "100%",
                  height: "100%",
                },
                video: {
                  objectFit: "cover" as const,
                },
              }}
            />

            {/* Scanning indicator */}
            {scanning && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              </div>
            )}

            {/* Flash overlay */}
            <AnimatePresence>
              {flashColor && (
                <motion.div
                  initial={{ opacity: 0.7 }}
                  animate={{ opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6 }}
                  className="absolute inset-0 pointer-events-none"
                  style={{ backgroundColor: flashColor }}
                />
              )}
            </AnimatePresence>
          </motion.div>

          {/* Last scan result */}
          <AnimatePresence mode="wait">
            {lastScan && (
              <motion.div
                key={lastScan.entrada?.codigo || lastScan.mensaje}
                initial={{ opacity: 0, scale: 0.9, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -8 }}
                transition={springSmooth}
                className={`rounded-xl p-5 text-white ${
                  resultadoConfig[lastScan.resultado].bgColor
                }`}
              >
                <div className="flex items-center gap-3">
                  <ResultadoIcon resultado={lastScan.resultado} />
                  <div className="flex-1 min-w-0">
                    <p className="font-heading font-bold text-lg tracking-tight">
                      {resultadoConfig[lastScan.resultado].label}
                    </p>
                    {lastScan.entrada && (
                      <p className="text-white/90 text-sm truncate">
                        {lastScan.entrada.nombre_asistente || "Sin nombre"}{" "}
                        {lastScan.entrada.tipo_entrada && (
                          <span className="text-white/70">
                            — {lastScan.entrada.tipo_entrada}
                          </span>
                        )}
                      </p>
                    )}
                    {lastScan.resultado === "ya_usado" && (
                      <p className="text-white/80 text-xs mt-1">
                        {lastScan.mensaje}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Stats */}
          <motion.div variants={fadeInUp} className="rounded-xl border border-border p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading font-semibold text-sm uppercase tracking-wider text-muted-foreground">
                Estadísticas
              </h3>
              <ScanLine className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex items-baseline gap-2 mb-3">
              <motion.span
                key={ingresaron}
                initial={{ scale: 1.3, color: "#730d32" }}
                animate={{ scale: 1, color: "#1f1f1f" }}
                className="font-display text-4xl font-bold tabular-nums"
              >
                {ingresaron}
              </motion.span>
              {capacidadTotal && (
                <span className="text-muted-foreground text-lg">
                  / {capacidadTotal}
                </span>
              )}
              <span className="text-sm text-muted-foreground ml-1">
                ingresaron
              </span>
            </div>
            {porcentaje !== null && (
              <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-bordo-600"
                  initial={{ width: 0 }}
                  animate={{ width: `${porcentaje}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
            )}
          </motion.div>

          {/* Recent scans log */}
          <motion.div variants={fadeInUp} className="rounded-xl border border-border p-5">
            <h3 className="font-heading font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-3">
              Últimos escaneos
            </h3>
            <motion.div
              variants={staggerContainerFast}
              initial="hidden"
              animate="visible"
              className="space-y-2"
            >
              <AnimatePresence initial={false}>
                {escaneos.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Aún no hay escaneos para este evento
                  </p>
                )}
                {escaneos.map((scan) => (
                  <motion.div
                    key={scan.id}
                    layout
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0"
                  >
                    <span className="text-xs text-muted-foreground tabular-nums w-12 shrink-0">
                      {new Date(scan.created_at).toLocaleTimeString("es-UY", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <SmallResultIcon resultado={scan.resultado} />
                    <span className="text-sm truncate flex-1">
                      {scan.nombre || scan.codigo_escaneado.slice(0, 8)}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-xs shrink-0"
                      style={{
                        borderColor: resultadoConfig[scan.resultado].color,
                        color: resultadoConfig[scan.resultado].color,
                      }}
                    >
                      {resultadoConfig[scan.resultado].label}
                    </Badge>
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        </>
      )}
    </motion.div>
  );
}

// --- Sub-components ---

function ResultadoIcon({ resultado }: { resultado: ScanResultado }) {
  const iconClass = "h-8 w-8 text-white";
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
