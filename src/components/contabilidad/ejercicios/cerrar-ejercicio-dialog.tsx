"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Lock,
  XCircle,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatFecha } from "@/lib/contabilidad/formato";
import { easeSmooth, fadeInUp, staggerContainerFast } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { cerrarEjercicio } from "@/app/(dashboard)/contabilidad/ejercicios/actions";
import type { EjercicioVista } from "./ejercicios-cliente";

type Chequeo = {
  clave: string;
  estado: "ok" | "error" | "aviso";
  titulo: string;
  detalle: React.ReactNode;
};

function formatTasa(n: number): string {
  return new Intl.NumberFormat("es-UY", { minimumFractionDigits: 3, maximumFractionDigits: 6 }).format(n);
}

export function CerrarEjercicioDialog({
  open,
  onOpenChange,
  ejercicio,
  anteriorAbierto,
  hoy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ejercicio: EjercicioVista;
  /** Nombre del ejercicio anterior si sigue abierto. */
  anteriorAbierto: string | null;
  hoy: string;
}) {
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  const anio = String(ejercicio.anio);
  const siguiente = ejercicio.anio + 1;

  const chequeos: Chequeo[] = [
    ejercicio.borradores === 0
      ? {
          clave: "borradores",
          estado: "ok",
          titulo: "Sin asientos en borrador",
          detalle: "Todos los asientos del ejercicio están confirmados.",
        }
      : {
          clave: "borradores",
          estado: "error",
          titulo: `${ejercicio.borradores} ${ejercicio.borradores === 1 ? "asiento" : "asientos"} en borrador`,
          detalle: (
            <>
              Confirmalos o borralos desde el{" "}
              <Link href="/contabilidad/asientos" className="underline underline-offset-2">
                Libro diario
              </Link>
              .
            </>
          ),
        },
    ...(ejercicio.cotizacionesCierre.length === 0
      ? [
          {
            clave: "cotizacion",
            estado: "ok" as const,
            titulo: "Sin cuentas en moneda extranjera",
            detalle: "No hay saldos para revaluar.",
          },
        ]
      : ejercicio.cotizacionesCierre.map((c): Chequeo =>
          c.fecha && c.tasa
            ? {
                clave: `cotizacion-${c.moneda}`,
                estado: "ok",
                titulo: `Cotización ${c.moneda} de cierre cargada`,
                detalle: (
                  <>
                    <span className="tabular-nums">{formatTasa(c.tasa)}</span> del{" "}
                    {formatFecha(c.fecha)} ({c.fuente === "bcu" ? "BCU" : "manual"}).
                    {c.fecha !== ejercicio.fechaFin && " Es la última anterior al cierre: se usa esa."}
                  </>
                ),
              }
            : {
                clave: `cotizacion-${c.moneda}`,
                estado: "error",
                titulo: `Falta la cotización ${c.moneda} de cierre`,
                detalle: (
                  <>
                    No hay cotización en los últimos 7 días del ejercicio. Actualizala desde{" "}
                    <Link href="/contabilidad/cotizaciones" className="underline underline-offset-2">
                      Cotizaciones
                    </Link>
                    .
                  </>
                ),
              }
        )),
    anteriorAbierto
      ? {
          clave: "anterior",
          estado: "error",
          titulo: "El ejercicio anterior sigue abierto",
          detalle: `Primero cerrá el ${anteriorAbierto}.`,
        }
      : {
          clave: "anterior",
          estado: "ok",
          titulo: "Ejercicio anterior cerrado",
          detalle: "No quedan ejercicios previos abiertos.",
        },
    ...(hoy <= ejercicio.fechaFin
      ? [
          {
            clave: "terminado",
            estado: "aviso" as const,
            titulo: "El ejercicio todavía no terminó",
            detalle: `Termina el ${formatFecha(ejercicio.fechaFin)}. Después del cierre no se puede registrar nada con fecha de ${anio}.`,
          },
        ]
      : []),
  ];

  const bloqueado = chequeos.some((c) => c.estado === "error");
  const confirmado = confirmacion.trim() === anio;

  const pasos = [
    {
      titulo: "Revaluación de saldos en dólares",
      texto: `Con la cotización BCU del cierre (${formatFecha(ejercicio.fechaFin)} o la última anterior). La diferencia va a diferencias de cambio.`,
    },
    {
      titulo: "Cierre de cuentas de resultado",
      texto: "Ingresos y egresos quedan en cero contra Superávit (déficit) del ejercicio.",
    },
    {
      titulo: "Refundición",
      texto: "El resultado del ejercicio pasa a Superávit (déficit) acumulado.",
    },
    {
      titulo: "Cierre de los 12 períodos",
      texto: `El ejercicio ${anio} queda cerrado: no admite asientos nuevos.`,
    },
    {
      titulo: `Apertura del Ejercicio ${siguiente}`,
      texto: `Se crea (si no existe) con un asiento de apertura al 01/01/${siguiente} con los saldos de activo, pasivo y patrimonio.`,
    },
  ];

  function cambiar(abierto: boolean) {
    if (pendiente) return;
    if (abierto) {
      setConfirmacion("");
      setError(null);
    }
    onOpenChange(abierto);
  }

  function cerrar() {
    setError(null);
    startTransition(async () => {
      const r = await cerrarEjercicio({ ejercicioId: ejercicio.id, confirmacion });
      if (r.ok) {
        toast.success(`${ejercicio.nombre} cerrado. Se abrió el Ejercicio ${siguiente} con su apertura.`);
        onOpenChange(false);
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={cambiar}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-full bg-bordo-800 text-white">
            <Lock className="size-5" />
          </div>
          <DialogTitle className="font-heading text-lg text-bordo-950">
            Cerrar {ejercicio.nombre}
          </DialogTitle>
          <DialogDescription>
            Es el cierre anual: genera los asientos de cierre en un solo paso. Si después hace falta
            corregir algo, se puede reabrir mientras el ejercicio siguiente no tenga movimientos.
          </DialogDescription>
        </DialogHeader>

        <section>
          <h3 className="mb-2 font-heading text-[11px] uppercase tracking-editorial text-muted-foreground">
            Qué va a pasar
          </h3>
          <motion.ol
            className="space-y-2"
            variants={staggerContainerFast}
            initial="hidden"
            animate="visible"
          >
            {pasos.map((p, i) => (
              <motion.li
                key={p.titulo}
                variants={fadeInUp}
                transition={easeSmooth}
                className="flex gap-3"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-bordo-50 font-heading text-xs text-bordo-800 tabular-nums">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-heading text-sm text-foreground">{p.titulo}</p>
                  <p className="text-xs text-muted-foreground">{p.texto}</p>
                </div>
              </motion.li>
            ))}
          </motion.ol>
        </section>

        <section>
          <h3 className="mb-2 font-heading text-[11px] uppercase tracking-editorial text-muted-foreground">
            Chequeos previos
          </h3>
          <motion.ul
            className="divide-y divide-linea overflow-hidden rounded-xl border border-linea"
            variants={staggerContainerFast}
            initial="hidden"
            animate="visible"
          >
            {chequeos.map((c) => (
              <motion.li
                key={c.clave}
                variants={fadeInUp}
                transition={easeSmooth}
                className={cn(
                  "flex gap-2.5 p-3",
                  c.estado === "error" && "bg-red-50/60",
                  c.estado === "aviso" && "bg-amber-50/60"
                )}
              >
                {c.estado === "ok" && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />}
                {c.estado === "error" && <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" />}
                {c.estado === "aviso" && <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />}
                <div className="min-w-0 text-xs">
                  <p className="font-heading text-sm text-foreground">{c.titulo}</p>
                  <p className="text-muted-foreground">{c.detalle}</p>
                </div>
              </motion.li>
            ))}
          </motion.ul>
        </section>

        <div className="space-y-1.5">
          <Label htmlFor="confirmar-anio" className="font-heading">
            Para confirmar, escribí <span className="tabular-nums text-bordo-800">{anio}</span>
          </Label>
          <Input
            id="confirmar-anio"
            inputMode="numeric"
            autoComplete="off"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            disabled={bloqueado || pendiente}
            placeholder={anio}
            className="h-10 max-w-32 text-base tabular-nums"
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
          <Button
            className="rounded-full bg-bordo-800 text-white hover:bg-bordo-900"
            onClick={cerrar}
            disabled={bloqueado || !confirmado || pendiente}
          >
            {pendiente ? <Loader2 className="size-3.5 animate-spin" /> : <Lock className="size-3.5" />}
            {pendiente ? "Cerrando ejercicio…" : `Cerrar ejercicio ${anio}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
