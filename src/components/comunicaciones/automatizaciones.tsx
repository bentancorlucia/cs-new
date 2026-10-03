"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowUpRight, Cake, Clock, HandCoins, History, Play, Save, Sparkles, UserPlus, Workflow } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { easeSmooth } from "@/lib/motion";
import { formatCorta } from "@/lib/comunicaciones/esquemas";
import { DIA_DEL_MES_DEFECTO, diaDelMes } from "@/lib/comunicaciones/automatizaciones";
import { correrAhora, guardarAutomatizacion } from "@/app/(dashboard)/comunicaciones/actions";
import { Switch } from "@/components/ui/switch";
import { Aviso, BadgeEstadoEnvio, Boton, Campo, EncabezadoPagina, Panel, Vacio, claseControl, pill } from "./ui";

export type AutomatizacionFila = {
  clave: string;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
  modo: string;
  plantilla_clave: string;
  parametros: unknown;
  updated_at: string;
};

export type CorridaFila = {
  id: number;
  clave: string;
  periodo: string;
  envio_id: string | null;
  cantidad: number;
  created_at: string;
  envio_estado: string | null;
  enviados: number;
  pendientes: number;
};

type PlantillaOpcion = { clave: string; nombre: string; activa: boolean; categoria: string };

const ICONOS: Record<string, typeof Cake> = { bienvenida: UserPlus, cumpleanos: Cake, cuota_vencida: HandCoins };

const CUANDO: Record<string, string> = {
  bienvenida: "Todos los días: a las altas de la última semana que todavía no la recibieron.",
  cumpleanos: "Todos los días: a los socios que cumplen años ese día (una vez por año).",
  cuota_vencida: "Una vez por mes, el día elegido: a quienes no están al día.",
};

