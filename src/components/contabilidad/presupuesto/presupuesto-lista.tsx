"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, CheckCircle2, Eye, History, NotebookText, PencilLine, Plus, Tag, Target, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { BotonAnimado } from "@/components/contabilidad/ejercicios/boton-animado";
import { ConfirmarDialog } from "@/components/contabilidad/ejercicios/confirmar-dialog";
import { ImporteAnimado } from "@/components/contabilidad/reportes/importe-animado";
import { easeSmooth, fadeInUp, springBouncy, staggerContainer } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { EjercicioResumen } from "@/lib/contabilidad/reportes";
import type { PresupuestoResumen } from "@/lib/contabilidad/presupuesto";
import { aprobarPresupuesto, eliminarPresupuesto } from "@/app/(dashboard)/contabilidad/presupuesto/actions";
import { CrearPresupuestoDialog } from "./crear-presupuesto-dialog";
import { EditarPresupuestoDialog } from "./editar-presupuesto-dialog";
import { EstadoBadge } from "./estado-badge";
import { SelectorEjercicio } from "./selector-ejercicio";

const fechaCorta = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

type Confirmacion = { tipo: "aprobar" | "eliminar"; presupuesto: PresupuestoResumen } | null;

export function PresupuestoLista({
  ejercicios,
  ejercicio,
  versiones,
  puedeEscribir,
  hayAnterior,
}: {
  ejercicios: EjercicioResumen[];
  ejercicio: EjercicioResumen;
  versiones: PresupuestoResumen[];
  puedeEscribir: boolean;
  hayAnterior: boolean;
}) {
  const router = useRouter();
  const [crear, setCrear] = useState(false);
  const [confirmar, setConfirmar] = useState<Confirmacion>(null);
  const [editando, setEditando] = useState<PresupuestoResumen | null>(null);
  const anio = Number(ejercicio.fecha_inicio.slice(0, 4));
  const vigente = versiones.find((v) => v.estado === "aprobado") ?? null;
  const borrador = versiones.find((v) => v.estado === "borrador") ?? null;
  const siguienteVersion = (versiones[0]?.version ?? 0) + 1;
  const puedeCrear = puedeEscribir && !borrador;

  return (
    <div className="space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={easeSmooth}
        className="flex flex-col gap-3 rounded-2xl border border-linea bg-white p-3 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-4"
      >
        <SelectorEjercicio ejercicios={ejercicios} ejercicioId={ejercicio.id} />
        <div className="flex flex-wrap gap-2">
          {vigente && (
            <Link
              href={`/contabilidad/presupuesto/ejecucion?ejercicio=${ejercicio.id}`}
              className={cn(buttonVariants({ variant: "outline" }), "rounded-full px-3.5")}
            >
              <BarChart3 className="size-3.5" />
              Ver ejecución
            </Link>
          )}
          {puedeCrear && (
            <BotonAnimado onClick={() => setCrear(true)} className="bg-bordo-800 text-white hover:bg-bordo-900">
              {vigente ? <History className="size-3.5" /> : <Plus className="size-3.5" />}
              {vigente ? "Reformular" : "Nuevo presupuesto"}
            </BotonAnimado>
          )}
        </div>
      </motion.div>

      {versiones.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-linea bg-white">
          <EmptyState
            icon={Target}
            title={`Sin presupuesto para ${ejercicio.nombre}`}
            description={
              puedeEscribir
                ? "Armá el presupuesto económico del año: ingresos y egresos por cuenta, mes y centro de costo. Después lo comparás contra lo real."
                : "Tesorería todavía no cargó el presupuesto de este ejercicio."
            }
            action={puedeEscribir ? { label: "Crear el presupuesto", onClick: () => setCrear(true) } : undefined}
          />
        </div>
      ) : (
        <motion.ul variants={staggerContainer} initial="hidden" animate="visible" className="space-y-3">
          <AnimatePresence initial={false}>
            {versiones.map((v) => (
              <TarjetaVersion
                key={v.id}
                version={v}
                ejercicioId={ejercicio.id}
                puedeEscribir={puedeEscribir}
                puedeReformular={puedeCrear && v.estado === "aprobado"}
                onAprobar={() => setConfirmar({ tipo: "aprobar", presupuesto: v })}
                onEliminar={() => setConfirmar({ tipo: "eliminar", presupuesto: v })}
                onReformular={() => setCrear(true)}
                onEditar={() => setEditando(v)}
              />
            ))}
          </AnimatePresence>
        </motion.ul>
      )}

      {puedeEscribir && (
        <CrearPresupuestoDialog
          open={crear}
          onOpenChange={setCrear}
          ejercicioId={ejercicio.id}
          anio={anio}
          versionVigente={vigente?.version ?? null}
          hayAnterior={hayAnterior}
          siguienteVersion={siguienteVersion}
        />
      )}

      {puedeEscribir && (
        <EditarPresupuestoDialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)} presupuesto={editando} />
      )}

      <ConfirmarDialog
        open={confirmar?.tipo === "aprobar"}
        onOpenChange={(o) => !o && setConfirmar(null)}
        titulo={`Aprobar la versión ${confirmar?.presupuesto.version ?? ""}`}
        textoAccion="Aprobar"
        textoPendiente="Aprobando…"
        mensajeExito="Presupuesto aprobado"
        aviso={
          vigente && confirmar?.presupuesto.id !== vigente.id
            ? `La versión ${vigente.version}, hoy vigente, pasa a «reemplazado» y deja de ser la referencia de la ejecución.`
            : undefined
        }
        accion={async () => {
          const r = await aprobarPresupuesto(confirmar!.presupuesto.id);
          if (r.ok) router.refresh();
          return r;
        }}
      >
        <p>
          Un presupuesto aprobado queda congelado: no se edita ni se borra. Para cambiarlo después hay que reformularlo
          en una versión nueva.
        </p>
      </ConfirmarDialog>

      <ConfirmarDialog
        open={confirmar?.tipo === "eliminar"}
        onOpenChange={(o) => !o && setConfirmar(null)}
        titulo="Eliminar el borrador"
        textoAccion="Eliminar"
        textoPendiente="Eliminando…"
        mensajeExito="Borrador eliminado"
        destructivo
        accion={async () => {
          const r = await eliminarPresupuesto(confirmar!.presupuesto.id);
          if (r.ok) router.refresh();
          return r;
        }}
      >
        <p>
          Se borra «{confirmar?.presupuesto.nombre}» con todos sus importes. Esta acción no se puede deshacer.
        </p>
      </ConfirmarDialog>
    </div>
  );
}

