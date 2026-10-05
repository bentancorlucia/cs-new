"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, useSpring } from "framer-motion";
import { Banknote, Building2, CreditCard, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { NOMBRE_MEDIO } from "@/lib/socios/esquemas";
import type { EstadoSocio } from "@/lib/socios/padron";

export {
  Boton,
  BotonLink,
  Campo,
  Filtros,
  Importe,
  Kpi,
  Panel,
  Vacio,
  claseControl,
  claseEtiqueta,
  EncabezadoPagina,
  ImporteAnimado,
} from "@/components/compras/ui";

const pill =
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

const ESTILO_ESTADO: Record<EstadoSocio, { clase: string; texto: string }> = {
  vigente: { clase: "border-emerald-200 bg-emerald-50 text-emerald-700", texto: "Socio" },
  programado: { clase: "border-sky-200 bg-sky-50 text-sky-800", texto: "Alta programada" },
  baja: { clase: "border-slate-200 bg-slate-100 text-slate-600", texto: "Baja" },
  sin_alta: { clase: "border-dorado-300 bg-dorado-100 text-dorado-800", texto: "Sin membresía" },
};

export function BadgeEstadoSocio({ estado, className }: { estado: EstadoSocio; className?: string }) {
  const e = ESTILO_ESTADO[estado];
  return (
    <span className={cn(pill, e.clase, className)}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {e.texto}
    </span>
  );
}

/** Al día / N cuotas vencidas (con la tolerancia de socios.situacion). */
export function BadgeSituacion({
  cuotasVencidas,
  alDia,
}: {
  cuotasVencidas: number;
  alDia: boolean | null;
}) {
  if (alDia === null) return <span className="text-xs text-muted-foreground">—</span>;
  if (cuotasVencidas === 0) return <span className={cn(pill, "border-emerald-200 bg-emerald-50 text-emerald-700")}>Al día</span>;
  const texto = `${cuotasVencidas} cuota${cuotasVencidas === 1 ? "" : "s"} vencida${cuotasVencidas === 1 ? "" : "s"}`;
  return (
    <span
      title={alDia ? "Dentro de la tolerancia: se considera al día" : "Fuera de la tolerancia: moroso"}
      className={cn(
        pill,
        alDia ? "border-dorado-300 bg-dorado-100 text-dorado-800" : "border-rose-200 bg-rose-50 text-rose-700"
      )}
    >
      {texto}
    </span>
  );
}

const ICONO_MEDIO = {
  debito_visa: CreditCard,
  transferencia_club: Landmark,
  transferencia_disciplina: Building2,
  efectivo: Banknote,
} as const;

export function EtiquetaMedio({
  medio,
  disciplina,
  varias,
  className,
}: {
  medio: string | null;
  disciplina?: string | null;
  /** Está en varias disciplinas: cada cuota va a la cuenta de la suya y `disciplina` es donde paga la social. */
  varias?: boolean;
  className?: string;
}) {
  if (!medio) return <span className={cn("text-xs text-muted-foreground", className)}>Sin medio</span>;
  const Icono = ICONO_MEDIO[medio as keyof typeof ICONO_MEDIO] ?? Banknote;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-foreground", className)}>
      <Icono className="size-3.5 shrink-0 text-bordo-700" />
      <span className="truncate">
        {medio === "transferencia_disciplina" && disciplina
          ? varias
            ? `Cuenta de cada disciplina · social en ${disciplina}`
            : `Cuenta de ${disciplina}`
          : (NOMBRE_MEDIO[medio] ?? medio)}
      </span>
    </span>
  );
}

/** Aviso inline animado (advertencias que no bloquean). */
export function Aviso({
  visible,
  tono = "alerta",
  children,
}: {
  visible: boolean;
  tono?: "alerta" | "info" | "error";
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <div
            role={tono === "error" ? "alert" : "status"}
            className={cn(
              "rounded-xl border px-3 py-2 text-xs",
              tono === "alerta" && "border-dorado-300 bg-dorado-50 text-dorado-900",
              tono === "info" && "border-sky-200 bg-sky-50 text-sky-900",
              tono === "error" && "border-rose-200 bg-rose-50 text-rose-800"
            )}
          >
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
