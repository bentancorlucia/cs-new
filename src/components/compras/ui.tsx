"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth, fadeInUp } from "@/lib/motion";
import {
  NOMBRE_ESTADO_OC,
  NOMBRE_ESTADO_PAGO,
  NOMBRE_TIPO_DOC,
} from "@/lib/comercial/compras-esquemas";

export { EncabezadoPagina, ImporteAnimado, BadgeUsd } from "@/components/contabilidad/asientos/ui-asiento";

export const claseControl =
  "h-10 w-full rounded-lg border border-linea bg-white px-3 text-sm outline-none transition-all placeholder:text-muted-foreground/70 hover:border-bordo-200 focus:border-bordo-700 focus:ring-3 focus:ring-bordo-800/10 disabled:opacity-60 aria-invalid:border-rose-300 aria-invalid:bg-rose-50/40";

export const claseEtiqueta = "px-0.5 text-[10px] uppercase tracking-editorial text-muted-foreground";

const pill =
  "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap";

// ------------------------------------------------------------
// Badges
// ------------------------------------------------------------

const ESTILO_OC: Record<string, string> = {
  borrador: "border-dorado-300 bg-dorado-100 text-dorado-800",
  aprobada: "border-sky-200 bg-sky-50 text-sky-800",
  recibida_parcial: "border-violet-200 bg-violet-50 text-violet-800",
  recibida: "border-emerald-200 bg-emerald-50 text-emerald-700",
  cancelada: "border-slate-200 bg-slate-100 text-slate-600",
};

export function BadgeEstadoOrden({ estado }: { estado: string }) {
  return (
    <span className={cn(pill, ESTILO_OC[estado] ?? ESTILO_OC.cancelada)}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {NOMBRE_ESTADO_OC[estado] ?? estado}
    </span>
  );
}

const ESTILO_PAGO: Record<string, string> = {
  pendiente: "border-dorado-300 bg-dorado-100 text-dorado-800",
  pagada: "border-emerald-200 bg-emerald-50 text-emerald-700",
  anulada: "border-rose-200 bg-rose-50 text-rose-700",
};

export function BadgeEstadoPago({ estado }: { estado: string }) {
  return (
    <span className={cn(pill, ESTILO_PAGO[estado] ?? ESTILO_PAGO.anulada)}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {NOMBRE_ESTADO_PAGO[estado] ?? estado}
    </span>
  );
}

const ESTILO_TIPO_DOC: Record<string, string> = {
  factura: "border-bordo-100 bg-bordo-50 text-bordo-800",
  nota_credito: "border-emerald-200 bg-emerald-50 text-emerald-800",
  nota_debito: "border-amber-200 bg-amber-50 text-amber-800",
};

export function BadgeTipoDoc({ tipo, contado }: { tipo: string; contado?: boolean }) {
  return (
    <span className={cn(pill, ESTILO_TIPO_DOC[tipo] ?? ESTILO_TIPO_DOC.factura)}>
      {NOMBRE_TIPO_DOC[tipo] ?? tipo}
      {contado ? " contado" : ""}
    </span>
  );
}

/** Estado de cobro de un documento: anulado / pagado / pendiente / vencido. */
export function BadgeSaldoDoc({
  estado,
  saldo,
  total,
  contado,
  diasVencido,
  tipo,
}: {
  estado: string;
  saldo: number;
  total: number;
  contado: boolean;
  diasVencido?: number;
  tipo: string;
}) {
  if (estado === "anulado") return <span className={cn(pill, "border-rose-200 bg-rose-50 text-rose-700")}>Anulado</span>;
  if (contado) return <span className={cn(pill, "border-emerald-200 bg-emerald-50 text-emerald-700")}>Pagado contado</span>;
  if (saldo <= 0)
    return (
      <span className={cn(pill, "border-emerald-200 bg-emerald-50 text-emerald-700")}>
        {tipo === "nota_credito" ? "Aplicada" : "Cancelado"}
      </span>
    );
  if (tipo === "nota_credito")
    return <span className={cn(pill, "border-sky-200 bg-sky-50 text-sky-800")}>{saldo < total ? "Aplicada en parte" : "Sin aplicar"}</span>;
  if (diasVencido !== undefined && diasVencido > 0)
    return (
      <span className={cn(pill, "border-rose-200 bg-rose-50 text-rose-700")}>
        Vencido hace {diasVencido} día{diasVencido === 1 ? "" : "s"}
      </span>
    );
  return (
    <span className={cn(pill, "border-dorado-300 bg-dorado-100 text-dorado-800")}>
      {saldo < total ? "Pago parcial" : "Pendiente"}
    </span>
  );
}

export function BadgeMoneda({ moneda }: { moneda: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-4 shrink-0 items-center rounded-sm px-1 text-[10px] font-semibold tracking-wide",
        moneda === "USD" ? "bg-sky-100 text-sky-800" : "bg-superficie text-muted-foreground"
      )}
    >
      {moneda}
    </span>
  );
}

// ------------------------------------------------------------
// Contenedores
// ------------------------------------------------------------

export function Panel({
  titulo,
  icono: Icono,
  accion,
  children,
  className,
  delay = 0,
}: {
  titulo?: React.ReactNode;
  icono?: LucideIcon;
  accion?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...easeSmooth, delay }}
      className={cn("rounded-2xl border border-linea bg-white", className)}
    >
      {(titulo || accion) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-linea px-4 py-3">
          <h2 className="flex items-center gap-2 font-heading text-sm text-foreground">
            {Icono && <Icono className="size-4 text-bordo-700" />}
            {titulo}
          </h2>
          {accion}
        </div>
      )}
      {children}
    </motion.section>
  );
}

