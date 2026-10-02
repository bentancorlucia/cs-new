"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  History,
  Loader2,
  Pencil,
  Trash2,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { staggerContainerFast, fadeInUp, easeSmooth } from "@/lib/motion";
import type { AsientoDetalle, LineaDetalle } from "@/lib/contabilidad/asientos";
import {
  confirmarAsiento,
  eliminarBorrador,
  revertirAsiento,
} from "@/app/(dashboard)/contabilidad/asientos/actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BadgeEstado, BadgeTipo, BadgeUsd, MarcaRevertido } from "./ui-asiento";

const partesUy = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Montevideo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "dd/mm/aaaa hh:mm" en hora de Uruguay, armado a mano para que servidor y navegador coincidan. */
function formatMomento(iso: string | null): string {
  if (!iso) return "";
  const p = Object.fromEntries(partesUy.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

function esRevertible(a: AsientoDetalle): boolean {
  return (
    a.estado === "confirmado" &&
    !a.revertido_por &&
    (a.tipo === "manual" || a.tipo === "automatico" || a.tipo === "revaluacion") &&
    !(a.origen_tipo ?? "").startsWith("cierre_")
  );
}

export function AsientoDetalleVista({
  asiento: a,
  puedeEscribir,
  hoy,
}: {
  asiento: AsientoDetalle;
  puedeEscribir: boolean;
  hoy: string;
}) {
  const totalDebe = a.lineas.reduce((s, l) => s + l.debe, 0);
  const totalHaber = a.lineas.reduce((s, l) => s + l.haber, 0);
  const editable = a.estado === "borrador" && (a.tipo === "manual" || a.tipo === "apertura");

  return (
    <motion.div initial="hidden" animate="visible" variants={staggerContainerFast} className="space-y-5 pb-8">
      <motion.div variants={fadeInUp} transition={easeSmooth}>
        <Link
          href="/contabilidad/asientos"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-bordo-800"
        >
          <ArrowLeft className="size-3.5" />
          Libro diario
        </Link>
      </motion.div>

      {/* Cabecera */}
      <motion.div
        variants={fadeInUp}
        transition={easeSmooth}
        className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
      >
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <BadgeTipo tipo={a.tipo} />
            <BadgeEstado estado={a.estado} />
            {a.revertido_por && <MarcaRevertido />}
          </div>
          <h1 className="font-display text-2xl uppercase tracking-tightest text-foreground sm:text-3xl">
            {a.numero ? (
              <>
                Asiento <span className="text-bordo-800 tabular-nums">N° {a.numero}</span>
              </>
            ) : (
              "Asiento en borrador"
            )}
          </h1>
          <p className={cn("max-w-3xl text-sm text-foreground/80", a.revertido_por && "line-through decoration-rose-300")}>
            {a.descripcion}
          </p>
        </div>
        {puedeEscribir && (
          <Acciones
            id={a.id}
            numero={a.numero}
            fecha={a.fecha}
            hoy={hoy}
            editable={editable}
            borrador={a.estado === "borrador"}
            revertible={esRevertible(a)}
            total={totalDebe}
          />
        )}
      </motion.div>

      {/* Vínculos de reversión */}
      {a.asiento_revertido && (
        <motion.div
          variants={fadeInUp}
          transition={easeSmooth}
          className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 text-sm text-rose-900"
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <Undo2 className="size-4" />
            Revierte al{" "}
            <Link
              href={`/contabilidad/asientos/${a.asiento_revertido.id}`}
              className="font-medium underline underline-offset-2 hover:text-bordo-800"
            >
              asiento N° {a.asiento_revertido.numero} del {formatFecha(a.asiento_revertido.fecha)}
            </Link>
          </div>
          {a.motivo && (
            <p className="mt-1.5 text-rose-900/80">
              <span className="font-medium">Motivo:</span> {a.motivo}
            </p>
          )}
        </motion.div>
      )}
      {a.revertido_por && (
        <motion.div
          variants={fadeInUp}
          transition={easeSmooth}
          className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-rose-200 bg-white p-4 text-sm text-rose-800"
        >
          <Undo2 className="size-4" />
          Este asiento fue revertido por el{" "}
          <Link
            href={`/contabilidad/asientos/${a.revertido_por.id}`}
            className="group inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:text-bordo-800"
          >
            asiento N° {a.revertido_por.numero} del {formatFecha(a.revertido_por.fecha)}
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </motion.div>
      )}

      {/* Datos */}
      <motion.dl variants={fadeInUp} transition={easeSmooth} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Dato etiqueta="Fecha" valor={formatFecha(a.fecha)} sub={a.ejercicio ?? undefined} />
        <Dato etiqueta="Creado" valor={a.creado_por ?? "Sistema"} sub={formatMomento(a.created_at)} />
        <Dato
          etiqueta="Confirmado"
          valor={a.confirmado_at ? a.confirmado_por ?? "Sistema" : "Pendiente"}
          sub={a.confirmado_at ? formatMomento(a.confirmado_at) : "Todavía es borrador"}
        />
        <Dato
          etiqueta="Origen"
          valor={a.origen_tipo ?? "Carga manual"}
          sub={a.origen_id ?? undefined}
          mono={!!a.origen_id}
        />
      </motion.dl>

      {/* Líneas */}
      <motion.section variants={fadeInUp} transition={easeSmooth} className="overflow-hidden rounded-2xl border border-linea bg-white">
        <div className="hidden grid-cols-[2rem_minmax(0,1.3fr)_minmax(0,1fr)_9rem_9rem] gap-3 border-b border-linea bg-superficie px-4 py-2.5 font-heading text-[11px] uppercase tracking-editorial text-muted-foreground md:grid">
          <span>#</span>
          <span>Cuenta</span>
          <span>Detalle</span>
          <span className="text-right">Debe</span>
          <span className="text-right">Haber</span>
        </div>
        <motion.ul initial="hidden" animate="visible" variants={staggerContainerFast} className="divide-y divide-linea">
          {a.lineas.map((l, i) => (
            <FilaDetalle key={l.id} linea={l} indice={i} />
          ))}
        </motion.ul>
        <div className="grid grid-cols-2 gap-3 border-t border-linea bg-superficie/60 px-4 py-3 md:grid-cols-[2rem_minmax(0,1.3fr)_minmax(0,1fr)_9rem_9rem]">
          <span className="font-heading text-xs uppercase tracking-editorial text-muted-foreground md:col-span-3">
            Totales
          </span>
          <div className="col-span-2 grid grid-cols-2 gap-3 md:contents">
            <span className="text-right font-heading text-sm tabular-nums">{formatImporte(totalDebe)}</span>
            <span className="text-right font-heading text-sm tabular-nums">{formatImporte(totalHaber)}</span>
          </div>
        </div>
      </motion.section>

      {/* Historial */}
      <motion.section variants={fadeInUp} transition={easeSmooth} className="rounded-2xl border border-linea bg-white p-4">
        <h2 className="mb-3 flex items-center gap-2 font-heading text-sm text-foreground">
          <History className="size-4 text-bordo-800" />
          Historial
        </h2>
        {a.auditoria.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin registros de auditoría.</p>
        ) : (
          <ol className="relative space-y-3 border-l border-linea pl-4">
            {a.auditoria.map((e, i) => (
              <motion.li
                key={e.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.04, duration: 0.3 }}
                className="relative text-sm"
              >
                <span
                  className={cn(
                    "absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-white",
                    e.etiqueta === "Confirmado"
                      ? "bg-emerald-500"
                      : e.etiqueta === "Revertido" || e.etiqueta === "Eliminado"
                        ? "bg-rose-500"
                        : "bg-bordo-300"
                  )}
                />
                <span className="font-medium text-foreground">{e.etiqueta}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {e.usuario ?? (e.proceso ? `Proceso ${e.proceso}` : "Sistema")} · {formatMomento(e.at)}
                </span>
              </motion.li>
            ))}
          </ol>
        )}
      </motion.section>
    </motion.div>
  );
}

