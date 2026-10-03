"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion, useSpring } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CATEGORIAS, NOMBRE_ESTADO_ENVIO, NOMBRE_ESTADO_MENSAJE, NOMBRE_ORIGEN } from "@/lib/comunicaciones/esquemas";
import { Boton } from "@/components/compras/ui";

export {
  Boton,
  BotonLink,
  Campo,
  Filtros,
  Kpi,
  Panel,
  Vacio,
  claseControl,
  claseEtiqueta,
  EncabezadoPagina,
} from "@/components/compras/ui";

export const pill =
  "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap";

/** Entero que anima al cambiar (count-up). */
export function NumeroAnimado({ valor, className }: { valor: number; className?: string }) {
  const reducir = useReducedMotion();
  const spring = useSpring(0, { stiffness: 120, damping: 24, mass: 0.6 });
  const [mostrado, setMostrado] = useState(0);
  useEffect(() => {
    if (reducir) spring.jump(valor);
    else spring.set(valor);
  }, [valor, reducir, spring]);
  useEffect(() => spring.on("change", (v) => setMostrado(Math.round(v))), [spring]);
  return <span className={cn("tabular-nums", className)}>{mostrado.toLocaleString("es-UY")}</span>;
}

// ------------------------------------------------------------
// Badges
// ------------------------------------------------------------

const ESTILO_ENVIO: Record<string, string> = {
  borrador: "border-dorado-300 bg-dorado-100 text-dorado-800",
  aprobado: "border-sky-200 bg-sky-50 text-sky-800",
  cancelado: "border-slate-200 bg-slate-100 text-slate-600",
};

export function BadgeEstadoEnvio({ estado, programado }: { estado: string; programado?: boolean }) {
  return (
    <span className={cn(pill, programado && estado === "aprobado" ? "border-violet-200 bg-violet-50 text-violet-800" : ESTILO_ENVIO[estado] ?? ESTILO_ENVIO.cancelado)}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {programado && estado === "aprobado" ? "Programado" : NOMBRE_ESTADO_ENVIO[estado] ?? estado}
    </span>
  );
}

export const ESTILO_MENSAJE: Record<string, string> = {
  pendiente: "border-dorado-300 bg-dorado-100 text-dorado-800",
  enviando: "border-sky-200 bg-sky-50 text-sky-800",
  enviado: "border-emerald-200 bg-emerald-50 text-emerald-700",
  fallido: "border-rose-200 bg-rose-50 text-rose-700",
  omitido: "border-slate-200 bg-slate-100 text-slate-600",
  cancelado: "border-slate-200 bg-white text-slate-500",
};

export function BadgeEstadoMensaje({ estado }: { estado: string }) {
  return (
    <span className={cn(pill, ESTILO_MENSAJE[estado] ?? ESTILO_MENSAJE.cancelado)}>
      <span className={cn("size-1.5 rounded-full bg-current opacity-70", estado === "enviando" && "animate-pulse")} />
      {NOMBRE_ESTADO_MENSAJE[estado] ?? estado}
    </span>
  );
}

export function BadgeCategoria({ categoria }: { categoria: string }) {
  return (
    <span
      className={cn(
        pill,
        categoria === "difusion"
          ? "border-bordo-100 bg-bordo-50 text-bordo-800"
          : categoria === "personal"
            ? "border-dorado-300 bg-dorado-100/60 text-dorado-900"
            : "border-linea bg-superficie text-foreground/70"
      )}
    >
      {CATEGORIAS[categoria as keyof typeof CATEGORIAS]?.nombre ?? categoria}
    </span>
  );
}

export function BadgeOrigen({ origen }: { origen: string }) {
  if (origen === "manual") return null;
  return (
    <span
      className={cn(
        pill,
        origen === "automatizacion" ? "border-violet-200 bg-violet-50 text-violet-800" : "border-teal-200 bg-teal-50 text-teal-800"
      )}
    >
      {NOMBRE_ORIGEN[origen] ?? origen}
    </span>
  );
}

// ------------------------------------------------------------
// Progreso de un envío
// ------------------------------------------------------------

export type Conteo = {
  total: number;
  pendientes: number;
  enviando: number;
  enviados: number;
  fallidos: number;
  omitidos: number;
  cancelados: number;
};

const SEGMENTOS: { clave: keyof Conteo; clase: string; etiqueta: string }[] = [
  { clave: "enviados", clase: "bg-emerald-500", etiqueta: "Enviados" },
  { clave: "fallidos", clase: "bg-rose-500", etiqueta: "Fallidos" },
  { clave: "omitidos", clase: "bg-slate-400", etiqueta: "Omitidos" },
  { clave: "cancelados", clase: "bg-slate-300", etiqueta: "Cancelados" },
  { clave: "enviando", clase: "bg-sky-400", etiqueta: "Enviando" },
];

export function conteoDe(r: Partial<Record<keyof Conteo, number | null>>): Conteo {
  return {
    total: Number(r.total ?? 0),
    pendientes: Number(r.pendientes ?? 0),
    enviando: Number(r.enviando ?? 0),
    enviados: Number(r.enviados ?? 0),
    fallidos: Number(r.fallidos ?? 0),
    omitidos: Number(r.omitidos ?? 0),
    cancelados: Number(r.cancelados ?? 0),
  };
}

