"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion, useSpring } from "framer-motion";
import {
  AlertTriangle,
  Ban,
  CreditCard,
  FileMinus,
  HandCoins,
  Info,
  Layers,
  LayoutDashboard,
  Loader2,
  Receipt,
  Search,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { easeSmooth } from "@/lib/motion";
import { NOMBRE_MEDIO, nombrePersona, type Persona } from "@/lib/socios/cuotas";
import { buscarPersonasAction } from "@/app/(dashboard)/cuotas/actions";
import { Boton, Campo, claseControl } from "@/components/compras/ui";

export {
  Boton,
  BotonLink,
  Campo,
  EncabezadoPagina,
  Filtros,
  Importe,
  ImporteAnimado,
  Kpi,
  LinkAsiento,
  Panel,
  Vacio,
  claseControl,
  claseEtiqueta,
} from "@/components/compras/ui";

const pill =
  "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap";

// ------------------------------------------------------------
// Navegación
// ------------------------------------------------------------

const TABS: { href: string; etiqueta: string; icono: LucideIcon; tesoreria?: boolean; exacto?: boolean }[] = [
  { href: "/cuotas", etiqueta: "Resumen", icono: LayoutDashboard, exacto: true },
  { href: "/cuotas/cobros", etiqueta: "Cobros", icono: HandCoins },
  { href: "/cuotas/lotes", etiqueta: "Emisión", icono: Layers, tesoreria: true },
  { href: "/cuotas/visa", etiqueta: "Débito Visa", icono: CreditCard, tesoreria: true },
  { href: "/cuotas/notas-credito", etiqueta: "Notas de crédito", icono: FileMinus, tesoreria: true },
  { href: "/cuotas/disciplinas", etiqueta: "Disciplinas", icono: Receipt, tesoreria: true },
  { href: "/cuotas/morosidad", etiqueta: "Morosidad", icono: AlertTriangle },
];

export function NavCuotas({ verTesoreria }: { verTesoreria: boolean }) {
  const pathname = usePathname();
  const tabs = TABS.filter((t) => !t.tesoreria || verTesoreria);
  return (
    <motion.nav
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      aria-label="Cuotas y cobranza"
      className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    >
      <div className="inline-flex min-w-full gap-1 rounded-2xl border border-linea bg-white p-1 sm:min-w-0">
        {tabs.map((t) => {
          const on = t.exacto ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
          const Icono = t.icono;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "relative inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors sm:text-sm",
                on ? "text-white" : "text-muted-foreground hover:bg-superficie hover:text-foreground"
              )}
            >
              {on && (
                <motion.span
                  layoutId="tab-cuotas"
                  className="absolute inset-0 rounded-xl bg-bordo-800 shadow-sm"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <Icono className="relative size-4" />
              <span className="relative whitespace-nowrap">{t.etiqueta}</span>
            </Link>
          );
        })}
      </div>
    </motion.nav>
  );
}

// ------------------------------------------------------------
// Números
// ------------------------------------------------------------

/** Entero que anima al cambiar (count-up). */
export function NumeroAnimado({ valor, className }: { valor: number; className?: string }) {
  const reducir = useReducedMotion();
  const spring = useSpring(0, { stiffness: 120, damping: 24 });
  const [mostrado, setMostrado] = useState(0);
  useEffect(() => {
    if (reducir) spring.jump(valor);
    else spring.set(valor);
  }, [valor, reducir, spring]);
  useEffect(() => spring.on("change", (v) => setMostrado(Math.round(v))), [spring]);
  return <span className={cn("tabular-nums", className)}>{mostrado.toLocaleString("es-UY")}</span>;
}

/** Barra de progreso que crece al aparecer. */
export function Barra({ valor, total, className, tono = "bordo" }: { valor: number; total: number; className?: string; tono?: "bordo" | "dorado" | "emerald" | "sky" | "violet" | "rose" }) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (valor / total) * 100)) : 0;
  const color = {
    bordo: "bg-bordo-700",
    dorado: "bg-dorado-400",
    emerald: "bg-emerald-500",
    sky: "bg-sky-500",
    violet: "bg-violet-500",
    rose: "bg-rose-500",
  }[tono];
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-superficie", className)}>
      <motion.div
        className={cn("h-full rounded-full", color)}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}

// ------------------------------------------------------------
// Badges
// ------------------------------------------------------------