export function Automatizaciones({
  automatizaciones,
  plantillas,
  corridas,
  puedeGestionar,
  error,
}: {
  automatizaciones: AutomatizacionFila[];
  plantillas: PlantillaOpcion[];
  corridas: CorridaFila[];
  puedeGestionar: boolean;
  error: string | null;
}) {
  const nombres = Object.fromEntries(automatizaciones.map((a) => [a.clave, a.nombre]));
  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Comunicaciones"
        titulo="Automatizaciones"
        descripcion="Correos que se preparan solos. Cada una corre una sola vez por período: nunca le escribe dos veces a la misma persona por lo mismo."
      />

      <Aviso tono="info" icono={Clock} titulo="Corren todos los días a las 8:00">
        En modo <strong>automático</strong> el envío sale solo. En modo <strong>asistido</strong> queda en borrador en el
        resumen, para que alguien lo revise y lo apruebe (recomendado para lo que toca plata, como las cuotas vencidas).
      </Aviso>

      {error && <Aviso tono="error" icono={AlertTriangle}>{error}</Aviso>}

      <div className="grid gap-4 lg:grid-cols-3">
        {automatizaciones.map((a, i) => (
          <TarjetaAutomatizacion
            key={a.clave}
            a={a}
            plantillas={plantillas}
            ultima={corridas.find((c) => c.clave === a.clave) ?? null}
            puedeGestionar={puedeGestionar}
            indice={i}
          />
        ))}
      </div>

      <Panel titulo="Corridas" icono={History} delay={0.2}>
        {corridas.length === 0 ? (
          <div className="p-3">
            <Vacio icono={Workflow} titulo="Todavía no corrió ninguna" texto="Activá una automatización: la primera corrida es al día siguiente a las 8:00 (o ahora, con «Correr ahora»)." />
          </div>
        ) : (
          <ul className="divide-y divide-linea">
            {corridas.map((c, i) => (
              <motion.li
                key={c.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 20) * 0.02 } }}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{nombres[c.clave] ?? c.clave}</div>
                  <div className="text-xs text-muted-foreground">
                    Período <span className="font-mono">{c.periodo}</span> · {formatCorta(c.created_at)}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {c.cantidad} destinatario{c.cantidad === 1 ? "" : "s"}
                  {c.envio_estado === "aprobado" && ` · ${c.enviados} enviados`}
                </div>
                {c.envio_id ? (
                  <Link
                    href={`/comunicaciones/envios/${c.envio_id}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-linea px-2.5 py-0.5 text-xs transition-colors hover:border-bordo-200 hover:bg-superficie"
                  >
                    {c.envio_estado && <BadgeEstadoEnvio estado={c.envio_estado} />}
                    Ver envío
                    <ArrowUpRight className="size-3" />
                  </Link>
                ) : (
                  <span className="text-xs text-muted-foreground">Sin destinatarios</span>
                )}
              </motion.li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function TarjetaAutomatizacion({
  a,
  plantillas,
  ultima,
  puedeGestionar,
  indice,
}: {
  a: AutomatizacionFila;
  plantillas: PlantillaOpcion[];
  ultima: CorridaFila | null;
  puedeGestionar: boolean;
  indice: number;
}) {
  const router = useRouter();
  const Icono = ICONOS[a.clave] ?? Sparkles;
  const [modo, setModo] = useState(a.modo);
  const [plantilla, setPlantilla] = useState(a.plantilla_clave);
  const [dia, setDia] = useState(String(diaDelMes(a.parametros)));
  const [activa, setActiva] = useState(a.activa);
  const [pendiente, start] = useTransition();
  const [corriendo, startCorrer] = useTransition();
  const mensual = a.clave === "cuota_vencida";
  const diaNum = Number(dia);
  const diaValido = Number.isInteger(diaNum) && diaNum >= 1 && diaNum <= 28;
  const cambios =
    modo !== a.modo || plantilla !== a.plantilla_clave || (mensual && diaValido && diaNum !== diaDelMes(a.parametros));
  const plantillaSel = plantillas.find((p) => p.clave === plantilla);

  function guardar(nuevaActiva = activa) {
    if (mensual && !diaValido) {
      toast.error("El día del mes va de 1 a 28");
      return;
    }
    const previa = activa;
    setActiva(nuevaActiva);
    start(async () => {
      const r = await guardarAutomatizacion({
        clave: a.clave,
        activa: nuevaActiva,
        modo: modo as "auto" | "asistida",
        plantilla_clave: plantilla,
        dia_del_mes: mensual ? diaNum : undefined,
      });
      if (r.ok) {
        toast.success(
          nuevaActiva !== a.activa ? (nuevaActiva ? `${a.nombre}: activada` : `${a.nombre}: desactivada`) : "Cambios guardados"
        );
        router.refresh();
      } else {
        setActiva(previa);
        toast.error(r.error);
      }
    });
  }

  function correr() {
    startCorrer(async () => {
      const r = await correrAhora(a.clave);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.data.envio && !r.data.motivo) {
        toast.success(modo === "asistida" ? "Listo: quedó un borrador para aprobar" : "Listo: el envío está en la cola", {
          action: { label: "Ver", onClick: () => router.push(`/comunicaciones/envios/${r.data.envio}`) },
        });
      } else {
        toast.info(`${r.data.motivo} (${r.data.periodo})`);
      }
      router.refresh();
    });
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...easeSmooth, delay: 0.05 + indice * 0.06 }}
      className={cn(
        "flex flex-col rounded-2xl border bg-white transition-colors",
        activa ? "border-bordo-200 shadow-sm" : "border-linea"
      )}
    >
      <div className="flex items-start gap-3 border-b border-linea p-4">
        <motion.div
          animate={{ scale: activa ? 1 : 0.92, opacity: activa ? 1 : 0.6 }}
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            activa ? "bg-bordo-800 text-white" : "bg-superficie text-muted-foreground"
          )}
        >
          <Icono className="size-5" />
        </motion.div>
        <div className="min-w-0 flex-1">
          <div className="font-heading text-base">{a.nombre}</div>
          <div className="text-xs text-muted-foreground">{CUANDO[a.clave] ?? a.descripcion}</div>
        </div>
        <Switch
          checked={activa}
          disabled={!puedeGestionar || pendiente}
          onCheckedChange={(v) => guardar(v)}
          aria-label={activa ? "Desactivar" : "Activar"}
        />
      </div>

      <fieldset disabled={!puedeGestionar} className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1">
          <span className="px-0.5 text-[10px] uppercase tracking-editorial text-muted-foreground">Modo</span>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-superficie p-1">
            {(
              [
                { v: "auto", t: "Automático" },
                { v: "asistida", t: "Asistido" },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setModo(o.v)}
                className={cn(
                  "relative rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                  modo === o.v ? "text-bordo-800" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {modo === o.v && (
                  <motion.span
                    layoutId={`modo-${a.clave}`}
                    className="absolute inset-0 rounded-lg bg-white shadow-sm"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative">{o.t}</span>
              </button>
            ))}
          </div>
          <p className="px-0.5 text-[11px] text-muted-foreground">
            {modo === "auto" ? "Sale sola, sin intervención." : "Queda en borrador para aprobar."}
          </p>
        </div>

        <Campo etiqueta="Plantilla">
          <select value={plantilla} onChange={(e) => setPlantilla(e.target.value)} className={claseControl}>
            {plantillas.map((p) => (
              <option key={p.clave} value={p.clave} disabled={!p.activa}>
                {p.nombre}
                {!p.activa ? " (desactivada)" : ""}
              </option>
            ))}
          </select>
        </Campo>
        {plantillaSel && !plantillaSel.activa && (
          <p className="text-[11px] text-rose-700">Esta plantilla está desactivada: la automatización no va a poder correr.</p>
        )}

        {mensual && (
          <Campo etiqueta="Día del mes" ayuda={`Entre 1 y 28 (por defecto ${DIA_DEL_MES_DEFECTO})`} error={!diaValido ? "Entre 1 y 28" : null}>
            <input
              type="number"
              min={1}
              max={28}
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              className={cn(claseControl, "max-w-28")}
            />
          </Campo>
        )}

        <div className="mt-auto space-y-2 pt-1">
          <AnimatePresence>
            {cambios && puedeGestionar && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <Boton className="w-full" onClick={() => guardar()} pendiente={pendiente}>
                  <Save className="size-4" />
                  Guardar cambios
                </Boton>
              </motion.div>
            )}
          </AnimatePresence>
          {puedeGestionar && (
            <Boton
              variante="secundario"
              className="w-full"
              onClick={correr}
              pendiente={corriendo}
              disabled={!activa || cambios}
              title={!activa ? "Activala para poder correrla" : cambios ? "Guardá los cambios primero" : undefined}
            >
              <Play className="size-4" />
              Correr ahora
            </Boton>
          )}
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {ultima ? (
                <>
                  Última: <span className="font-mono">{ultima.periodo}</span>
                </>
              ) : (
                "Nunca corrió"
              )}
            </span>
            <span className={cn(pill, activa ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-600")}>
              {activa ? "Activa" : "Apagada"}
            </span>
          </div>
        </div>
      </fieldset>
    </motion.section>
  );
}
