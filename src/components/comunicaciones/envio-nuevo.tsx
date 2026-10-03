"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  ClipboardList,
  Eye,
  FileText,
  Loader2,
  Megaphone,
  PenLine,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { easeSmooth } from "@/lib/motion";
import {
  CATEGORIAS,
  MEDIOS_COBRO,
  NOMBRE_MES,
  isoALocalUy,
  localUyAIso,
  parsearListaEmails,
  type Categoria,
  type FiltroAudiencia,
} from "@/lib/comunicaciones/esquemas";
import { aprobarEnvio, crearEnvio, previsualizarAudiencia, type PrevisualizacionAudiencia } from "@/app/(dashboard)/comunicaciones/actions";
import { Aviso, Boton, Campo, EncabezadoPagina, NumeroAnimado, Panel, claseControl } from "./ui";
import { EditorCuerpo } from "./editor-cuerpo";
import type { Formato } from "@/lib/comunicaciones/render";
import type { Encabezado } from "@/lib/comunicaciones/molde";
import { VistaPreviaDestinatarios } from "./vista-previa";
import type { PlantillaFila } from "./tipos";

const PASOS = [
  { titulo: "Audiencia", icono: Users },
  { titulo: "Contenido", icono: PenLine },
  { titulo: "Vista previa", icono: Eye },
  { titulo: "Confirmar", icono: ShieldCheck },
];

type Deuda = "todos" | "con" | "sin";
type Cumple = "no" | "mes" | "hoy";
type Modo = "borrador" | "ahora" | "programar";