function TarjetaVersion({
  version: v,
  ejercicioId,
  puedeEscribir,
  puedeReformular,
  onAprobar,
  onEliminar,
  onReformular,
  onEditar,
}: {
  version: PresupuestoResumen;
  ejercicioId: string;
  puedeEscribir: boolean;
  puedeReformular: boolean;
  onAprobar: () => void;
  onEliminar: () => void;
  onReformular: () => void;
  onEditar: () => void;
}) {
  const borrador = v.estado === "borrador";
  const superavit = v.resultado >= 0;
  return (
    <motion.li
      layout
      variants={fadeInUp}
      exit={{ opacity: 0, x: -24, transition: { duration: 0.2 } }}
      transition={easeSmooth}
      whileHover={{ y: -2 }}
      className={cn(
        "rounded-2xl border bg-white p-4 transition-shadow hover:shadow-card sm:p-5",
        v.estado === "aprobado" && "border-emerald-200",
        borrador && "border-amber-200",
        v.estado === "reemplazado" && "border-linea bg-superficie/40"
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <motion.div
            whileHover={{ rotate: -4, scale: 1.05 }}
            transition={springBouncy}
            className={cn(
              "flex size-11 shrink-0 flex-col items-center justify-center rounded-xl font-display leading-none",
              v.estado === "aprobado"
                ? "bg-bordo-800 text-white"
                : borrador
                  ? "bg-amber-100 text-amber-900"
                  : "bg-superficie text-muted-foreground"
            )}
          >
            <span className="text-[9px] font-heading uppercase tracking-editorial opacity-80">vers.</span>
            <span className="text-lg">{v.version}</span>
          </motion.div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/contabilidad/presupuesto/${v.id}`}
                className="truncate font-heading text-base text-bordo-950 hover:text-bordo-700"
              >
                {v.nombre}
              </Link>
              <EstadoBadge estado={v.estado} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Creado {v.creadoPor ? `por ${v.creadoPor} ` : ""}el {fechaCorta.format(new Date(v.createdAt))}
              {v.aprobadoAt && (
                <>
                  {" · "}
                  <span className={v.estado === "aprobado" ? "text-emerald-700" : undefined}>
                    Aprobado {v.aprobadoPor ? `por ${v.aprobadoPor} ` : ""}el {fechaCorta.format(new Date(v.aprobadoAt))}
                  </span>
                </>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {v.cuentas === 0 ? "Sin importes cargados" : `${v.cuentas} ${v.cuentas === 1 ? "cuenta" : "cuentas"}`}
            </p>
            <AnimatePresence initial={false}>
              {v.notas && <Notas key={v.notas} texto={v.notas} />}
            </AnimatePresence>
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-2 text-right sm:gap-6 lg:min-w-[26rem]">
          <Total titulo="Ingresos" valor={v.totalIngresos} />
          <Total titulo="Egresos" valor={v.totalEgresos} />
          <Total
            titulo={superavit ? "Superávit" : "Déficit"}
            valor={v.resultado}
            className={superavit ? "text-emerald-700" : "text-rose-700"}
          />
        </dl>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-linea/70 pt-3">
        <Link
          href={`/contabilidad/presupuesto/${v.id}`}
          className={cn(buttonVariants({ variant: borrador && puedeEscribir ? "default" : "outline", size: "sm" }), "rounded-full px-3")}
        >
          {borrador && puedeEscribir ? <PencilLine className="size-3.5" /> : <Eye className="size-3.5" />}
          {borrador && puedeEscribir ? "Editar" : "Ver detalle"}
        </Link>
        {!borrador && (
          <Link
            href={`/contabilidad/presupuesto/ejecucion?ejercicio=${ejercicioId}&presupuesto=${v.id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full px-3")}
          >
            <BarChart3 className="size-3.5" />
            Ejecución
          </Link>
        )}
        {puedeEscribir && borrador && (
          <>
            <BotonAnimado
              size="sm"
              variant="outline"
              onClick={onAprobar}
              disabled={v.cuentas === 0}
              title={v.cuentas === 0 ? "El presupuesto está vacío" : undefined}
              className="border-emerald-200 text-emerald-800 hover:bg-emerald-50"
            >
              <CheckCircle2 className="size-3.5" />
              Aprobar
            </BotonAnimado>
            <BotonAnimado size="sm" variant="outline" onClick={onEditar}>
              <Tag className="size-3.5" />
              Nombre y notas
            </BotonAnimado>
            <BotonAnimado
              size="sm"
              variant="ghost"
              onClick={onEliminar}
              className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
            >
              <Trash2 className="size-3.5" />
              Eliminar
            </BotonAnimado>
          </>
        )}
        {puedeReformular && (
          <BotonAnimado size="sm" variant="outline" onClick={onReformular}>
            <History className="size-3.5" />
            Reformular
          </BotonAnimado>
        )}
      </div>
    </motion.li>
  );
}

function Total({ titulo, valor, className }: { titulo: string; valor: number; className?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-heading uppercase tracking-editorial text-muted-foreground">{titulo}</dt>
      <dd className={cn("truncate font-heading text-sm sm:text-base", className)}>
        <ImporteAnimado valor={Math.abs(valor)} />
      </dd>
    </div>
  );
}

/** Notas de la versión (supuestos, criterios). */
export function Notas({ texto, className }: { texto: string; className?: string }) {
  return (
    <motion.p
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={easeSmooth}
      className={cn(
        "mt-2 flex max-w-xl gap-1.5 overflow-hidden whitespace-pre-line rounded-lg bg-superficie/70 px-2.5 py-1.5 text-xs text-foreground/80",
        className
      )}
    >
      <NotebookText className="mt-0.5 size-3.5 shrink-0 text-bordo-700" />
      <span className="min-w-0 break-words">{texto}</span>
    </motion.p>
  );
}
