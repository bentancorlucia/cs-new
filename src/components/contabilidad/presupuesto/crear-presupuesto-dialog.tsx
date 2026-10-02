"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, Copy, FilePlus2, History, Loader2, Sigma, Target } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { easeSnappy, springSmooth } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { BasePresupuesto } from "@/lib/contabilidad/presupuesto";
import { crearPresupuesto } from "@/app/(dashboard)/contabilidad/presupuesto/actions";

interface OpcionBase {
  base: BasePresupuesto;
  titulo: string;
  descripcion: string;
  icono: typeof Copy;
  deshabilitada?: string | null;
}

/**
 * Crea el borrador del ejercicio. Con un aprobado vigente, la opción por
 * defecto es reformularlo (versión nueva que parte de sus importes); al
 * aprobarla, el anterior queda "reemplazado".
 */
export function CrearPresupuestoDialog({
  open,
  onOpenChange,
  ejercicioId,
  anio,
  versionVigente,
  hayAnterior,
  siguienteVersion,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ejercicioId: string;
  anio: number;
  /** Número de versión del aprobado vigente, si hay. */
  versionVigente: number | null;
  hayAnterior: boolean;
  siguienteVersion: number;
}) {
  const router = useRouter();
  const defecto: BasePresupuesto = versionVigente ? "vigente" : "vacio";
  const [base, setBase] = useState<BasePresupuesto>(defecto);
  const [meses, setMeses] = useState("3");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();
  const [abiertoAntes, setAbiertoAntes] = useState(false);

  // Lo abre el padre: al abrir se vuelve a los valores por defecto.
  if (open !== abiertoAntes) {
    setAbiertoAntes(open);
    if (open) {
      setBase(defecto);
      setMeses("3");
      setNombre("");
      setError(null);
    }
  }

  const opciones: OpcionBase[] = [
    ...(versionVigente
      ? [
          {
            base: "vigente" as const,
            titulo: `Reformular la versión ${versionVigente}`,
            descripcion: "Copia los importes del aprobado vigente para ajustarlos. Al aprobarla, reemplaza al anterior.",
            icono: History,
          },
        ]
      : []),
    {
      base: "vacio",
      titulo: "En blanco",
      descripcion: "Empezás sin importes y agregás las cuentas a mano.",
      icono: FilePlus2,
    },
    {
      base: "ejercicio_anterior",
      titulo: `Lo real de ${anio - 1}`,
      descripcion: "Precarga, mes a mes, lo ejecutado en el ejercicio anterior en cada cuenta y centro de costo.",
      icono: CalendarClock,
      deshabilitada: hayAnterior ? null : `No hay un ejercicio ${anio - 1} cargado`,
    },
    {
      base: "promedio",
      titulo: "Promedio de los últimos meses",
      descripcion:
        "Promedio mensual de lo real de los últimos meses cerrados (sin el mes en curso), aunque sean del mismo ejercicio, repetido en los 12 meses.",
      icono: Sigma,
    },
  ];

  const mesesNum = Number(meses);
  const mesesValido = Number.isInteger(mesesNum) && mesesNum >= 1 && mesesNum <= 24;
  const valido = base !== "promedio" || mesesValido;

  function cambiar(abierto: boolean) {
    if (pendiente) return;
    onOpenChange(abierto);
  }

  function crear() {
    setError(null);
    startTransition(async () => {
      const r = await crearPresupuesto({
        ejercicioId,
        base,
        meses: base === "promedio" ? mesesNum : 3,
        nombre: nombre.trim() || undefined,
      });
      if (r.ok) {
        toast.success(versionVigente ? "Reformulación creada: ajustá los importes" : "Borrador creado");
        onOpenChange(false);
        router.push(`/contabilidad/presupuesto/${r.data.id}`);
      } else {
        setError(r.error);
      }
    });
  }

  const nombreSugerido = `Presupuesto ${anio}${siguienteVersion > 1 ? ` — versión ${siguienteVersion}` : ""}`;

  return (
    <Dialog open={open} onOpenChange={cambiar}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-full bg-bordo-50 text-bordo-800">
            <Target className="size-5" />
          </div>
          <DialogTitle className="font-heading text-lg text-bordo-950">
            {versionVigente ? `Nueva versión del presupuesto ${anio}` : `Presupuesto ${anio}`}
          </DialogTitle>
          <DialogDescription>
            Se crea como borrador: lo editás tranquilo y, cuando esté listo, lo aprobás. Un presupuesto aprobado queda
            congelado.
          </DialogDescription>
        </DialogHeader>

        <div role="radiogroup" aria-label="Punto de partida" className="space-y-2">
          <p className="text-[11px] font-heading uppercase tracking-editorial text-muted-foreground">Punto de partida</p>
          {opciones.map((o) => {
            const activa = base === o.base;
            const Icono = o.icono;
            return (
              <motion.button
                key={o.base}
                type="button"
                role="radio"
                aria-checked={activa}
                disabled={!!o.deshabilitada}
                whileTap={o.deshabilitada ? undefined : { scale: 0.985 }}
                onClick={() => setBase(o.base)}
                className={cn(
                  "relative flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                  activa ? "border-bordo-700" : "border-linea hover:border-bordo-200",
                  o.deshabilitada && "cursor-not-allowed opacity-50 hover:border-linea"
                )}
              >
                {activa && (
                  <motion.span
                    layoutId="base-presupuesto"
                    className="absolute inset-0 rounded-xl bg-bordo-50/70"
                    transition={springSmooth}
                  />
                )}
                <Icono className={cn("relative mt-0.5 size-4 shrink-0", activa ? "text-bordo-800" : "text-muted-foreground")} />
                <span className="relative min-w-0">
                  <span className="block font-heading text-sm text-foreground">{o.titulo}</span>
                  <span className="block text-xs text-muted-foreground">{o.deshabilitada ?? o.descripcion}</span>
                </span>
              </motion.button>
            );
          })}
        </div>

        <AnimatePresence initial={false}>
          {base === "promedio" && (
            <motion.div
              key="meses"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={easeSnappy}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-3 pt-1">
                <Label htmlFor="meses-promedio" className="font-heading text-sm">
                  Meses a promediar
                </Label>
                <Input
                  id="meses-promedio"
                  inputMode="numeric"
                  value={meses}
                  onChange={(e) => setMeses(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  aria-invalid={!mesesValido}
                  className="h-9 w-20 tabular-nums"
                />
                <span className="text-xs text-muted-foreground">entre 1 y 24</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-1.5">
          <Label htmlFor="nombre-presupuesto" className="font-heading text-sm">
            Nombre <span className="font-body text-xs text-muted-foreground">(opcional)</span>
          </Label>
          <Input
            id="nombre-presupuesto"
            value={nombre}
            maxLength={120}
            placeholder={nombreSugerido}
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>

        <AnimatePresence>
          {error && (
            <motion.p
              key={error}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, x: [0, -6, 6, -4, 4, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
              role="alert"
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => cambiar(false)} disabled={pendiente}>
            Cancelar
          </Button>
          <Button className="rounded-full" onClick={crear} disabled={!valido || pendiente}>
            {pendiente && <Loader2 className="size-3.5 animate-spin" />}
            {pendiente ? "Creando…" : "Crear borrador"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