export function EnvioNuevo({
  plantillas,
  disciplinas,
  pie,
  moldeHtml,
  plantillaInicial,
}: {
  plantillas: PlantillaFila[];
  disciplinas: { id: number; nombre: string }[];
  pie: string | null;
  moldeHtml?: string | null;
  plantillaInicial: string | null;
}) {
  const router = useRouter();
  const [paso, setPaso] = useState(0);
  const [dir, setDir] = useState(1);

  // Audiencia
  const [tipo, setTipo] = useState<"socios" | "lista">("socios");
  const [vigentes, setVigentes] = useState(true);
  const [discSel, setDiscSel] = useState<number[]>([]);
  const [deuda, setDeuda] = useState<Deuda>("todos");
  const [medio, setMedio] = useState("");
  const [cumple, setCumple] = useState<Cumple>("no");
  const [cumpleMes, setCumpleMes] = useState(new Date().getMonth() + 1);
  const [altaDesde, setAltaDesde] = useState("");
  const [lista, setLista] = useState("");
  const [res, setRes] = useState<{ clave: string; prev: PrevisualizacionAudiencia | null; error: string | null } | null>(null);

  // Contenido
  const inicial = plantillas.find((p) => p.id === plantillaInicial) ?? null;
  const [plantillaId, setPlantillaId] = useState<string | null>(inicial?.id ?? null);
  const [categoria, setCategoria] = useState<Categoria>((inicial?.categoria as Categoria) ?? "difusion");
  const [asunto, setAsunto] = useState(inicial?.asunto ?? "");
  const [cuerpo, setCuerpo] = useState(inicial?.cuerpo ?? "");
  const [formato, setFormato] = useState<Formato>(inicial?.formato === "html" ? "html" : "texto");
  const [usaMolde, setUsaMolde] = useState(inicial?.usa_molde ?? true);
  const [encabezado, setEncabezado] = useState<Encabezado>((inicial?.encabezado ?? {}) as Encabezado);
  const [nombre, setNombre] = useState("");
  const [intento, setIntento] = useState(false);

  // Confirmar
  const [modo, setModo] = useState<Modo>("borrador");
  const [fecha, setFecha] = useState(() => isoALocalUy(new Date(Date.now() + 3600_000).toISOString()).slice(0, 14) + "00");
  const [creando, startCrear] = useTransition();

  const filtro = useMemo<FiltroAudiencia>(
    () => ({
      vigentes,
      disciplinas: discSel.length ? discSel : undefined,
      con_deuda: deuda === "con" ? true : deuda === "sin" ? false : undefined,
      medio: medio || undefined,
      cumple_mes: cumple === "mes" ? cumpleMes : undefined,
      cumple_hoy: cumple === "hoy" ? true : undefined,
      alta_desde: altaDesde || undefined,
    }),
    [vigentes, discSel, deuda, medio, cumple, cumpleMes, altaDesde]
  );
  const audiencia = useMemo(
    () => (tipo === "socios" ? { tipo: "socios" as const, filtro } : { tipo: "lista" as const, texto: lista }),
    [tipo, filtro, lista]
  );
  const listaLocal = useMemo(() => (tipo === "lista" ? parsearListaEmails(lista) : null), [tipo, lista]);

  // Cantidad de destinatarios en vivo (con espera para no consultar en cada tecla).
  const claveAud = useMemo(() => JSON.stringify(audiencia), [audiencia]);
  const listaVacia = tipo === "lista" && !lista.trim();
  useEffect(() => {
    if (listaVacia) return;
    let vivo = true;
    const t = setTimeout(async () => {
      const r = await previsualizarAudiencia(JSON.parse(claveAud));
      if (!vivo) return;
      setRes(r.ok ? { clave: claveAud, prev: r.data, error: null } : { clave: claveAud, prev: null, error: r.error });
    }, tipo === "lista" ? 700 : 350);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [claveAud, listaVacia, tipo]);
  const contando = !listaVacia && res?.clave !== claveAud;
  const prev = listaVacia ? null : (res?.prev ?? null);
  const errorAud = listaVacia || contando ? null : (res?.error ?? null);

  const bajasQueAplican = prev ? prev.bajaTotal + (categoria === "difusion" ? prev.bajaDifusion : 0) : 0;
  const efectivos = prev ? Math.max(prev.total - bajasQueAplican, 0) : 0;

  function elegirPlantilla(id: string) {
    if (!id) {
      setPlantillaId(null);
      return;
    }
    const p = plantillas.find((x) => x.id === id);
    if (!p) return;
    const pisar = !asunto.trim() && !cuerpo.trim();
    if (!pisar && !confirm("Se reemplazan el asunto y el mensaje por los de la plantilla. ¿Seguimos?")) return;
    setPlantillaId(p.id);
    setAsunto(p.asunto);
    setCuerpo(p.cuerpo);
    setCategoria(p.categoria as Categoria);
    setFormato(p.formato === "html" ? "html" : "texto");
    setUsaMolde(p.usa_molde);
    setEncabezado((p.encabezado ?? {}) as Encabezado);
  }

  const errorAsunto = intento && !asunto.trim() ? "Falta el asunto" : null;
  const errorCuerpo = intento && !cuerpo.trim() ? "Falta el texto del mensaje" : null;

  function puedeAvanzar(p: number) {
    if (p === 0) return !!prev && prev.total > 0 && !contando && !errorAud;
    if (p === 1) return !!asunto.trim() && !!cuerpo.trim();
    return true;
  }

  function ir(p: number) {
    if (p > paso) {
      for (let k = paso; k < p; k++) {
        if (!puedeAvanzar(k)) {
          if (k === 1) setIntento(true);
          if (k === 0) toast.error(contando ? "Esperá a que termine de contar los destinatarios" : "La audiencia no tiene destinatarios");
          setDir(1);
          setPaso(k);
          return;
        }
      }
    }
    setDir(p > paso ? 1 : -1);
    setPaso(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function crear() {
    if (modo === "programar" && (!fecha || new Date(localUyAIso(fecha)).getTime() < Date.now())) {
      toast.error("Elegí una fecha y hora futura");
      return;
    }
    startCrear(async () => {
      const r = await crearEnvio({
        audiencia,
        contenido: { nombre: nombre.trim() || undefined, plantilla_id: plantillaId, categoria, asunto, cuerpo, formato, usa_molde: usaMolde, encabezado },
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (modo !== "borrador") {
        const a = await aprobarEnvio({ id: r.data, programado_para: modo === "programar" ? localUyAIso(fecha) : null });
        if (!a.ok) {
          toast.error(`El envío quedó en borrador: ${a.error}`);
          router.push(`/comunicaciones/envios/${r.data}`);
          return;
        }
        toast.success(modo === "ahora" ? "Envío aprobado: ya está en la cola" : "Envío programado");
      } else {
        toast.success("Envío creado en borrador");
      }
      router.push(`/comunicaciones/envios/${r.data}`);
    });
  }

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Comunicaciones · Envíos"
        titulo="Nuevo envío"
        descripcion="Elegí a quién, escribí el mensaje, revisalo destinatario por destinatario y aprobalo."
      >
        <Link
          href="/comunicaciones/envios"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver a envíos
        </Link>
      </EncabezadoPagina>

      {/* Pasos */}
      <motion.ol
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-4 gap-1 rounded-2xl border border-linea bg-white p-1"
      >
        {PASOS.map((p, k) => {
          const Icono = k < paso ? Check : p.icono;
          const on = k === paso;
          return (
            <li key={p.titulo}>
              <button
                type="button"
                onClick={() => ir(k)}
                className={cn(
                  "relative flex w-full flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[11px] font-medium transition-colors sm:flex-row sm:justify-center sm:gap-2 sm:text-sm",
                  on ? "text-white" : k < paso ? "text-bordo-800 hover:bg-superficie" : "text-muted-foreground hover:bg-superficie"
                )}
              >
                {on && (
                  <motion.span
                    layoutId="paso-envio"
                    className="absolute inset-0 rounded-xl bg-bordo-800"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <Icono className="relative size-4" />
                <span className="relative truncate">{p.titulo}</span>
              </button>
            </li>
          );
        })}
      </motion.ol>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div
              key={paso}
              custom={dir}
              initial={{ opacity: 0, x: dir * 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -28 }}
              transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="space-y-4"
            >
              {paso === 0 && (
                <Panel titulo="¿A quién le escribimos?" icono={Users}>
                  <div className="space-y-4 p-4">
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          { v: "socios", t: "Socios del padrón", d: "Con filtros por disciplina, deuda, cumpleaños…", i: Users },
                          { v: "lista", t: "Lista de correos", d: "Pegá direcciones (una por línea o separadas por coma)", i: ClipboardList },
                        ] as const
                      ).map((o) => (
                        <motion.button
                          key={o.v}
                          type="button"
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setTipo(o.v)}
                          className={cn(
                            "rounded-xl border p-3 text-left transition-colors",
                            tipo === o.v ? "border-bordo-700 bg-bordo-50/60 ring-3 ring-bordo-800/10" : "border-linea hover:border-bordo-200"
                          )}
                        >
                          <o.i className={cn("mb-1.5 size-5", tipo === o.v ? "text-bordo-800" : "text-muted-foreground")} />
                          <div className="text-sm font-medium">{o.t}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">{o.d}</div>
                        </motion.button>
                      ))}
                    </div>

                    <AnimatePresence mode="wait" initial={false}>
                      {tipo === "socios" ? (
                        <motion.div
                          key="socios"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          className="space-y-4"
                        >
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={vigentes}
                              onChange={(e) => setVigentes(e.target.checked)}
                              className="size-4 accent-bordo-800"
                            />
                            Solo socios vigentes
                            <span className="text-xs text-muted-foreground">(sin tildar: todo el padrón con correo)</span>
                          </label>

                          {disciplinas.length > 0 && (
                            <div className="space-y-1.5">
                              <span className="px-0.5 text-[10px] uppercase tracking-editorial text-muted-foreground">
                                Disciplinas {discSel.length === 0 && "· todas"}
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {disciplinas.map((d) => {
                                  const on = discSel.includes(d.id);
                                  return (
                                    <motion.button
                                      key={d.id}
                                      type="button"
                                      whileTap={{ scale: 0.94 }}
                                      onClick={() => setDiscSel((s) => (on ? s.filter((x) => x !== d.id) : [...s, d.id]))}
                                      className={cn(
                                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                                        on ? "border-bordo-700 bg-bordo-800 text-white" : "border-linea bg-white text-foreground/80 hover:border-bordo-200"
                                      )}
                                    >
                                      {d.nombre}
                                    </motion.button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <div className="grid gap-3 sm:grid-cols-2">
                            <Campo etiqueta="Cuotas">
                              <select value={deuda} onChange={(e) => setDeuda(e.target.value as Deuda)} className={claseControl}>
                                <option value="todos">Todos</option>
                                <option value="con">Con cuotas vencidas (no al día)</option>
                                <option value="sin">Al día</option>
                              </select>
                            </Campo>
                            <Campo etiqueta="Medio de cobro">
                              <select value={medio} onChange={(e) => setMedio(e.target.value)} className={claseControl}>
                                <option value="">Cualquiera</option>
                                {Object.entries(MEDIOS_COBRO).map(([k, v]) => (
                                  <option key={k} value={k}>
                                    {v}
                                  </option>
                                ))}
                              </select>
                            </Campo>
                            <Campo etiqueta="Cumpleaños">
                              <div className="flex gap-2">
                                <select value={cumple} onChange={(e) => setCumple(e.target.value as Cumple)} className={claseControl}>
                                  <option value="no">Sin filtro</option>
                                  <option value="hoy">Cumplen hoy</option>
                                  <option value="mes">Cumplen en el mes…</option>
                                </select>
                                {cumple === "mes" && (
                                  <select
                                    value={cumpleMes}
                                    onChange={(e) => setCumpleMes(Number(e.target.value))}
                                    className={claseControl}
                                  >
                                    {NOMBRE_MES.map((m, k) => (
                                      <option key={m} value={k + 1}>
                                        {m}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            </Campo>
                            <Campo etiqueta="Altas desde" ayuda="Socios que se dieron de alta desde ese día">
                              <input type="date" value={altaDesde} onChange={(e) => setAltaDesde(e.target.value)} className={claseControl} />
                            </Campo>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="lista"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          className="space-y-2"
                        >
                          <Campo
                            etiqueta="Direcciones"
                            ayuda='Una por línea o separadas por coma. Acepta "Nombre <correo>". Si la dirección es de alguien del padrón, se completan sus datos.'
                          >
                            <textarea
                              value={lista}
                              onChange={(e) => setLista(e.target.value)}
                              rows={8}
                              placeholder={"maria@ejemplo.com\nJuan Pérez <juan@ejemplo.com>"}
                              className="block w-full resize-y rounded-lg border border-linea bg-white px-3 py-2 font-mono text-[13px] outline-none transition-all hover:border-bordo-200 focus:border-bordo-700 focus:ring-3 focus:ring-bordo-800/10"
                            />
                          </Campo>
                          {listaLocal && (listaLocal.invalidos.length > 0 || listaLocal.repetidos > 0) && (
                            <div className="rounded-xl border border-dorado-300 bg-dorado-100/50 px-3 py-2 text-xs text-dorado-900">
                              {listaLocal.invalidos.length > 0 && (
                                <div>
                                  {listaLocal.invalidos.length} no {listaLocal.invalidos.length === 1 ? "parece" : "parecen"} una dirección y se
                                  ignora{listaLocal.invalidos.length === 1 ? "" : "n"}:{" "}
                                  <span className="font-mono">{listaLocal.invalidos.slice(0, 5).join(" · ")}</span>
                                  {listaLocal.invalidos.length > 5 && "…"}
                                </div>
                              )}
                              {listaLocal.repetidos > 0 && <div>{listaLocal.repetidos} repetida(s): van una sola vez.</div>}
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {errorAud && <Aviso tono="error" icono={AlertTriangle}>{errorAud}</Aviso>}
                  </div>
                </Panel>
              )}

              {paso === 1 && (
                <Panel titulo="Mensaje" icono={PenLine}>
                  <div className="space-y-4 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Campo etiqueta="Partir de una plantilla">
                        <select value={plantillaId ?? ""} onChange={(e) => elegirPlantilla(e.target.value)} className={claseControl}>
                          <option value="">Mensaje libre</option>
                          {plantillas.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre}
                            </option>
                          ))}
                        </select>
                      </Campo>
                      <Campo etiqueta="Nombre interno del envío" ayuda="Para encontrarlo después. Si lo dejás vacío, se usa el asunto.">
                        <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={200} className={claseControl} placeholder="Ej: Fiesta de fin de año" />
                      </Campo>
                    </div>

                    <div className="space-y-1.5">
                      <span className="px-0.5 text-[10px] uppercase tracking-editorial text-muted-foreground">Categoría</span>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {(Object.keys(CATEGORIAS) as Categoria[]).map((c) => (
                          <motion.button
                            key={c}
                            type="button"
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setCategoria(c)}
                            className={cn(
                              "flex gap-2.5 rounded-xl border p-3 text-left transition-colors",
                              categoria === c ? "border-bordo-700 bg-bordo-50/60 ring-3 ring-bordo-800/10" : "border-linea hover:border-bordo-200"
                            )}
                          >
                            {c === "difusion" ? (
                              <Megaphone className="mt-0.5 size-4 shrink-0 text-bordo-700" />
                            ) : (
                              <FileText className="mt-0.5 size-4 shrink-0 text-bordo-700" />
                            )}
                            <span>
                              <span className="block text-sm font-medium">{CATEGORIAS[c].nombre}</span>
                              <span className="block text-xs text-muted-foreground">{CATEGORIAS[c].descripcion}</span>
                            </span>
                          </motion.button>
                        ))}
                      </div>
                    </div>

                    <EditorCuerpo
                      asunto={asunto}
                      cuerpo={cuerpo}
                      onAsunto={setAsunto}
                      onCuerpo={setCuerpo}
                      errorAsunto={errorAsunto}
                      errorCuerpo={errorCuerpo}
                      formato={formato}
                      onFormato={setFormato}
                      usaMolde={usaMolde}
                      onUsaMolde={setUsaMolde}
                      encabezado={encabezado}
                      onEncabezado={setEncabezado}
                    />
                  </div>
                </Panel>
              )}

              {paso === 2 && (
                <Panel titulo="Así le llega a cada uno" icono={Eye}>
                  <div className="space-y-3 p-4">
                    <p className="text-xs text-muted-foreground">
                      Mirá algunos destinatarios con sus datos reales. Es exactamente el correo que arma el servidor
                      {categoria === "difusion" ? ", con el enlace de baja al pie" : ""}.
                    </p>
                    <VistaPreviaDestinatarios
                      asunto={asunto}
                      cuerpo={cuerpo}
                      categoria={categoria}
                      pie={pie}
            moldeHtml={moldeHtml}
                      formato={formato}
                      usaMolde={usaMolde}
                      encabezado={encabezado}
                      destinatarios={prev?.muestra ?? []}
                    />
                  </div>
                </Panel>
              )}

              {paso === 3 && (
                <Panel titulo="Confirmar" icono={ShieldCheck}>
                  <div className="space-y-4 p-4">
                    <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
                      <dt className="text-muted-foreground">Envío</dt>
                      <dd className="font-medium break-words">{nombre.trim() || asunto}</dd>
                      <dt className="text-muted-foreground">Asunto</dt>
                      <dd className="break-words">{asunto}</dd>
                      <dt className="text-muted-foreground">Categoría</dt>
                      <dd>{CATEGORIAS[categoria].nombre}</dd>
                      <dt className="text-muted-foreground">Destinatarios</dt>
                      <dd>
                        <span className="font-medium">{efectivos.toLocaleString("es-UY")}</span>
                        {bajasQueAplican > 0 && (
                          <span className="text-muted-foreground"> · {bajasQueAplican} con baja no lo reciben</span>
                        )}
                      </dd>
                    </dl>

                    <div className="space-y-2">
                      {(
                        [
                          { v: "borrador", t: "Dejarlo en borrador", d: "Se prepara la cola; alguien lo aprueba después.", i: FileText },
                          { v: "ahora", t: "Aprobar y enviar ahora", d: "Sale por la cola respetando el tope por hora.", i: Send },
                          { v: "programar", t: "Programar", d: "Aprobado, sale a partir de la fecha y hora elegidas.", i: CalendarClock },
                        ] as const
                      ).map((o) => (
                        <label
                          key={o.v}
                          className={cn(
                            "flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors",
                            modo === o.v ? "border-bordo-700 bg-bordo-50/60" : "border-linea hover:border-bordo-200"
                          )}
                        >
                          <input
                            type="radio"
                            name="modo"
                            value={o.v}
                            checked={modo === o.v}
                            onChange={() => setModo(o.v)}
                            className="mt-1 size-4 accent-bordo-800"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 text-sm font-medium">
                              <o.i className="size-4 text-bordo-700" />
                              {o.t}
                            </span>
                            <span className="block text-xs text-muted-foreground">{o.d}</span>
                            {o.v === "programar" && modo === "programar" && (
                              <motion.span initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-2 block">
                                <input
                                  type="datetime-local"
                                  value={fecha}
                                  onChange={(e) => setFecha(e.target.value)}
                                  className={cn(claseControl, "max-w-64")}
                                />
                                <span className="mt-1 block text-[11px] text-muted-foreground">Hora de Uruguay</span>
                              </motion.span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </Panel>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-4 flex items-center justify-between gap-2">
            <Boton variante="secundario" onClick={() => ir(paso - 1)} disabled={paso === 0 || creando}>
              <ArrowLeft className="size-4" />
              Atrás
            </Boton>
            {paso < 3 ? (
              <Boton onClick={() => ir(paso + 1)} disabled={paso === 0 && (contando || !prev || prev.total === 0)}>
                Siguiente
                <ArrowRight className="size-4" />
              </Boton>
            ) : (
              <Boton onClick={crear} pendiente={creando}>
                {modo === "borrador" ? "Crear borrador" : modo === "ahora" ? "Crear y aprobar" : "Crear y programar"}
              </Boton>
            )}
          </div>
        </div>

        {/* Resumen lateral con el contador en vivo */}
        <motion.aside
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...easeSmooth, delay: 0.1 }}
          className="h-fit space-y-3 rounded-2xl border border-linea bg-white p-4 lg:sticky lg:top-20"
        >
          <div className="flex items-center justify-between">
            <span className="font-heading text-[11px] uppercase tracking-editorial text-muted-foreground">Destinatarios</span>
            {contando && <Loader2 className="size-3.5 animate-spin text-bordo-700" />}
          </div>
          <div className={cn("font-display text-4xl tracking-tightest text-bordo-800 transition-opacity", contando && "opacity-50")}>
            <NumeroAnimado valor={prev?.total ?? 0} />
          </div>
          {prev && (
            <div className="space-y-1.5 text-xs">
              {tipo === "lista" && (
                <div className="text-muted-foreground">
                  {prev.socios} del padrón · {prev.total - prev.socios} sin ficha
                </div>
              )}
              <div className={cn("flex justify-between", prev.bajaDifusion > 0 ? "text-dorado-800" : "text-muted-foreground")}>
                <span>Dados de baja de difusión</span>
                <NumeroAnimado valor={prev.bajaDifusion} className="font-medium" />
              </div>
              <div className={cn("flex justify-between", prev.bajaTotal > 0 ? "text-rose-700" : "text-muted-foreground")}>
                <span>Baja total (no reciben nada)</span>
                <NumeroAnimado valor={prev.bajaTotal} className="font-medium" />
              </div>
              <div className="border-t border-linea pt-1.5 text-muted-foreground">
                {categoria === "difusion"
                  ? "Como es difusión, las bajas se omiten."
                  : "Institucional: solo se omiten las bajas totales."}
                <div className="mt-1 flex justify-between text-foreground">
                  <span>Lo reciben</span>
                  <NumeroAnimado valor={efectivos} className="font-semibold" />
                </div>
              </div>
            </div>
          )}
          {!prev && !contando && tipo === "lista" && (
            <p className="text-xs text-muted-foreground">Pegá direcciones para contar.</p>
          )}
        </motion.aside>
      </div>
    </div>
  );
}
