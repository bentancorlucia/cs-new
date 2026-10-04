"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useSpring } from "framer-motion";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  BookOpen,
  ArrowRightLeft,
  Banknote,
  HandCoins,
  NotebookPen,
  PiggyBank,
  RotateCcw,
  ShoppingBag,
  Sigma,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatImporte } from "@/lib/contabilidad/formato";
import {
  NOMBRE_SITUACION_CUOTA,
  NOMBRE_SITUACION_PLAN,
  NOMBRE_TIPO_MOVIMIENTO,
  type TipoMovimiento,
} from "@/lib/socios/disciplinas";

const pill =
  "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap";

/** Importe que cuenta desde cero al aparecer y anima cada cambio. */
export function ImporteContador({ valor, moneda, className }: { valor: number; moneda?: string; className?: string }) {
  const reducir = useReducedMotion();
  const spring = useSpring(0, { stiffness: 140, damping: 26, mass: 0.7, restDelta: 0.0005, restSpeed: 0.01 });
  const [mostrado, setMostrado] = useState(0);
  useEffect(() => {
    if (reducir) spring.jump(valor);
    else spring.set(valor);
  }, [valor, reducir, spring]);
  useEffect(() => spring.on("change", (v) => setMostrado(v)), [spring]);
  // Al terminar, el valor exacto (el resorte puede detenerse a centésimos del destino).
  const destino = useRef(valor);
  useEffect(() => {
    destino.current = valor;
  }, [valor]);
  useEffect(() => spring.on("animationComplete", () => setMostrado(destino.current)), [spring]);
  const texto = Math.abs(mostrado - valor) < 0.05 ? formatImporte(valor, moneda) : formatImporte(mostrado, moneda);
  return <span className={cn("tabular-nums", className)}>{texto}</span>;
}

/**
 * Color del saldo neto: + la disciplina le debe al club (bordó/rojo),
 * − el club le debe a la disciplina (ámbar), 0 (neutro).
 */
export function claseSaldo(saldo: number) {
  if (saldo > 0.004) return "text-rose-700";
  if (saldo < -0.004) return "text-amber-700";
  return "text-muted-foreground";
}

/** Color de cada cuenta: lo que debe la disciplina (rosa) y lo que debe el club (ámbar). */
export const CLASE_CUENTA = {
  disciplina_debe: "text-rose-700",
  club_debe: "text-amber-700",
} as const;

/** "La disciplina debe $ 1.000,00" / "El club le debe $ 1.000,00" / "Cuenta saldada". */
export function SaldoNeto({ neto, className, corto }: { neto: number; className?: string; corto?: boolean }) {
  const abs = Math.abs(neto);
  if (abs < 0.005) return <span className={cn("text-muted-foreground", className)}>{corto ? "Saldada" : "Cuenta saldada"}</span>;
  return (
    <span className={cn(claseSaldo(neto), className)}>
      {neto > 0 ? (corto ? "Debe " : "La disciplina debe ") : corto ? "Le deben " : "El club le debe "}
      <ImporteContador valor={abs} moneda="UYU" />
    </span>
  );
}

export const ICONO_TIPO: Record<TipoMovimiento, LucideIcon> = {
  saldo_inicial: BookOpen,
  compra_tienda: ShoppingBag,
  devolucion_tienda: RotateCcw,
  cuota_cobrada: Wallet,
  liquidacion: Sigma,
  pago_liquidacion: Banknote,
  compensacion: ArrowRightLeft,
  pago: HandCoins,
  manual: NotebookPen,
  anulacion: Ban,
  otro: PiggyBank,
};

const ESTILO_TIPO: Record<TipoMovimiento, string> = {
  saldo_inicial: "border-slate-200 bg-slate-50 text-slate-700",
  compra_tienda: "border-bordo-100 bg-bordo-50 text-bordo-800",
  devolucion_tienda: "border-sky-200 bg-sky-50 text-sky-800",
  cuota_cobrada: "border-violet-200 bg-violet-50 text-violet-800",
  liquidacion: "border-dorado-300 bg-dorado-100 text-dorado-800",
  pago_liquidacion: "border-sky-200 bg-sky-50 text-sky-800",
  compensacion: "border-teal-200 bg-teal-50 text-teal-800",
  pago: "border-emerald-200 bg-emerald-50 text-emerald-700",
  manual: "border-slate-300 bg-white text-slate-700",
  anulacion: "border-rose-200 bg-rose-50 text-rose-700",
  otro: "border-linea bg-superficie text-muted-foreground",
};

export function BadgeTipoMovimiento({ tipo }: { tipo: TipoMovimiento }) {
  const Icono = ICONO_TIPO[tipo];
  return (
    <span className={cn(pill, ESTILO_TIPO[tipo])}>
      <Icono className="size-3" />
      {NOMBRE_TIPO_MOVIMIENTO[tipo]}
    </span>
  );
}

const ESTILO_PLAN: Record<string, string> = {
  al_dia: "border-emerald-200 bg-emerald-50 text-emerald-700",
  atrasado: "border-rose-200 bg-rose-50 text-rose-700",
  cumplido: "border-sky-200 bg-sky-50 text-sky-800",
  cancelado: "border-slate-200 bg-slate-100 text-slate-600",
};