export function Kpi({
  etiqueta,
  children,
  detalle,
  tono = "neutro",
  delay = 0,
}: {
  etiqueta: string;
  children: React.ReactNode;
  detalle?: React.ReactNode;
  tono?: "neutro" | "alerta" | "bueno";
  delay?: number;
}) {
  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      transition={{ ...easeSmooth, delay }}
      whileHover={{ y: -2 }}
      className={cn(
        "rounded-2xl border bg-white p-4 transition-shadow hover:shadow-card-hover",
        tono === "alerta" ? "border-rose-200" : tono === "bueno" ? "border-emerald-200" : "border-linea"
      )}
    >
      <div className="font-heading text-[11px] uppercase tracking-editorial text-muted-foreground">{etiqueta}</div>
      <div
        className={cn(
          "mt-1 font-heading text-xl",
          tono === "alerta" ? "text-rose-700" : tono === "bueno" ? "text-emerald-700" : "text-foreground"
        )}
      >
        {children}
      </div>
      {detalle && <div className="mt-0.5 text-xs text-muted-foreground">{detalle}</div>}
    </motion.div>
  );
}

export function Vacio({
  icono: Icono,
  titulo,
  texto,
  children,
}: {
  icono: LucideIcon;
  titulo: string;
  texto?: string;
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center rounded-2xl border border-dashed border-linea bg-white px-4 py-12 text-center"
    >
      <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-superficie">
        <Icono className="size-6 text-muted-foreground" />
      </div>
      <div className="font-heading text-base text-foreground">{titulo}</div>
      {texto && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{texto}</p>}
      {children && <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>}
    </motion.div>
  );
}

export function Campo({
  etiqueta,
  error,
  ayuda,
  children,
  className,
}: {
  etiqueta: string;
  error?: string | null;
  ayuda?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1", className)}>
      <span className={claseEtiqueta}>{etiqueta}</span>
      {children}
      <AnimatePresence initial={false}>
        {error ? (
          <motion.span
            key="e"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="block px-0.5 text-xs text-rose-700"
          >
            {error}
          </motion.span>
        ) : ayuda ? (
          <span className="block px-0.5 text-[11px] text-muted-foreground">{ayuda}</span>
        ) : null}
      </AnimatePresence>
    </label>
  );
}

// ------------------------------------------------------------
// Botones y links
// ------------------------------------------------------------

const claseBoton = {
  primario: "bg-bordo-800 text-white shadow-sm hover:bg-bordo-900",
  secundario: "border border-linea bg-white text-foreground hover:border-bordo-200 hover:bg-superficie",
  peligro: "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
  dorado: "bg-dorado-300 text-bordo-950 hover:bg-dorado-400",
};

export function BotonLink({
  href,
  children,
  variante = "primario",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variante?: keyof typeof claseBoton;
  className?: string;
}) {
  return (
    <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} className="inline-flex">
      <Link
        href={href}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors",
          claseBoton[variante],
          className
        )}
      >
        {children}
      </Link>
    </motion.div>
  );
}

export function Boton({
  children,
  variante = "primario",
  pendiente,
  className,
  disabled,
  ...props
}: Omit<React.ComponentProps<typeof motion.button>, "children"> & {
  children: React.ReactNode;
  variante?: keyof typeof claseBoton;
  pendiente?: boolean;
}) {
  const off = disabled || pendiente;
  return (
    <motion.button
      type="button"
      whileHover={off ? undefined : { y: -1 }}
      whileTap={off ? undefined : { scale: 0.97 }}
      disabled={off}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        claseBoton[variante],
        className
      )}
      {...props}
    >
      {pendiente && <Loader2 className="size-4 animate-spin" />}
      {children}
    </motion.button>
  );
}

export function LinkAsiento({ id, className }: { id: string | null | undefined; className?: string }) {
  if (!id) return null;
  return (
    <Link
      href={`/contabilidad/asientos/${id}`}
      className={cn(
        "group inline-flex items-center gap-1 rounded-full border border-bordo-100 bg-bordo-50 px-2.5 py-0.5 text-[11px] font-medium text-bordo-800 transition-colors hover:bg-bordo-100",
        className
      )}
    >
      Asiento contable
      <ArrowUpRight className="size-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </Link>
  );
}

export function Importe({ valor, moneda, className }: { valor: number; moneda?: string; className?: string }) {
  return <span className={cn("tabular-nums", className)}>{formatImporte(valor, moneda)}</span>;
}

/** Lista de pastillas para filtrar, con indicador animado. */
export function Filtros<T extends string>({
  opciones,
  valor,
  onChange,
  id,
}: {
  opciones: { valor: T; etiqueta: string; cantidad?: number }[];
  valor: T;
  onChange: (v: T) => void;
  id: string;
}) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
      {opciones.map((o) => {
        const activo = o.valor === valor;
        return (
          <motion.button
            key={o.valor}
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => onChange(o.valor)}
            className={cn(
              "relative shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              activo ? "text-bordo-800" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {activo && (
              <motion.span
                layoutId={`filtro-${id}`}
                className="absolute inset-0 rounded-full bg-bordo-50 ring-1 ring-bordo-100"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative">
              {o.etiqueta}
              {o.cantidad !== undefined && <span className="ml-1 tabular-nums opacity-60">{o.cantidad}</span>}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
