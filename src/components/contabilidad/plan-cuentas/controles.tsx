"use client";

import { useId, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Loader2, Lock } from "lucide-react";
import { springSmooth } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/* ─────────────────────────────────────────────────────────── */
/*  Badges del plan                                            */
/* ─────────────────────────────────────────────────────────── */

const TONOS = {
  bordo: "bg-bordo-50 text-bordo-700 border-bordo-200/70",
  dorado: "bg-dorado-50 text-dorado-700 border-dorado-200",
  verde: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
  neutro: "bg-superficie text-foreground/70 border-linea",
  apagado: "bg-white text-muted-foreground border-dashed border-linea",
  sistema: "bg-bordo-800 text-white border-bordo-800",
} as const;

export type TonoBadge = keyof typeof TONOS;

export function BadgePlan({ tono, children }: { tono: TonoBadge; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-heading text-[9px] uppercase leading-none tracking-editorial whitespace-nowrap",
        TONOS[tono]
      )}
    >
      {children}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Campo bloqueado con tooltip explicativo                    */
/* ─────────────────────────────────────────────────────────── */

export function Bloqueable({
  bloqueado,
  motivo,
  children,
}: {
  bloqueado: boolean;
  motivo: string;
  children: ReactNode;
}) {
  if (!bloqueado) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger render={<div className="relative cursor-not-allowed" />}>
        {children}
        <Lock className="pointer-events-none absolute -top-1.5 -right-1.5 size-3.5 rounded-full bg-white p-0.5 text-muted-foreground shadow-sm ring-1 ring-linea" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64 text-center">
        {motivo}
      </TooltipContent>
    </Tooltip>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Control segmentado con indicador animado                   */
/* ─────────────────────────────────────────────────────────── */

export function Segmentado<T extends string>({
  valor,
  opciones,
  onChange,
  deshabilitado = false,
  ariaLabel,
}: {
  valor: T;
  opciones: Array<{ valor: T; etiqueta: string }>;
  onChange: (v: T) => void;
  deshabilitado?: boolean;
  ariaLabel: string;
}) {
  const id = useId();
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={deshabilitado}
      className={cn(
        "flex w-full rounded-full border border-linea bg-superficie p-1 text-xs",
        deshabilitado && "pointer-events-none opacity-55"
      )}
    >
      {opciones.map((o) => {
        const activo = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={activo}
            disabled={deshabilitado}
            onClick={() => onChange(o.valor)}
            className={cn(
              "relative flex-1 rounded-full px-3 py-1.5 font-heading transition-colors",
              activo ? "text-white" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {activo && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-full bg-bordo-800"
                transition={springSmooth}
              />
            )}
            <span className="relative">{o.etiqueta}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Fila con switch                                            */
/* ─────────────────────────────────────────────────────────── */

export function FilaSwitch({
  titulo,
  ayuda,
  checked,
  onChange,
  deshabilitado = false,
}: {
  titulo: string;
  ayuda?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  deshabilitado?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-linea bg-white px-3 py-2.5">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block font-heading text-sm text-foreground">{titulo}</span>
        {ayuda && <span className="block text-xs text-muted-foreground">{ayuda}</span>}
      </label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(Boolean(v))}
        disabled={deshabilitado}
        className="mt-0.5"
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── */
/*  Confirmación                                               */
/* ─────────────────────────────────────────────────────────── */

export function ConfirmarDialog({
  abierto,
  onOpenChange,
  titulo,
  descripcion,
  etiquetaConfirmar,
  destructivo = false,
  pendiente,
  onConfirmar,
  onCerrado,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  /** Al terminar la animación de cierre. */
  onCerrado?: () => void;
  titulo: string;
  descripcion: ReactNode;
  etiquetaConfirmar: string;
  destructivo?: boolean;
  pendiente: boolean;
  onConfirmar: () => void;
}) {
  return (
    <AlertDialog
      open={abierto}
      onOpenChange={(v) => !pendiente && onOpenChange(v)}
      onOpenChangeComplete={(v) => !v && onCerrado?.()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg text-bordo-900">{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descripcion}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendiente}>Cancelar</AlertDialogCancel>
          <Button
            onClick={onConfirmar}
            disabled={pendiente}
            className={cn(
              "min-w-28",
              destructivo
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-bordo-800 text-white hover:bg-bordo-900"
            )}
          >
            {pendiente ? <Loader2 className="size-4 animate-spin" /> : etiquetaConfirmar}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
