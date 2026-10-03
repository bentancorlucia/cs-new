"use client";

import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CalendarClock,
  CheckCircle2,
  Eye,
  FlaskConical,
  Inbox,
  ListChecks,
  RotateCcw,
  Search,
  Send,
  ServerOff,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { easeSmooth } from "@/lib/motion";
import {
  CATEGORIAS,
  ESTADOS_MENSAJE,
  MEDIOS_COBRO,
  NOMBRE_ESTADO_MENSAJE,
  NOMBRE_MES,
  formatCorta,
  formatFechaHora,
  isoALocalUy,
  localUyAIso,
} from "@/lib/comunicaciones/esquemas";
import { aprobarEnvio, cancelarEnvio, enviarPrueba, reintentarFallidos } from "@/app/(dashboard)/comunicaciones/actions";
import {
  Aviso,
  BadgeCategoria,
  BadgeEstadoEnvio,
  BadgeEstadoMensaje,
  BadgeOrigen,
  BarraProgreso,
  Boton,
  Campo,
  DialogoAccion,
  EncabezadoPagina,
  Filtros,
  NumeroAnimado,
  Panel,
  Vacio,
  claseControl,
  conteoDe,
} from "./ui";
import { VistaPreviaDestinatarios } from "./vista-previa";
import { MensajeDialogo, type MensajeResumen } from "./mensaje-dialogo";
import type { MensajeFila } from "./tipos";

export type EnvioCompleto = {
  id: string;
  nombre: string;
  asunto: string;
  cuerpo: string | null;
  categoria: string;
  estado: string;
  origen: string;
  audiencia: unknown;
  programado_para: string;
  aprobado_at: string | null;
  created_at: string;
  total: number;
  pendientes: number;
  enviando: number;
  enviados: number;
  fallidos: number;
  omitidos: number;
  cancelados: number;
};

const POLLING_MS = 4000;

const CLAVE_CONTEO = {
  pendiente: "pendientes",
  enviando: "enviando",
  enviado: "enviados",
  fallido: "fallidos",
  omitido: "omitidos",
  cancelado: "cancelados",
} as const;

function describirAudiencia(a: unknown, corrida: { clave: string; periodo: string } | null): string | null {
  if (corrida) return `Automatización «${corrida.clave}», período ${corrida.periodo}`;
  const au = a as { tipo?: string; filtro?: Record<string, unknown>; cantidad?: number } | null;
  if (!au) return null;
  if (au.tipo === "lista") return `Lista pegada (${au.cantidad ?? "?"} direcciones)`;
  if (au.tipo === "prueba") return "Prueba a la casilla de quien la pidió";
  const f = (au.filtro ?? au) as Record<string, unknown>;
  const partes: string[] = [];
  partes.push(f.vigentes === false ? "Todo el padrón con correo" : "Socios vigentes");
  if (Array.isArray(f.disciplinas) && f.disciplinas.length) partes.push(`${f.disciplinas.length} disciplina(s)`);
  if (f.con_deuda === true) partes.push("con cuotas vencidas");
  if (f.con_deuda === false) partes.push("al día");
  if (typeof f.medio === "string") partes.push(MEDIOS_COBRO[f.medio] ?? f.medio);
  if (f.cumple_hoy) partes.push("cumplen hoy");
  if (typeof f.cumple_mes === "number") partes.push(`cumplen en ${NOMBRE_MES[f.cumple_mes - 1]?.toLowerCase()}`);
  if (typeof f.alta_desde === "string") partes.push(`altas desde ${f.alta_desde}`);
  return partes.join(" · ");
}

