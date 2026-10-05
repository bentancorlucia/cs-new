"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  CheckCheck,
  ClipboardCheck,
  Copy,
  CreditCard,
  Eye,
  FileSpreadsheet,
  Loader2,
  Search,
  ShieldAlert,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth } from "@/lib/motion";
import { NOMBRE_MEDIO } from "@/lib/socios/cuotas";
import {
  NOMBRE_ESTADO_DEBITO,
  NOMBRE_TIPO_CAMBIO,
  cuotaDelCambio,
  vencimientoCorto,
  type CambioDebito,
  type DatosCambio,
  type FiltroEstadoCambios,
} from "@/lib/socios/cambios-debito";
import { marcarCambios, verTarjeta } from "@/app/(dashboard)/cuotas/actions";
import { exportarExcel } from "@/components/contabilidad/reportes/acciones-reporte";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Aviso,
  Boton,
  Campo,
  DialogoAccion,
  EncabezadoPagina,
  Explicacion,
  Filtros,
  Kpi,
  NumeroAnimado,
  Panel,
  Vacio,
  claseControl,
} from "./ui";

const pill =
  "inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap";

// ------------------------------------------------------------
// Formato
// ------------------------------------------------------------

const formatoHora = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "04/10/2026 22:45" en hora de Uruguay (armado a mano: igual en el servidor y en el navegador). */
export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = Object.fromEntries(formatoHora.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

const TONO_TIPO: Record<string, string> = {
  alta: "border-emerald-200 bg-emerald-50 text-emerald-800",
  reingreso: "border-emerald-200 bg-emerald-50 text-emerald-800",
  inscripcion: "border-emerald-200 bg-emerald-50 text-emerald-800",
  baja_club: "border-rose-200 bg-rose-50 text-rose-700",
  fin_inscripcion: "border-rose-200 bg-rose-50 text-rose-700",
  baja_anulada: "border-dorado-300 bg-dorado-100 text-dorado-800",
  medio_cobro: "border-sky-200 bg-sky-50 text-sky-800",
  tarjeta: "border-sky-200 bg-sky-50 text-sky-800",
  plan_nuevo: "border-violet-200 bg-violet-50 text-violet-800",
  precio: "border-violet-200 bg-violet-50 text-violet-800",
};

export function BadgeTipoCambio({ tipo }: { tipo: string }) {
  return (
    <span className={cn(pill, TONO_TIPO[tipo] ?? "border-linea bg-superficie text-muted-foreground")}>
      {NOMBRE_TIPO_CAMBIO[tipo] ?? tipo}
    </span>
  );
}

const TONO_ESTADO: Record<string, string> = {
  pendiente: "border-amber-200 bg-amber-50 text-amber-800",
  aplicado: "border-emerald-200 bg-emerald-50 text-emerald-700",
  descartado: "border-slate-200 bg-slate-100 text-slate-600",
  no_aplica: "border-linea bg-superficie text-muted-foreground",
};

export function BadgeEstadoCambio({ estado }: { estado: string }) {
  return (
    <span className={cn(pill, TONO_ESTADO[estado] ?? TONO_ESTADO.no_aplica)}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {NOMBRE_ESTADO_DEBITO[estado] ?? estado}
    </span>
  );
}

export function BadgeOrigen({ origen }: { origen: string }) {
  const rep = origen === "representante";
  return (
    <span className={cn(pill, rep ? "border-violet-200 bg-violet-50 text-violet-800" : "border-bordo-100 bg-bordo-50 text-bordo-800")}>
      {rep ? <Users className="size-3" /> : <UserRound className="size-3" />}
      {rep ? "Representante" : "Club"}
    </span>
  );
}

const cuota = (v: unknown) => (v == null || v === "" ? null : formatImporte(Number(v), "UYU"));
const medio = (v: unknown) => (typeof v === "string" ? NOMBRE_MEDIO[v] ?? v : null);

/** "****1234 · vence 08/27 · ITAU" */
function textoTarjeta(d: DatosCambio | null): string | null {
  if (!d?.tarjeta) return null;
  return [`****${d.tarjeta}`, d.vencimiento ? `vence ${vencimientoCorto(d.vencimiento)}` : null, d.emisor ? String(d.emisor).toUpperCase() : null]
    .filter(Boolean)
    .join(" · ");
}

/** Lo que cambió (antes → después), solo cuando aporta. */
function diferencias(c: CambioDebito): { etiqueta: string; antes: string; despues: string }[] {
  const a = c.antes;
  const d = c.despues;
  if (!a || !d) return [];
  const out: { etiqueta: string; antes: string; despues: string }[] = [];
  const par = (etiqueta: string, x: string | null, y: string | null) => {
    if ((x ?? "") !== (y ?? "") && (x || y)) out.push({ etiqueta, antes: x ?? "—", despues: y ?? "—" });
  };
  par("Medio", medio(a.medio), medio(d.medio));
  par("Tarjeta", textoTarjeta(a), textoTarjeta(d));
  par("Cuota", cuota(a.cuota_mensual ?? a.importe), cuota(d.cuota_mensual ?? d.importe));
  par("Plan", typeof a.plan === "string" ? a.plan : null, typeof d.plan === "string" ? d.plan : null);
  return out;
}

// ------------------------------------------------------------
// Lista (también en el detalle de cada disciplina)
// ------------------------------------------------------------

export function ListaCambios({
  cambios,
  conDisciplina = true,
  seleccion,
  onAlternar,
  onVerNumero,
}: {
  cambios: CambioDebito[];
  conDisciplina?: boolean;
  /** Si viene, los pendientes se pueden elegir. */
  seleccion?: Set<number>;
  onAlternar?: (id: number) => void;
  /** Si viene, los que tienen tarjeta completa muestran "Ver número". */
  onVerNumero?: (c: CambioDebito) => void;
}) {
  return (
    <ul className="divide-y divide-linea">
      <AnimatePresence initial={false}>
        {cambios.map((c, i) => {
          const elegible = !!onAlternar && c.estado_debito === "pendiente";
          const on = !!seleccion?.has(c.id);
          const cuotaMes = cuotaDelCambio(c);
          const tarjeta = textoTarjeta(c.despues);
          const difs = diferencias(c);
          return (
            <motion.li
              key={c.id}
              layout="position"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -12, height: 0 }}
              transition={{ ...easeSmooth, delay: Math.min(i, 14) * 0.02 }}
              className={cn("transition-colors", on ? "bg-bordo-50/40" : "hover:bg-superficie/40")}
            >
              <div className="flex gap-3 px-4 py-3">
                {elegible && (
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => onAlternar?.(c.id)}
                    className="mt-1 size-4 shrink-0 accent-bordo-800"
                    aria-label={`Elegir el cambio de ${c.persona ?? c.descripcion}`}
                  />
                )}
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)] lg:grid-cols-[8.5rem_minmax(0,1fr)_minmax(0,14rem)_11rem]">
                  {/* Cuándo y dónde */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground sm:col-span-2 lg:col-span-1 lg:block">
                    <div className="tabular-nums text-foreground">{fechaHora(c.created_at)}</div>
                    {conDisciplina && c.disciplina && <div className="truncate font-medium text-bordo-800">{c.disciplina}</div>}
                  </div>

                  {/* Qué */}
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <BadgeTipoCambio tipo={c.tipo} />
                      {c.persona && <span className="truncate text-sm font-medium">{c.persona}</span>}
                    </div>
                    {(c.cedula || c.numero_socio) && (
                      <div className="text-[11px] text-muted-foreground tabular-nums">
                        {c.cedula ? `CI ${c.cedula}` : ""}
                        {c.numero_socio ? `${c.cedula ? " · " : ""}Socio Nº ${c.numero_socio}` : ""}
                      </div>
                    )}
                    <p className="text-xs text-foreground/80">{c.descripcion}</p>
                    {difs.length > 0 && (
                      <ul className="space-y-0.5">
                        {difs.map((d) => (
                          <li key={d.etiqueta} className="flex flex-wrap items-center gap-1 text-[11px]">
                            <span className="text-muted-foreground">{d.etiqueta}:</span>
                            <span className="text-muted-foreground line-through decoration-rose-300">{d.antes}</span>
                            <ArrowRight className="size-3 text-muted-foreground" />
                            <span className="font-medium text-foreground">{d.despues}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Para el portal */}
                  <div className="min-w-0 space-y-1 text-xs">
                    {c.vigencia && (
                      <div>
                        <span className="text-muted-foreground">Rige desde </span>
                        <span className="font-medium tabular-nums">{formatFecha(c.vigencia)}</span>
                      </div>
                    )}
                    {cuotaMes != null && (
                      <div>
                        <span className="text-muted-foreground">Cuota mensual </span>
                        <span className="font-medium tabular-nums">{formatImporte(cuotaMes, "UYU")}</span>
                      </div>
                    )}
                    {tarjeta && (
                      <div className="flex items-center gap-1 tabular-nums">
                        <CreditCard className="size-3.5 text-muted-foreground" />
                        {tarjeta}
                      </div>
                    )}
                    {c.despues?.titular && <div className="truncate text-muted-foreground">Titular: {String(c.despues.titular)}</div>}
                    {c.tarjeta_pendiente && onVerNumero && (
                      <motion.button
                        type="button"
                        whileHover={{ y: -1 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => onVerNumero(c)}
                        className="mt-1 inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-medium text-sky-800 transition-colors hover:bg-sky-100"
                      >
                        <Eye className="size-3" />
                        Ver número
                        {c.consultas > 0 && <span className="opacity-70">· visto {c.consultas}</span>}
                      </motion.button>
                    )}
                    {c.tarjeta_pendiente && !onVerNumero && (
                      <div className="text-[11px] text-sky-800">Número completo pendiente de cargar</div>
                    )}
                  </div>

                  {/* Quién y estado */}
                  <div className="flex flex-wrap items-start gap-1.5 text-xs sm:col-span-2 lg:col-span-1 lg:flex-col lg:items-end lg:text-right">
                    <BadgeEstadoCambio estado={c.estado_debito} />
                    <BadgeOrigen origen={c.origen} />
                    {c.hecho_por_nombre && <span className="text-muted-foreground">por {c.hecho_por_nombre}</span>}
                    {c.aplicado_at && c.estado_debito !== "pendiente" && (
                      <span className="basis-full text-[11px] text-muted-foreground lg:basis-auto">
                        {c.estado_debito === "descartado" ? "Descartado" : "Cargado"} el {fechaHora(c.aplicado_at)}
                        {c.aplicado_por_nombre ? ` por ${c.aplicado_por_nombre}` : ""}
                      </span>
                    )}
                    {c.notas_aplicacion && <span className="basis-full text-[11px] italic text-muted-foreground lg:basis-auto">“{c.notas_aplicacion}”</span>}
                  </div>
                </div>
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

// ------------------------------------------------------------
// Pantalla de tesorería
// ------------------------------------------------------------

type Origen = "todos" | "representante" | "club";

const ESTADOS: { valor: FiltroEstadoCambios; etiqueta: string }[] = [
  { valor: "pendiente", etiqueta: "Pendientes" },
  { valor: "aplicado", etiqueta: "Cargados" },
  { valor: "descartado", etiqueta: "Descartados" },
  { valor: "debito", etiqueta: "Todos los del débito" },
  { valor: "todos", etiqueta: "Todo el registro" },
];

export function CambiosVista({
  cambios,
  pendientes,
  delMes,
  disciplinas,
  filtros,
  hoy,
  error,
  puedeTesoreria,
}: {
  cambios: CambioDebito[];
  /** Todos los pendientes (para los indicadores). */
  pendientes: CambioDebito[];
  /** Los del mes en curso (para los indicadores). */
  delMes: CambioDebito[];
  disciplinas: { id: number; nombre: string }[];
  filtros: { estado: FiltroEstadoCambios; desde: string | null; hasta: string | null };
  hoy: string;
  error: string | null;
  puedeTesoreria: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [navegando, startNav] = useTransition();
  const [disciplina, setDisciplina] = useState<number | "">("");
  const [origen, setOrigen] = useState<Origen>("todos");
  const [texto, setTexto] = useState("");
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [marcar, setMarcar] = useState<"aplicado" | "descartado" | null>(null);
  const [notas, setNotas] = useState("");
  const [numero, setNumero] = useState<CambioDebito | null>(null);

  function navegar(cambio: Partial<typeof filtros>) {
    const f = { ...filtros, ...cambio };
    const q = new URLSearchParams();
    if (f.estado !== "pendiente") q.set("estado", f.estado);
    if (f.desde) q.set("desde", f.desde);
    if (f.hasta) q.set("hasta", f.hasta);
    setSeleccion(new Set());
    startNav(() => router.push(`${pathname}${q.size ? `?${q}` : ""}`, { scroll: false }));
  }

  const visibles = useMemo(() => {
    const q = texto.trim().toLowerCase();
    return cambios.filter(
      (c) =>
        (!disciplina || c.disciplina_id === disciplina) &&
        (origen === "todos" || c.origen === origen) &&
        (!q || `${c.persona ?? ""} ${c.cedula ?? ""} ${c.numero_socio ?? ""} ${c.descripcion}`.toLowerCase().includes(q))
    );
  }, [cambios, disciplina, origen, texto]);

  const visiblesPendientes = visibles.filter((c) => c.estado_debito === "pendiente");
  const elegidos = visiblesPendientes.filter((c) => seleccion.has(c.id));
  const todos = visiblesPendientes.length > 0 && elegidos.length === visiblesPendientes.length;
  const tarjetasPendientes = pendientes.filter((c) => c.tarjeta_pendiente).length;
  const deRepresentantes = delMes.filter((c) => c.origen === "representante").length;

  function alternar(id: number) {
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function excel() {
    const filas = visiblesPendientes;
    if (filas.length === 0) return;
    await exportarExcel(`cambios-debito_${hoy}`, [
      {
        nombre: "Pendientes",
        titulo: "Cambios para cargar en el portal del débito Visa",
        subtitulo: `${filas.length} cambio${filas.length === 1 ? "" : "s"} pendiente${filas.length === 1 ? "" : "s"} al ${formatFecha(hoy)}`,
        columnas: [
          { titulo: "Fecha", ancho: 17 },
          { titulo: "Disciplina", ancho: 20 },
          { titulo: "Socio", ancho: 30 },
          { titulo: "Cédula", ancho: 13 },
          { titulo: "Nº socio", tipo: "entero", ancho: 9 },
          { titulo: "Tipo", ancho: 18 },
          { titulo: "Descripción", ancho: 50 },
          { titulo: "Tarjeta (últimos 4)", ancho: 12 },
          { titulo: "Vencimiento", ancho: 11 },
          { titulo: "Emisor", ancho: 12 },
          { titulo: "Titular", ancho: 26 },
          { titulo: "Documento del titular", ancho: 15 },
          { titulo: "Cuota mensual", tipo: "importe", ancho: 14 },
          { titulo: "Rige desde", ancho: 12 },
        ],
        // Nunca el número completo: solo los últimos 4.
        filas: filas.map((c) => [
          fechaHora(c.created_at),
          c.disciplina,
          c.persona,
          c.cedula,
          c.numero_socio,
          NOMBRE_TIPO_CAMBIO[c.tipo] ?? c.tipo,
          c.descripcion,
          c.despues?.tarjeta ? String(c.despues.tarjeta).slice(-4) : null,
          vencimientoCorto(c.despues?.vencimiento ?? null),
          c.despues?.emisor ? String(c.despues.emisor) : null,
          c.despues?.titular ? String(c.despues.titular) : null,
          c.despues?.titular_documento ? String(c.despues.titular_documento) : null,
          cuotaDelCambio(c),
          c.vigencia ? formatFecha(c.vigencia) : null,
        ]),
      },
    ]);
  }

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Cuotas y cobranza"
        titulo="Cambios para el débito"
        descripcion="Todo lo que cambian las disciplinas y el club que hay que cargar en el portal de Visa: altas, bajas, tarjetas nuevas y cambios de cuota. Cuando lo cargás, marcalo: el número de tarjeta se borra."
      >
        <Boton variante="secundario" onClick={excel} disabled={visiblesPendientes.length === 0}>
          <FileSpreadsheet className="size-4" />
          Exportar pendientes
        </Boton>
      </EncabezadoPagina>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Pendientes de cargar" tono={pendientes.length > 0 ? "alerta" : "bueno"} detalle="En el portal de Visa">
          <NumeroAnimado valor={pendientes.length} />
        </Kpi>
        <Kpi etiqueta="Tarjetas nuevas" delay={0.03} detalle="Con el número completo para cargar">
          <NumeroAnimado valor={tarjetasPendientes} />
        </Kpi>
        <Kpi etiqueta="Cambios del mes" delay={0.06} detalle="De todo tipo, afecten o no al débito">
          <NumeroAnimado valor={delMes.length} />
        </Kpi>
        <Kpi etiqueta="Representantes / club" delay={0.09} detalle="Quién hizo los cambios del mes">
          <NumeroAnimado valor={deRepresentantes} />
          <span className="mx-1 text-muted-foreground">/</span>
          <NumeroAnimado valor={delMes.length - deRepresentantes} />
        </Kpi>
      </div>

      {error && <Aviso titulo="No se pudieron leer los cambios">{error}</Aviso>}

      <Panel
        titulo="Registro"
        icono={ClipboardCheck}
        delay={0.06}
        accion={navegando ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : undefined}
      >
        <div className="space-y-3 border-b border-linea p-4">
          <Filtros<FiltroEstadoCambios>
            id="cambios-estado"
            valor={filtros.estado}
            onChange={(v) => navegar({ estado: v })}
            opciones={ESTADOS.map((e) => ({ ...e, cantidad: e.valor === "pendiente" ? pendientes.length : undefined }))}
          />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(3,minmax(0,10rem))_minmax(0,1fr)]">
            <Campo etiqueta="Disciplina" className="col-span-2 md:col-span-1">
              <select value={disciplina} onChange={(e) => setDisciplina(e.target.value ? Number(e.target.value) : "")} className={claseControl}>
                <option value="">Todas</option>
                {disciplinas.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Desde">
              <input
                type="date"
                value={filtros.desde ?? ""}
                max={filtros.hasta ?? hoy}
                onChange={(e) => navegar({ desde: e.target.value || null })}
                className={claseControl}
              />
            </Campo>
            <Campo etiqueta="Hasta">
              <input
                type="date"
                value={filtros.hasta ?? ""}
                min={filtros.desde ?? undefined}
                max={hoy}
                onChange={(e) => navegar({ hasta: e.target.value || null })}
                className={claseControl}
              />
            </Campo>
            <Campo etiqueta="Buscar" className="col-span-2 md:col-span-1">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nombre, cédula o Nº de socio" className={cn(claseControl, "pl-9")} />
              </div>
            </Campo>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Filtros<Origen>
              id="cambios-origen"
              valor={origen}
              onChange={setOrigen}
              opciones={[
                { valor: "todos", etiqueta: "Todos" },
                { valor: "representante", etiqueta: "Representantes" },
                { valor: "club", etiqueta: "Club" },
              ]}
            />
            {(filtros.desde || filtros.hasta || disciplina || texto || origen !== "todos") && (
              <motion.button
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setDisciplina("");
                  setTexto("");
                  setOrigen("todos");
                  if (filtros.desde || filtros.hasta) navegar({ desde: null, hasta: null });
                }}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-bordo-800"
              >
                <X className="size-3.5" />
                Limpiar filtros
              </motion.button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {puedeTesoreria && visiblesPendientes.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-linea bg-superficie/50 px-4 py-2">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={todos}
                    onChange={() => setSeleccion(todos ? new Set() : new Set(visiblesPendientes.map((c) => c.id)))}
                    className="size-4 accent-bordo-800"
                  />
                  {elegidos.length > 0 ? `${elegidos.length} elegido${elegidos.length === 1 ? "" : "s"}` : "Elegir todos los pendientes"}
                </label>
                <div className="flex-1" />
                <Boton className="h-8 px-3 text-xs" disabled={elegidos.length === 0} onClick={() => setMarcar("aplicado")}>
                  <CheckCheck className="size-3.5" />
                  Marcar como cargados en Visa
                </Boton>
                <Boton variante="peligro" className="h-8 px-3 text-xs" disabled={elegidos.length === 0} onClick={() => setMarcar("descartado")}>
                  <Trash2 className="size-3.5" />
                  Descartar
                </Boton>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div animate={{ opacity: navegando ? 0.55 : 1 }} transition={{ duration: 0.2 }}>
          {visibles.length === 0 ? (
            <div className="p-4">
              <Vacio
                icono={filtros.estado === "pendiente" ? CheckCheck : ClipboardCheck}
                titulo={filtros.estado === "pendiente" && cambios.length === 0 ? "No hay nada pendiente de cargar" : "No hay cambios con ese filtro"}
                texto={filtros.estado === "pendiente" && cambios.length === 0 ? "Todo lo que cambiaron las disciplinas ya está en el portal." : undefined}
              />
            </div>
          ) : (
            <ListaCambios
              cambios={visibles}
              seleccion={seleccion}
              onAlternar={puedeTesoreria ? alternar : undefined}
              onVerNumero={puedeTesoreria ? setNumero : undefined}
            />
          )}
        </motion.div>
        <div className="border-t border-linea px-4 py-2">
          <Explicacion>
            Los cambios se registran solos cuando el club o un representante da un alta, una baja, cambia la tarjeta, el plan o el precio. Solo tesorería ve
            los números de tarjeta: cada consulta queda registrada y el número se borra al marcarlo como cargado o descartarlo.
          </Explicacion>
        </div>
      </Panel>

      <DialogoAccion
        open={marcar === "aplicado"}
        onOpenChange={(o) => {
          if (!o) {
            setMarcar(null);
            setNotas("");
          }
        }}
        icono={CheckCheck}
        titulo={`Marcar ${elegidos.length} cambio${elegidos.length === 1 ? "" : "s"} como cargados`}
        descripcion={
          <span>
            Quedan como cargados en el portal de Visa a tu nombre.
            {elegidos.some((c) => c.tarjeta_pendiente) && " Los números de tarjeta se borran: ya no se van a poder ver."}
          </span>
        }
        textoAccion="Marcar como cargados"
        mensaje="Cambios marcados como cargados"
        deshabilitado={elegidos.length === 0}
        alTerminar={() => {
          setSeleccion(new Set());
          setNotas("");
          router.refresh();
        }}
        ejecutar={async () => {
          const r = await marcarCambios({ ids: elegidos.map((c) => c.id), estado: "aplicado", notas: notas.trim() || null });
          return r.ok ? { ok: true } : r;
        }}
      >
        <Campo etiqueta="Notas" ayuda="Opcional: por ejemplo, el número de lote del portal.">
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} maxLength={500} className={cn(claseControl, "h-auto py-2")} />
        </Campo>
      </DialogoAccion>

      <DialogoAccion
        open={marcar === "descartado"}
        onOpenChange={(o) => {
          if (!o) {
            setMarcar(null);
            setNotas("");
          }
        }}
        icono={Trash2}
        destructivo
        titulo={`Descartar ${elegidos.length} cambio${elegidos.length === 1 ? "" : "s"}`}
        descripcion="No se cargan en el portal (por ejemplo, porque ya estaban o se cargaron de otra forma). El número de tarjeta se borra."
        textoAccion="Descartar"
        mensaje="Cambios descartados"
        deshabilitado={elegidos.length === 0 || notas.trim().length < 3}
        alTerminar={() => {
          setSeleccion(new Set());
          setNotas("");
          router.refresh();
        }}
        ejecutar={async () => {
          const r = await marcarCambios({ ids: elegidos.map((c) => c.id), estado: "descartado", notas: notas.trim() });
          return r.ok ? { ok: true } : r;
        }}
      >
        <Campo etiqueta="Motivo" ayuda="Obligatorio: queda registrado.">
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={3}
            autoFocus
            maxLength={500}
            className={cn(claseControl, "h-auto py-2")}
            placeholder="Por qué no se carga"
          />
        </Campo>
      </DialogoAccion>

      {numero && <DialogoNumero key={numero.id} cambio={numero} onClose={() => setNumero(null)} />}
    </div>
  );
}

// ------------------------------------------------------------
// Ver número de tarjeta
// ------------------------------------------------------------

/**
 * Muestra el número completo de una tarjeta pendiente. Se pide al abrir y
 * vive solo mientras el diálogo está abierto (el componente se desmonta al
 * cerrarlo).
 */
function DialogoNumero({ cambio, onClose }: { cambio: CambioDebito; onClose: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [numero, setNumero] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pidiendo, start] = useTransition();
  const [copiado, setCopiado] = useState(false);

  function pedir() {
    setError(null);
    start(async () => {
      const r = await verTarjeta(cambio.id);
      if (r.ok) setNumero(r.data);
      else setError(r.error);
    });
  }

  function cerrar() {
    setNumero(null);
    setOpen(false);
    // Deja terminar la animación de salida antes de desmontar.
    setTimeout(onClose, 150);
    router.refresh();
  }

  async function copiar() {
    if (!numero) return;
    try {
      await navigator.clipboard.writeText(numero.replace(/\D/g, ""));
      setCopiado(true);
      toast.success("Número copiado");
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      toast.error("No se pudo copiar: seleccionalo a mano");
    }
  }

  const agrupado = numero ? numero.replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ") : null;
  const d = cambio.despues;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex size-10 items-center justify-center rounded-full bg-sky-50 text-sky-800">
            <CreditCard className="size-5" />
          </div>
          <DialogTitle className="font-heading text-lg text-bordo-950">Tarjeta de {cambio.persona ?? "la persona"}</DialogTitle>
          <DialogDescription render={<div />}>
            {cambio.disciplina ? `${cambio.disciplina} · ` : ""}
            {d?.vencimiento ? `vence ${vencimientoCorto(d.vencimiento)}` : ""}
            {d?.emisor ? ` · ${String(d.emisor).toUpperCase()}` : ""}
            {d?.titular ? ` · titular ${String(d.titular)}` : ""}
          </DialogDescription>
        </DialogHeader>

        <AnimatePresence mode="wait">
          {agrupado ? (
            <motion.div
              key="numero"
              initial={{ opacity: 0, scale: 0.97, filter: "blur(6px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0 }}
              transition={easeSmooth}
              className="flex items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50/60 px-4 py-3"
            >
              <span className="select-all font-mono text-lg tracking-wider tabular-nums text-foreground">{agrupado}</span>
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={copiar}
                className="rounded-lg p-2 text-sky-800 transition-colors hover:bg-sky-100"
                aria-label="Copiar el número"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span key={copiado ? "ok" : "copiar"} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}>
                    {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </motion.span>
                </AnimatePresence>
              </motion.button>
            </motion.div>
          ) : (
            <motion.div key="pedir" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-linea px-4 py-3">
                <span className="font-mono text-lg tracking-wider text-muted-foreground">•••• •••• •••• {d?.tarjeta ?? "····"}</span>
                <Boton className="h-8 px-3 text-xs" onClick={pedir} pendiente={pidiendo}>
                  {!pidiendo && <Eye className="size-3.5" />}
                  Mostrar
                </Boton>
              </div>
              {error && <p className="text-xs text-rose-700">{error}</p>}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <ShieldAlert className="mt-px size-4 shrink-0" />
          <span>
            Cada vez que se muestra queda registrado a tu nombre{cambio.consultas > 0 ? ` (ya se vio ${cambio.consultas} vez${cambio.consultas === 1 ? "" : "es"})` : ""}.
            El número se borra cuando marcás el cambio como cargado en Visa o lo descartás. No lo guardes en otro lado.
          </span>
        </div>

        <DialogFooter>
          <Boton variante="secundario" onClick={cerrar}>
            Cerrar
          </Boton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