function Dato({ etiqueta, valor, sub, mono }: { etiqueta: string; valor: string; sub?: string; mono?: boolean }) {
  return (
    <div className="rounded-2xl border border-linea bg-white p-4">
      <dt className="font-heading text-[11px] uppercase tracking-editorial text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-1 truncate font-heading text-base text-foreground">{valor}</dd>
      {sub && <dd className={cn("truncate text-xs text-muted-foreground", mono && "font-mono")}>{sub}</dd>}
    </div>
  );
}

function FilaDetalle({ linea: l, indice }: { linea: LineaDetalle; indice: number }) {
  const extra = [
    l.proveedor && `Proveedor: ${l.proveedor}`,
    l.disciplina && `Disciplina: ${l.disciplina}`,
    l.centro && `Centro: ${l.centro}`,
  ].filter(Boolean) as string[];

  const importe = (valor: number) =>
    valor > 0 ? (
      <div className="text-right">
        <div className="font-medium tabular-nums text-foreground">{formatImporte(valor)}</div>
        {l.moneda && l.importe_origen !== null && l.tc !== null && (
          <div className="text-[11px] text-sky-800 tabular-nums">
            {formatImporte(l.importe_origen, l.moneda)} × {String(l.tc).replace(".", ",")}
          </div>
        )}
      </div>
    ) : (
      <div className="hidden text-right text-muted-foreground/40 md:block">—</div>
    );

  return (
    <motion.li
      variants={fadeInUp}
      transition={{ duration: 0.3 }}
      className="grid grid-cols-2 gap-x-3 gap-y-1 px-4 py-3 text-sm transition-colors hover:bg-superficie/40 md:grid-cols-[2rem_minmax(0,1.3fr)_minmax(0,1fr)_9rem_9rem] md:items-start"
    >
      <span className="hidden font-heading text-xs text-muted-foreground tabular-nums md:block">{indice + 1}</span>
      <div className="col-span-2 flex min-w-0 items-baseline gap-2 md:col-span-1">
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{l.cuenta_codigo}</span>
        <span className="min-w-0 truncate text-foreground">{l.cuenta_nombre}</span>
        {l.moneda && <BadgeUsd />}
      </div>
      <div className="col-span-2 min-w-0 space-y-0.5 text-xs text-muted-foreground md:col-span-1">
        {l.descripcion && <div className="text-foreground/80">{l.descripcion}</div>}
        {extra.map((x) => (
          <div key={x}>{x}</div>
        ))}
      </div>
      <div className="md:contents">
        <span className="text-[10px] uppercase tracking-editorial text-muted-foreground md:hidden">
          {l.debe > 0 ? "Debe" : ""}
        </span>
        {importe(l.debe)}
      </div>
      <div className="md:contents">
        <span className="text-[10px] uppercase tracking-editorial text-muted-foreground md:hidden">
          {l.haber > 0 ? "Haber" : ""}
        </span>
        {importe(l.haber)}
      </div>
    </motion.li>
  );
}