export function BarraProgreso({ conteo, alto = "h-1.5", leyenda }: { conteo: Conteo; alto?: string; leyenda?: boolean }) {
  const total = Math.max(conteo.total, 1);
  return (
    <div>
      <div className={cn("flex overflow-hidden rounded-full bg-superficie", alto)}>
        {SEGMENTOS.map((s) => (
          <motion.div
            key={s.clave}
            initial={{ width: 0 }}
            animate={{ width: `${(conteo[s.clave] / total) * 100}%` }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className={cn("h-full", s.clase)}
          />
        ))}
      </div>
      {leyenda && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {[...SEGMENTOS, { clave: "pendientes" as const, clase: "bg-superficie ring-1 ring-linea", etiqueta: "Pendientes" }].map((s) => (
            <span key={s.clave} className="inline-flex items-center gap-1">
              <span className={cn("size-2 rounded-full", s.clase)} />
              {s.etiqueta} <NumeroAnimado valor={conteo[s.clave]} className="font-medium text-foreground" />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Vista de un mail (iframe aislado)
// ------------------------------------------------------------

/**
 * El HTML del mail en un iframe con sandbox (sin scripts ni acceso al
 * sitio): lo mismo que recibe el destinatario.
 */
export function VistaMail({ html, asunto, className }: { html: string; asunto?: string; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-xl border border-linea bg-white", className)}>
      {asunto !== undefined && (
        <div className="border-b border-linea bg-superficie/60 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Asunto: </span>
          <span className="font-medium text-foreground">{asunto || "—"}</span>
        </div>
      )}
      <motion.iframe
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        title="Vista previa del correo"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        srcDoc={html.replace("<head>", '<head><base target="_blank">')}
        className="block h-[480px] w-full bg-[#faf8f5]"
      />
    </div>
  );
}

// ------------------------------------------------------------
// Diálogo con acción
// ------------------------------------------------------------

type Res = { ok: true } | { ok: false; error: string };

export function DialogoAccion({
  open,
  onOpenChange,
  icono: Icono,
  titulo,
  descripcion,
  children,
  textoAccion,
  mensajeOk,
  destructivo,
  deshabilitado,
  ancho = "sm:max-w-md",
  ejecutar,
  alTerminar,
  irA,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  icono: LucideIcon;
  titulo: string;
  descripcion?: React.ReactNode;
  children?: React.ReactNode;
  textoAccion: string;
  mensajeOk: string;
  destructivo?: boolean;
  deshabilitado?: boolean;
  ancho?: string;
  /** Devuelve null si la validación local falló (el diálogo queda abierto). */
  ejecutar: () => Promise<Res> | null;
  alTerminar?: () => void;
  /** Después de la acción navega acá (en vez de refrescar la página actual). */
  irA?: string;
}) {
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function cambiar(o: boolean) {
    if (pendiente) return;
    if (!o) setError(null);
    onOpenChange(o);
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const promesa = ejecutar();
    if (!promesa) return;
    start(async () => {
      const r = await promesa;
      if (r.ok) {
        toast.success(mensajeOk);
        onOpenChange(false);
        alTerminar?.();
        if (irA) router.push(irA);
        else router.refresh();
      } else {
        setError(r.error);
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={cambiar}>
      <DialogContent className={cn("max-h-[calc(100dvh-2rem)] overflow-y-auto", ancho)}>
        <form onSubmit={enviar} className="space-y-4">
          <DialogHeader>
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              className={cn(
                "flex size-10 items-center justify-center rounded-full",
                destructivo ? "bg-rose-50 text-rose-700" : "bg-bordo-50 text-bordo-800"
              )}
            >
              <Icono className="size-5" />
            </motion.div>
            <DialogTitle className="font-heading text-lg text-bordo-950">{titulo}</DialogTitle>
            {descripcion && <DialogDescription render={<div />}>{descripcion}</DialogDescription>}
          </DialogHeader>
          {children && <div className="space-y-3">{children}</div>}
          <AnimatePresence>
            {error && (
              <motion.div
                key={error}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, x: [0, -6, 6, -4, 4, 0] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                role="alert"
                className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>
          <DialogFooter>
            <Boton variante="secundario" onClick={() => cambiar(false)} disabled={pendiente}>
              Cancelar
            </Boton>
            <Boton type="submit" variante={destructivo ? "peligro" : "primario"} pendiente={pendiente} disabled={deshabilitado}>
              {textoAccion}
            </Boton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Aviso destacado (información, advertencia o error). */
export function Aviso({
  tono = "info",
  icono: Icono,
  titulo,
  children,
  className,
}: {
  tono?: "info" | "alerta" | "error" | "ok";
  icono?: LucideIcon;
  titulo?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const clases = {
    info: "border-sky-200 bg-sky-50/70 text-sky-900",
    alerta: "border-dorado-300 bg-dorado-100/60 text-dorado-900",
    error: "border-rose-200 bg-rose-50 text-rose-900",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
  }[tono];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={cn("flex gap-3 rounded-2xl border px-4 py-3 text-sm", clases, className)}
    >
      {Icono && <Icono className="mt-0.5 size-4 shrink-0" />}
      <div className="min-w-0 space-y-1">
        {titulo && <div className="font-medium">{titulo}</div>}
        {children && <div className="text-[13px] leading-relaxed opacity-90">{children}</div>}
      </div>
    </motion.div>
  );
}