export function BadgeEstado({ estado }: { estado: string }) {
  const anulado = estado === "anulado" || estado === "anulada";
  return (
    <span
      className={cn(
        pill,
        anulado ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {anulado ? (estado === "anulada" ? "Anulada" : "Anulado") : estado === "emitido" ? "Emitido" : "Vigente"}
    </span>
  );
}

const ESTILO_MEDIO: Record<string, string> = {
  debito_visa: "border-sky-200 bg-sky-50 text-sky-800",
  transferencia_club: "border-bordo-100 bg-bordo-50 text-bordo-800",
  transferencia_disciplina: "border-violet-200 bg-violet-50 text-violet-800",
  efectivo: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

export function BadgeMedio({ medio, detalle }: { medio: string | null; detalle?: string | null }) {
  if (!medio) return <span className={cn(pill, "border-linea bg-superficie text-muted-foreground")}>Sin medio</span>;
  return (
    <span className={cn(pill, ESTILO_MEDIO[medio] ?? ESTILO_MEDIO.transferencia_club)}>
      {NOMBRE_MEDIO[medio] ?? medio}
      {detalle ? `: ${detalle}` : ""}
    </span>
  );
}

export function BadgeAlDia({ alDia, vencidas }: { alDia: boolean; vencidas: number }) {
  if (alDia && vencidas === 0)
    return <span className={cn(pill, "border-emerald-200 bg-emerald-50 text-emerald-700")}>Al día</span>;
  if (alDia)
    return (
      <span className={cn(pill, "border-dorado-300 bg-dorado-100 text-dorado-800")}>
        Al día · {vencidas} vencida{vencidas === 1 ? "" : "s"}
      </span>
    );
  return (
    <span className={cn(pill, "border-rose-200 bg-rose-50 text-rose-700")}>
      Moroso · {vencidas} vencida{vencidas === 1 ? "" : "s"}
    </span>
  );
}

export function Pastilla({ children, tono = "neutro" }: { children: React.ReactNode; tono?: "neutro" | "alerta" | "info" | "bueno" }) {
  const estilos = {
    neutro: "border-linea bg-superficie text-muted-foreground",
    alerta: "border-rose-200 bg-rose-50 text-rose-700",
    info: "border-sky-200 bg-sky-50 text-sky-800",
    bueno: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };
  return <span className={cn(pill, estilos[tono])}>{children}</span>;
}

// ------------------------------------------------------------
// Textos de ayuda
// ------------------------------------------------------------

/** Una línea que explica qué es un número. */
export function Explicacion({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground", className)}>
      <Info className="mt-px size-3 shrink-0 opacity-70" />
      <span>{children}</span>
    </p>
  );
}

export function Aviso({
  tono = "alerta",
  titulo,
  children,
}: {
  tono?: "alerta" | "info" | "ok";
  titulo: React.ReactNode;
  children?: React.ReactNode;
}) {
  const estilos = {
    alerta: "border-rose-200 bg-rose-50 text-rose-900",
    info: "border-sky-200 bg-sky-50 text-sky-900",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={easeSmooth}
      role={tono === "alerta" ? "alert" : undefined}
      className={cn("rounded-2xl border p-4 text-sm", estilos[tono])}
    >
      <div className="flex items-center gap-2 font-heading">
        {tono === "alerta" ? <AlertTriangle className="size-4" /> : <Info className="size-4" />}
        {titulo}
      </div>
      {children && <div className="mt-1 text-xs opacity-90">{children}</div>}
    </motion.div>
  );
}

// ------------------------------------------------------------
// Diálogos
// ------------------------------------------------------------

type Res = { ok: true } | { ok: false; error: string };

/** Diálogo con formulario que ejecuta una Server Action y muestra el error de la base. */
export function DialogoAccion({
  open,
  onOpenChange,
  icono: Icono,
  titulo,
  descripcion,
  children,
  textoAccion,
  destructivo,
  deshabilitado,
  ancho = "sm:max-w-md",
  ejecutar,
  mensaje = "Listo",
  alTerminar,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  icono: LucideIcon;
  titulo: string;
  descripcion?: React.ReactNode;
  children?: React.ReactNode;
  textoAccion: string;
  destructivo?: boolean;
  deshabilitado?: boolean;
  ancho?: string;
  ejecutar: () => Promise<Res>;
  mensaje?: string;
  alTerminar?: () => void;
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
    start(async () => {
      const r = await ejecutar();
      if (r.ok) {
        toast.success(mensaje);
        onOpenChange(false);
        if (alTerminar) alTerminar();
        else router.refresh();
      } else {
        setError(r.error);
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={cambiar}>
      <DialogContent className={cn("max-h-[90dvh] overflow-y-auto", ancho)}>
        <form onSubmit={enviar} className="space-y-4">
          <DialogHeader>
            <div
              className={cn(
                "flex size-10 items-center justify-center rounded-full",
                destructivo ? "bg-rose-50 text-rose-700" : "bg-bordo-50 text-bordo-800"
              )}
            >
              <Icono className="size-5" />
            </div>
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
            <Boton
              type="submit"
              variante={destructivo ? "peligro" : "primario"}
              pendiente={pendiente}
              disabled={deshabilitado}
              className={destructivo ? "border-rose-600 bg-rose-600 text-white hover:bg-rose-700" : undefined}
            >
              {textoAccion}
            </Boton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Anular un documento con motivo (la base hace el contra-asiento). */
export function DialogoAnular({
  open,
  onOpenChange,
  titulo,
  descripcion,
  anular,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  titulo: string;
  descripcion: React.ReactNode;
  anular: (motivo: string) => Promise<Res>;
}) {
  const [motivo, setMotivo] = useState("");
  return (
    <DialogoAccion
      open={open}
      onOpenChange={(o) => {
        if (!o) setMotivo("");
        onOpenChange(o);
      }}
      icono={Ban}
      titulo={titulo}
      descripcion={descripcion}
      textoAccion="Anular"
      destructivo
      deshabilitado={motivo.trim().length < 3}
      mensaje="Anulado"
      ejecutar={() => anular(motivo.trim())}
    >
      <Campo etiqueta="Motivo" ayuda="Queda registrado junto con el contra-asiento.">
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          autoFocus
          className={cn(claseControl, "h-auto py-2")}
          placeholder="Por qué se anula"
        />
      </Campo>
    </DialogoAccion>
  );
}

// ------------------------------------------------------------
// Buscador de personas
// ------------------------------------------------------------

export function BuscadorPersona({
  valor,
  onElegir,
  placeholder = "Nombre, cédula o número de socio…",
  autoFocus,
  compacto,
}: {
  valor: Persona | null;
  onElegir: (p: Persona | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
  compacto?: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<Persona[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [activo, setActivo] = useState(0);
  const pedido = useRef(0);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idLista = useId();

  useEffect(() => () => {
    if (espera.current) clearTimeout(espera.current);
  }, []);

  function escribir(t: string) {
    setTexto(t);
    setAbierto(true);
    if (espera.current) clearTimeout(espera.current);
    const q = t.trim();
    const n = ++pedido.current;
    if (q.length < 2) {
      setResultados([]);
      setCargando(false);
      return;
    }
    setCargando(true);
    espera.current = setTimeout(async () => {
      const r = await buscarPersonasAction(q);
      if (n !== pedido.current) return;
      setCargando(false);
      setResultados(r.ok ? r.data : []);
      setActivo(0);
    }, 250);
  }

  if (valor) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          "flex items-center gap-3 rounded-xl border border-bordo-100 bg-bordo-50/50",
          compacto ? "px-2 py-1" : "px-3 py-2"
        )}
      >
        {!compacto && (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bordo-800 text-white">
            <UserRound className="size-4" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className={cn("truncate font-medium", compacto ? "text-xs" : "text-sm")}>{nombrePersona(valor)}</div>
          <div className="truncate text-[11px] text-muted-foreground tabular-nums">
            CI {valor.cedula}
            {valor.numero_socio ? ` · Socio Nº ${valor.numero_socio}` : ""}
            {!valor.activo && " · no es socio hoy"}
          </div>
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() => {
            onElegir(null);
            escribir("");
          }}
          className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-white hover:text-foreground"
          aria-label="Cambiar persona"
        >
          <X className="size-4" />
        </motion.button>
      </motion.div>
    );
  }

  const elegir = (p: Persona) => {
    onElegir(p);
    setAbierto(false);
    setResultados([]);
  };

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={texto}
        autoFocus={autoFocus}
        onChange={(e) => escribir(e.target.value)}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => {
          if (!resultados.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActivo((a) => Math.min(a + 1, resultados.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActivo((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            elegir(resultados[activo]);
          }
        }}
        placeholder={placeholder}
        className={cn(claseControl, "pl-9", compacto && "h-8 text-xs")}
        role="combobox"
        aria-expanded={abierto && resultados.length > 0}
        aria-controls={idLista}
        aria-label="Buscar persona"
      />
      {cargando && <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      <AnimatePresence>
        {abierto && texto.trim().length >= 2 && !cargando && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-linea bg-white p-1 shadow-card-hover"
            role="listbox"
            id={idLista}
          >
            {resultados.length === 0 ? (
              <li className="px-3 py-2 text-xs text-muted-foreground">Sin resultados</li>
            ) : (
              resultados.map((p, i) => (
                <li key={p.id} role="option" aria-selected={i === activo}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => elegir(p)}
                    onMouseEnter={() => setActivo(i)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      i === activo ? "bg-bordo-50 text-bordo-900" : "hover:bg-superficie"
                    )}
                  >
                    <span className="min-w-0 truncate">{nombrePersona(p)}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                      {p.cedula}
                      {p.numero_socio ? ` · Nº ${p.numero_socio}` : ""}
                    </span>
                  </button>
                </li>
              ))
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

// ------------------------------------------------------------
// Tablas
// ------------------------------------------------------------

/** Tabla con scroll horizontal propio (la página no scrollea de costado). */
export function TablaScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("max-w-full overflow-x-auto", className)}>
      <table className="w-full min-w-[640px] text-sm">{children}</table>
    </div>
  );
}

export const claseTh = "px-3 py-2 text-left text-[10px] font-medium uppercase tracking-editorial text-muted-foreground";
export const claseTd = "px-3 py-2 align-top";