// ------------------------------------------------------------
// Acciones
// ------------------------------------------------------------

const botonBase =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:opacity-60";

function Acciones({
  id,
  numero,
  fecha,
  hoy,
  editable,
  borrador,
  revertible,
  total,
}: {
  id: string;
  numero: number | null;
  fecha: string;
  hoy: string;
  editable: boolean;
  borrador: boolean;
  revertible: boolean;
  total: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialogo, setDialogo] = useState<"confirmar" | "eliminar" | "revertir" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [fechaRev, setFechaRev] = useState(hoy < fecha ? fecha : hoy);

  function cerrar(o: boolean) {
    if (!o && !pending) setDialogo(null);
  }

  function confirmar() {
    startTransition(async () => {
      const r = await confirmarAsiento(id);
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo confirmar");
        return;
      }
      setDialogo(null);
      toast.success(r.numero ? `Asiento N° ${r.numero} confirmado` : "Asiento confirmado");
      router.refresh();
    });
  }

  function eliminar() {
    startTransition(async () => {
      const r = await eliminarBorrador(id);
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo eliminar");
        return;
      }
      setDialogo(null);
      toast.success("Borrador eliminado");
      router.push("/contabilidad/asientos");
    });
  }

  function revertir() {
    if (motivo.trim().length < 3) {
      toast.error("Indicá el motivo de la reversión");
      return;
    }
    startTransition(async () => {
      const r = await revertirAsiento({ id, motivo: motivo.trim(), fecha: fechaRev });
      if (!r.ok || !r.id) {
        toast.error(r.error ?? "No se pudo revertir");
        return;
      }
      setDialogo(null);
      toast.success(`Asiento N° ${numero} revertido`);
      router.push(`/contabilidad/asientos/${r.id}`);
    });
  }

  if (!borrador && !revertible) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {borrador && (
        <>
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => setDialogo("eliminar")}
            className={cn(botonBase, "border border-linea bg-white text-rose-700 hover:border-rose-200 hover:bg-rose-50")}
          >
            <Trash2 className="size-4" />
            Eliminar
          </motion.button>
          {editable && (
            <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }}>
              <Link
                href={`/contabilidad/asientos/${id}/editar`}
                className={cn(botonBase, "border border-linea bg-white text-foreground hover:border-bordo-200 hover:bg-superficie")}
              >
                <Pencil className="size-4" />
                Editar
              </Link>
            </motion.div>
          )}
          <motion.button
            type="button"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setDialogo("confirmar")}
            className={cn(botonBase, "bg-bordo-800 text-white shadow-sm hover:bg-bordo-900")}
          >
            <Check className="size-4" />
            Confirmar
          </motion.button>
        </>
      )}
      {revertible && (
        <motion.button
          type="button"
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => setDialogo("revertir")}
          className={cn(botonBase, "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50")}
        >
          <Undo2 className="size-4" />
          Revertir
        </motion.button>
      )}

      {/* Confirmar */}
      <AlertDialog open={dialogo === "confirmar"} onOpenChange={cerrar}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar el asiento?</AlertDialogTitle>
            <AlertDialogDescription>
              Va a recibir número y quedar firme por {formatImporte(total, "UYU")}. Después no se puede editar ni
              borrar: si hay un error, se corrige revirtiéndolo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Volver</AlertDialogCancel>
            <button
              type="button"
              onClick={confirmar}
              disabled={pending}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-bordo-800 px-3 text-sm font-medium text-white transition-colors hover:bg-bordo-900 disabled:opacity-60"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Confirmar
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Eliminar */}
      <AlertDialog open={dialogo === "eliminar"} onOpenChange={cerrar}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el borrador?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra el asiento con todas sus líneas. Queda registrado en la auditoría.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Volver</AlertDialogCancel>
            <button
              type="button"
              onClick={eliminar}
              disabled={pending}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-60"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Eliminar
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revertir */}
      <Dialog open={dialogo === "revertir"} onOpenChange={cerrar}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Revertir el asiento N° {numero}</DialogTitle>
            <DialogDescription>
              Se genera un asiento espejo confirmado (debe y haber invertidos). El original queda intacto y marcado
              como revertido.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="font-heading text-[11px] uppercase tracking-editorial text-muted-foreground">Motivo</span>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                maxLength={500}
                autoFocus
                placeholder="Ej.: importe mal cargado, corresponde a otra cuenta…"
                className="w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm outline-none transition-all focus:border-bordo-700 focus:ring-3 focus:ring-bordo-800/10"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="font-heading text-[11px] uppercase tracking-editorial text-muted-foreground">
                Fecha de la reversión
              </span>
              <input
                type="date"
                value={fechaRev}
                min={fecha}
                onChange={(e) => setFechaRev(e.target.value)}
                className="h-10 w-full rounded-lg border border-linea bg-white px-3 text-sm tabular-nums outline-none transition-all focus:border-bordo-700 focus:ring-3 focus:ring-bordo-800/10"
              />
              <span className="block text-[11px] text-muted-foreground">
                No puede ser anterior al {formatFecha(fecha)}. Si el período del asiento ya cerró, usá una fecha de un
                período abierto.
              </span>
            </label>
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => cerrar(false)}
              disabled={pending}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-linea bg-white px-3 text-sm transition-colors hover:bg-superficie"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={revertir}
              disabled={pending || motivo.trim().length < 3 || !fechaRev}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-3 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
              Revertir
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