export function BadgeSituacionPlan({ situacion }: { situacion: string }) {
  return (
    <span className={cn(pill, ESTILO_PLAN[situacion] ?? ESTILO_PLAN.cancelado)}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {NOMBRE_SITUACION_PLAN[situacion] ?? situacion}
    </span>
  );
}

const ESTILO_CUOTA: Record<string, string> = {
  pagada: "border-emerald-200 bg-emerald-50 text-emerald-700",
  vencida: "border-rose-200 bg-rose-50 text-rose-700",
  parcial: "border-dorado-300 bg-dorado-100 text-dorado-800",
  pendiente: "border-linea bg-superficie text-muted-foreground",
};

export function BadgeSituacionCuota({ situacion }: { situacion: string }) {
  return <span className={cn(pill, ESTILO_CUOTA[situacion] ?? ESTILO_CUOTA.pendiente)}>{NOMBRE_SITUACION_CUOTA[situacion] ?? situacion}</span>;
}

/** Flecha de debe/haber para el estado de cuenta. */
export function FlechaMovimiento({ debe }: { debe: boolean }) {
  return debe ? (
    <ArrowUpRight className="size-3.5 text-rose-600" aria-label="Aumenta la deuda" />
  ) : (
    <ArrowDownLeft className="size-3.5 text-emerald-600" aria-label="Baja la deuda" />
  );
}

/** Tarjeta de cifra con hover. */
export function Cifra({
  etiqueta,
  children,
  detalle,
  icono: Icono,
  tono = "neutro",
  delay = 0,
}: {
  etiqueta: string;
  children: React.ReactNode;
  detalle?: React.ReactNode;
  icono?: LucideIcon;
  tono?: "neutro" | "alerta" | "bueno" | "dorado";
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94], delay }}
      whileHover={{ y: -3 }}
      className={cn(
        "min-w-0 rounded-2xl border bg-white p-4 transition-shadow hover:shadow-card-hover",
        tono === "alerta" ? "border-rose-200" : tono === "bueno" ? "border-emerald-200" : tono === "dorado" ? "border-dorado-300" : "border-linea"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-heading text-[11px] uppercase tracking-editorial text-muted-foreground">{etiqueta}</div>
        {Icono && (
          <div
            className={cn(
              "flex size-7 items-center justify-center rounded-full",
              tono === "alerta" ? "bg-rose-50 text-rose-700" : tono === "bueno" ? "bg-emerald-50 text-emerald-700" : "bg-bordo-50 text-bordo-800"
            )}
          >
            <Icono className="size-3.5" />
          </div>
        )}
      </div>
      <div
        className={cn(
          "mt-1 truncate font-heading text-xl sm:text-2xl",
          tono === "alerta" ? "text-rose-700" : tono === "bueno" ? "text-emerald-700" : "text-foreground"
        )}
      >
        {children}
      </div>
      {detalle && <div className="mt-0.5 text-xs text-muted-foreground">{detalle}</div>}
    </motion.div>
  );
}

/** Pestañas con indicador animado y scroll propio en mobile. */
export function Pestanas<T extends string>({
  opciones,
  valor,
  onChange,
}: {
  opciones: { valor: T; etiqueta: string; icono: LucideIcon; cantidad?: number }[];
  valor: T;
  onChange: (v: T) => void;
}) {
  return (
    <motion.nav
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
      role="tablist"
    >
      <div className="inline-flex min-w-full gap-1 rounded-2xl border border-linea bg-white p-1 sm:min-w-0">
        {opciones.map((o) => {
          const on = o.valor === valor;
          const Icono = o.icono;
          return (
            <motion.button
              key={o.valor}
              type="button"
              role="tab"
              aria-selected={on}
              whileTap={{ scale: 0.96 }}
              onClick={() => onChange(o.valor)}
              className={cn(
                "relative inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors sm:text-sm",
                on ? "text-white" : "text-muted-foreground hover:bg-superficie hover:text-foreground"
              )}
            >
              {on && (
                <motion.span
                  layoutId="tab-disciplina"
                  className="absolute inset-0 rounded-xl bg-bordo-800 shadow-sm"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <Icono className="relative size-4" />
              <span className="relative whitespace-nowrap">{o.etiqueta}</span>
              {o.cantidad !== undefined && o.cantidad > 0 && (
                <span className={cn("relative rounded-full px-1.5 text-[10px] tabular-nums", on ? "bg-white/20" : "bg-superficie")}>{o.cantidad}</span>
              )}
            </motion.button>
          );
        })}
      </div>
    </motion.nav>
  );
}

/** Exporta filas a un .xlsx (xlsx se carga recién al exportar). */
export async function exportarExcel(nombreArchivo: string, hoja: string, encabezado: string[], filas: (string | number | null)[][], anchos?: number[]) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([encabezado, ...filas]);
  ws["!cols"] = encabezado.map((_, i) => ({ wch: anchos?.[i] ?? 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, hoja.slice(0, 31));
  XLSX.writeFile(wb, nombreArchivo);
}

/** "1.500,50" o "1500.50" → 1500.5 (con coma, el punto es separador de miles). */
export function aNumero(texto: string): number {
  const t = texto.trim();
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : 0;
}