export function EnvioDetalle({
  envio,
  mensajes,
  limite,
  pie,
  plantilla,
  corrida,
  puedeGestionar,
  smtp,
}: {
  envio: EnvioCompleto;
  mensajes: MensajeFila[];
  limite: number;
  pie: string | null;
  plantilla: { id: string; nombre: string } | null;
  corrida: { clave: string; periodo: string } | null;
  puedeGestionar: boolean;
  smtp: boolean;
}) {
  const router = useRouter();
  const c = conteoDe(envio);
  const [ahora, setAhora] = useState(() => Date.now());
  const programado = envio.estado === "aprobado" && new Date(envio.programado_para).getTime() > ahora;
  const enCurso = envio.estado === "aprobado" && c.pendientes + c.enviando > 0;
  const terminado = envio.estado === "aprobado" && !enCurso;

  // Progreso en vivo mientras haya algo en la cola.
  useEffect(() => {
    if (!enCurso) return;
    const t = setInterval(() => {
      setAhora(Date.now());
      router.refresh();
    }, POLLING_MS);
    return () => clearInterval(t);
  }, [enCurso, router]);

  const [tab, setTab] = useState<"mensajes" | "contenido">("mensajes");
  const [filtro, setFiltro] = useState<string>("todos");
  const [texto, setTexto] = useState("");
  const q = useDeferredValue(texto.trim().toLowerCase());
  const [abierto, setAbierto] = useState<MensajeResumen | null>(null);

  const lista = useMemo(
    () =>
      mensajes.filter(
        (m) =>
          (filtro === "todos" || m.estado === filtro) &&
          (!q || `${m.email} ${m.nombre ?? ""}`.toLowerCase().includes(q))
      ),
    [mensajes, filtro, q]
  );
  const visibles = lista.slice(0, 200);

  // Acciones
  const [aprobar, setAprobar] = useState(false);
  const [modoAprobar, setModoAprobar] = useState<"ahora" | "programar">("ahora");
  const [fecha, setFecha] = useState(() => isoALocalUy(new Date(Date.now() + 3600_000).toISOString()).slice(0, 14) + "00");
  const [cancelar, setCancelar] = useState(false);
  const [pendiente, start] = useTransition();

  function reintentar() {
    start(async () => {
      const r = await reintentarFallidos(envio.id);
      if (r.ok) {
        toast.success(`${r.data} mensaje(s) vuelven a la cola`);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function prueba() {
    start(async () => {
      const r = await enviarPrueba(envio.id);
      if (r.ok) {
        const ver = { label: "Ver", onClick: () => router.push(`/comunicaciones/envios/${r.data.id}`) };
        if (r.data.estado === "enviado") toast.success(`Prueba enviada a ${r.data.email}`, { action: ver });
        else if (r.data.error) toast.error(`La prueba no salió: ${r.data.error}`, { action: ver });
        else toast.success(`Prueba en la cola para ${r.data.email}`, { action: ver });
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const audiencia = describirAudiencia(envio.audiencia, corrida);
  const muestra = mensajes.filter((m) => !m.tiene_html).slice(0, 25);
  const hayHtml = mensajes.some((m) => m.tiene_html);

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Comunicaciones · Envío"
        titulo={<span className="break-words normal-case">{envio.nombre}</span>}
        descripcion={
          <span className="flex flex-wrap items-center gap-1.5">
            <BadgeEstadoEnvio estado={envio.estado} programado={programado} />
            <BadgeCategoria categoria={envio.categoria} />
            <BadgeOrigen origen={envio.origen} />
            <span>Creado {formatCorta(envio.created_at)}</span>
          </span>
        }
      >
        <Link
          href="/comunicaciones/envios"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Envíos
        </Link>
      </EncabezadoPagina>

      {envio.estado === "borrador" && envio.origen === "automatizacion" && (
        <Aviso tono="info" icono={Workflow} titulo="Preparado por una automatización asistida">
          Revisá los destinatarios y el contenido. No sale nada hasta que lo apruebes.
        </Aviso>
      )}
      {!smtp && envio.estado === "aprobado" && c.pendientes > 0 && (
        <Aviso tono="alerta" icono={ServerOff} titulo="Está en la cola, pero el servidor de correo no está configurado">
          Los mensajes salen cuando se configuren SMTP_HOST, SMTP_USER y SMTP_PASS en las variables de entorno.
        </Aviso>
      )}

      {/* Acciones */}
      {puedeGestionar && envio.estado !== "cancelado" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...easeSmooth, delay: 0.05 }}
          className="flex flex-wrap gap-2"
        >
          {envio.estado === "borrador" && (
            <Boton onClick={() => setAprobar(true)}>
              <CheckCircle2 className="size-4" />
              Aprobar
            </Boton>
          )}
          {c.fallidos > 0 && (
            <Boton variante="secundario" onClick={reintentar} pendiente={pendiente}>
              <RotateCcw className="size-4" />
              Reintentar fallidos ({c.fallidos})
            </Boton>
          )}
          {envio.cuerpo && (
            <Boton variante="secundario" onClick={prueba} pendiente={pendiente}>
              <FlaskConical className="size-4" />
              Enviar prueba a mi correo
            </Boton>
          )}
          {(envio.estado === "borrador" || c.pendientes > 0) && (
            <Boton variante="peligro" onClick={() => setCancelar(true)}>
              <Ban className="size-4" />
              Cancelar envío
            </Boton>
          )}
        </motion.div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          {/* Progreso */}
          <Panel
            titulo="Progreso"
            icono={Send}
            delay={0.05}
            accion={
              enCurso ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                  </span>
                  En vivo
                </span>
              ) : terminado ? (
                <span className="text-[11px] text-muted-foreground">Terminado</span>
              ) : null
            }
          >
            <div className="space-y-3 p-4">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-3xl tracking-tightest text-bordo-800">
                  <NumeroAnimado valor={c.enviados} />
                </span>
                <span className="text-sm text-muted-foreground">
                  de <NumeroAnimado valor={c.total} /> enviados
                </span>
              </div>
              <BarraProgreso conteo={c} alto="h-2.5" leyenda />
              {programado && (
                <p className="flex items-center gap-1.5 text-xs text-violet-800">
                  <CalendarClock className="size-3.5" />
                  Programado: sale a partir del {formatFechaHora(envio.programado_para)}
                </p>
              )}
            </div>
          </Panel>

          {/* Mensajes / contenido */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...easeSmooth, delay: 0.1 }}>
            <div className="mb-3 inline-flex gap-1 rounded-xl border border-linea bg-white p-1">
              {(
                [
                  { v: "mensajes", t: "Destinatarios", i: ListChecks },
                  { v: "contenido", t: "Contenido", i: Eye },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setTab(o.v)}
                  className={cn(
                    "relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    tab === o.v ? "text-bordo-800" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab === o.v && (
                    <motion.span layoutId="tab-envio" className="absolute inset-0 rounded-lg bg-bordo-50 ring-1 ring-bordo-100" />
                  )}
                  <o.i className="relative size-4" />
                  <span className="relative">{o.t}</span>
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {tab === "mensajes" ? (
                <motion.div
                  key="m"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="space-y-3"
                >
                  <div className="space-y-3 rounded-2xl border border-linea bg-white p-3">
                    <div className="relative">
                      <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={texto}
                        onChange={(e) => setTexto(e.target.value)}
                        placeholder="Buscá por correo o nombre…"
                        className={cn(claseControl, "pl-9")}
                      />
                    </div>
                    <Filtros<string>
                      id="mensajes-envio"
                      valor={filtro}
                      onChange={setFiltro}
                      opciones={[
                        { valor: "todos", etiqueta: "Todos", cantidad: c.total },
                        ...ESTADOS_MENSAJE.filter((e) => c[CLAVE_CONTEO[e]] > 0).map((e) => ({
                          valor: e,
                          etiqueta: NOMBRE_ESTADO_MENSAJE[e],
                          cantidad: c[CLAVE_CONTEO[e]],
                        })),
                      ]}
                    />
                  </div>
                  {mensajes.length >= limite && (
                    <p className="px-1 text-xs text-muted-foreground">
                      Se muestran los primeros {limite.toLocaleString("es-UY")} de {c.total.toLocaleString("es-UY")}. Buscá a alguien
                      puntual en el historial.
                    </p>
                  )}
                  {visibles.length === 0 ? (
                    <Vacio icono={Inbox} titulo="No hay mensajes con ese filtro" />
                  ) : (
                    <ul className="divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-white">
                      <AnimatePresence initial={false}>
                        {visibles.map((m, i) => (
                          <motion.li
                            key={m.id}
                            layout="position"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1, transition: { delay: Math.min(i, 20) * 0.015 } }}
                            exit={{ opacity: 0 }}
                          >
                            <button
                              type="button"
                              onClick={() => setAbierto({ ...m })}
                              className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-2.5 text-left transition-colors hover:bg-superficie/60"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm">{m.email}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {m.nombre ?? "—"}
                                  {m.motivo_omision && <span className="text-slate-600"> · {m.motivo_omision}</span>}
                                  {m.error && <span className="text-rose-700"> · {m.error}</span>}
                                </span>
                              </span>
                              <span className="flex flex-col items-end gap-0.5">
                                <BadgeEstadoMensaje estado={m.estado} />
                                {m.enviado_at && (
                                  <span className="text-[10px] tabular-nums text-muted-foreground">{formatCorta(m.enviado_at)}</span>
                                )}
                              </span>
                            </button>
                          </motion.li>
                        ))}
                      </AnimatePresence>
                    </ul>
                  )}
                  {lista.length > visibles.length && (
                    <p className="px-1 text-xs text-muted-foreground">
                      Mostrando 200 de {lista.length.toLocaleString("es-UY")}: afiná la búsqueda.
                    </p>
                  )}
                </motion.div>
              ) : (
                <motion.div key="c" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  {envio.cuerpo ? (
                    <VistaPreviaDestinatarios
                      asunto={envio.asunto}
                      cuerpo={envio.cuerpo}
                      categoria={envio.categoria}
                      pie={pie}
                      destinatarios={muestra}
                    />
                  ) : hayHtml ? (
                    <Aviso tono="info" icono={Eye}>
                      Este envío tiene el correo ya armado (lo genera la tienda o eventos). Tocá un destinatario para verlo.
                    </Aviso>
                  ) : (
                    <Vacio icono={Eye} titulo="Sin contenido" />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Ficha */}
        <motion.aside
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...easeSmooth, delay: 0.12 }}
          className="h-fit space-y-3 rounded-2xl border border-linea bg-white p-4 text-sm"
        >
          <div>
            <div className="text-[10px] uppercase tracking-editorial text-muted-foreground">Asunto</div>
            <div className="break-words font-medium">{envio.asunto}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-editorial text-muted-foreground">Categoría</div>
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{CATEGORIAS[envio.categoria as keyof typeof CATEGORIAS]?.nombre}</span>
              {" — "}
              {CATEGORIAS[envio.categoria as keyof typeof CATEGORIAS]?.descripcion}
            </div>
          </div>
          {audiencia && (
            <div>
              <div className="text-[10px] uppercase tracking-editorial text-muted-foreground">Audiencia</div>
              <div className="text-xs">{audiencia}</div>
            </div>
          )}
          {plantilla && (
            <div>
              <div className="text-[10px] uppercase tracking-editorial text-muted-foreground">Plantilla</div>
              <div className="text-xs">{plantilla.nombre}</div>
            </div>
          )}
          {envio.aprobado_at && (
            <div>
              <div className="text-[10px] uppercase tracking-editorial text-muted-foreground">Aprobado</div>
              <div className="text-xs">{formatFechaHora(envio.aprobado_at)}</div>
            </div>
          )}
          {c.omitidos > 0 && (
            <p className="rounded-lg bg-superficie px-2.5 py-2 text-xs text-muted-foreground">
              {c.omitidos} omitido(s): bajas, direcciones inválidas o repetidas. No se envían ni se reintentan.
            </p>
          )}
        </motion.aside>
      </div>

      <MensajeDialogo mensaje={abierto} onClose={() => setAbierto(null)} />

      <DialogoAccion
        open={aprobar}
        onOpenChange={setAprobar}
        icono={CheckCircle2}
        titulo="Aprobar envío"
        descripcion={`${c.pendientes.toLocaleString("es-UY")} destinatario(s) en la cola. Una vez aprobado el contenido no se puede cambiar.`}
        textoAccion={modoAprobar === "ahora" ? "Aprobar y enviar" : "Programar"}
        mensajeOk={modoAprobar === "ahora" ? "Aprobado: ya está en la cola" : "Envío programado"}
        ejecutar={() => {
          if (modoAprobar === "programar" && (!fecha || new Date(localUyAIso(fecha)).getTime() < Date.now())) {
            toast.error("Elegí una fecha y hora futura");
            return null;
          }
          return aprobarEnvio({ id: envio.id, programado_para: modoAprobar === "programar" ? localUyAIso(fecha) : null });
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { v: "ahora", t: "Ahora" },
              { v: "programar", t: "Programar" },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setModoAprobar(o.v)}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                modoAprobar === o.v ? "border-bordo-700 bg-bordo-50 text-bordo-800" : "border-linea hover:border-bordo-200"
              )}
            >
              {o.t}
            </button>
          ))}
        </div>
        <AnimatePresence>
          {modoAprobar === "programar" && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <Campo etiqueta="Fecha y hora (Uruguay)">
                <input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} className={claseControl} />
              </Campo>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogoAccion>

      <DialogoAccion
        open={cancelar}
        onOpenChange={setCancelar}
        icono={AlertTriangle}
        destructivo
        titulo="Cancelar envío"
        descripcion={
          envio.estado === "borrador"
            ? "El borrador queda cancelado y no sale ningún mensaje."
            : `Los ${c.pendientes.toLocaleString("es-UY")} mensaje(s) pendientes no van a salir. Lo ya enviado no se puede deshacer.`
        }
        textoAccion="Cancelar envío"
        mensajeOk="Envío cancelado"
        ejecutar={() => cancelarEnvio(envio.id)}
      />
    </div>
  );
}
