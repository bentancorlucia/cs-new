"use client";

import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, CalendarRange, Eye, History, Layers, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth } from "@/lib/motion";
import { nombrePeriodo, r2, sumarMeses, type FilaPrevia, type Lote } from "@/lib/socios/cuotas";
import { anularLote, emitirLote, previsualizarLoteAction } from "@/app/(dashboard)/cuotas/actions";
import {
  BadgeEstado,
  Boton,
  Campo,
  DialogoAccion,
  DialogoAnular,
  EncabezadoPagina,
  Explicacion,
  Filtros,
  ImporteAnimado,
  Kpi,
  LinkAsiento,
  NumeroAnimado,
  Panel,
  Pastilla,
  Vacio,
  claseControl,
} from "./ui";

const LIMITE = 150;

function venceDefecto(periodo: string, dia: number) {
  return `${periodo.slice(0, 7)}-${String(dia).padStart(2, "0")}`;
}

export function LotesVista({
  lotes,
  diaVencimiento,
  hoy,
  puedeEmitir,
}: {
  lotes: Lote[];
  diaVencimiento: number;
  hoy: string;
  puedeEmitir: boolean;
}) {
  const emitidos = lotes.filter((l) => l.estado === "emitido");
  const sugerido = emitidos.length ? sumarMeses(emitidos[0].periodo, 1) : `${hoy.slice(0, 7)}-01`;

  const [mes, setMes] = useState(sugerido.slice(0, 7));
  const [filas, setFilas] = useState<FilaPrevia[] | null>(null);
  const [previo, setPrevio] = useState<string | null>(null);
  const [omitir, setOmitir] = useState<Set<number>>(new Set());
  const [emision, setEmision] = useState(`${sugerido.slice(0, 7)}-01`);
  const [vence, setVence] = useState(venceDefecto(sugerido, diaVencimiento));
  const [cargando, start] = useTransition();
  const [confirmar, setConfirmar] = useState(false);
  const [anular, setAnular] = useState<Lote | null>(null);
  const [vista, setVista] = useState<"incluidas" | "excluidas" | "omitidas">("incluidas");
  const [texto, setTexto] = useState("");
  const [limite, setLimite] = useState(LIMITE);

  const periodo = `${mes}-01`;
  const yaEmitido = emitidos.find((l) => l.periodo === periodo);

  function previsualizar() {
    start(async () => {
      const r = await previsualizarLoteAction(periodo);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setFilas(r.data);
      setPrevio(periodo);
      setOmitir(new Set());
      setEmision(`${mes}-01`);
      setVence(venceDefecto(periodo, diaVencimiento));
      setVista("incluidas");
      setLimite(LIMITE);
    });
  }

  const calc = useMemo(() => {
    const todas = filas ?? [];
    const emitibles = todas.filter((f) => !f.excluida);
    const incluidas = emitibles.filter((f) => !omitir.has(f.suscripcion_id));
    const porPlan = new Map<string, { cantidad: number; total: number }>();
    const porDisc = new Map<string, { cantidad: number; total: number }>();
    for (const f of incluidas) {
      const a = porPlan.get(f.plan) ?? { cantidad: 0, total: 0 };
      porPlan.set(f.plan, { cantidad: a.cantidad + 1, total: r2(a.total + f.importe) });
      const k = f.disciplina ?? "Cuota social";
      const b = porDisc.get(k) ?? { cantidad: 0, total: 0 };
      porDisc.set(k, { cantidad: b.cantidad + 1, total: r2(b.total + f.importe) });
    }
    return {
      todas,
      emitibles,
      incluidas,
      excluidas: todas.filter((f) => f.excluida),
      total: r2(incluidas.reduce((s, f) => s + f.importe, 0)),
      porPlan: [...porPlan.entries()].sort((a, b) => b[1].total - a[1].total),
      porDisc: [...porDisc.entries()].sort((a, b) => b[1].total - a[1].total),
    };
  }, [filas, omitir]);

  const visibles = useMemo(() => {
    const base =
      vista === "incluidas" ? calc.incluidas : vista === "excluidas" ? calc.excluidas : calc.emitibles.filter((f) => omitir.has(f.suscripcion_id));
    const q = texto.trim().toLowerCase();
    return q ? base.filter((f) => `${f.persona} ${f.cedula} ${f.plan}`.toLowerCase().includes(q)) : base;
  }, [calc, vista, omitir, texto]);

  const alternar = (id: number) =>
    setOmitir((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-5">
      <EncabezadoPagina
        eyebrow="Cuotas y cobranza"
        titulo="Emisión de cuotas"
        descripcion="Un lote por mes: una cuota por inscripción vigente, con un asiento (cuotas a cobrar contra ingresos)."
      />

      <Panel titulo="Nuevo lote" icono={CalendarRange} delay={0.05}>
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <Campo etiqueta="Mes" className="w-44">
              <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className={claseControl} />
            </Campo>
            <Boton onClick={previsualizar} pendiente={cargando} disabled={!mes}>
              {!cargando && <Eye className="size-4" />}
              Previsualizar
            </Boton>
            {yaEmitido && (
              <Pastilla tono="info">
                {nombrePeriodo(periodo)} ya tiene un lote: solo saldrían las inscripciones nuevas
              </Pastilla>
            )}
          </div>

          <AnimatePresence mode="wait">
            {cargando && !filas && (
              <motion.div key="c" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Calculando…
              </motion.div>
            )}
            {filas && previo && (
              <motion.div key={previo} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={easeSmooth} className="space-y-4">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Kpi etiqueta={`A emitir · ${nombrePeriodo(previo)}`}>
                    <NumeroAnimado valor={calc.incluidas.length} />
                  </Kpi>
                  <Kpi etiqueta="Total del lote" tono="bueno">
                    <ImporteAnimado valor={calc.total} moneda="UYU" />
                  </Kpi>
                  <Kpi etiqueta="Excluidas por la base" detalle="Sin precio, ya emitidas o mes del alta">
                    <NumeroAnimado valor={calc.excluidas.length} />
                  </Kpi>
                  <Kpi etiqueta="Omitidas a mano" tono={omitir.size ? "alerta" : "neutro"}>
                    <NumeroAnimado valor={omitir.size} />
                  </Kpi>
                </div>

                {calc.incluidas.length > 0 && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <Totales titulo="Por plan" filas={calc.porPlan} total={calc.total} />
                    <Totales titulo="Por disciplina" filas={calc.porDisc} total={calc.total} />
                  </div>
                )}

                <div className="space-y-2 rounded-2xl border border-linea">
                  <div className="flex flex-col gap-2 border-b border-linea p-3 sm:flex-row sm:items-center sm:justify-between">
                    <Filtros
                      id="lote"
                      valor={vista}
                      onChange={(v) => {
                        setVista(v);
                        setLimite(LIMITE);
                      }}
                      opciones={[
                        { valor: "incluidas", etiqueta: "Se emiten", cantidad: calc.incluidas.length },
                        { valor: "excluidas", etiqueta: "Excluidas", cantidad: calc.excluidas.length },
                        { valor: "omitidas", etiqueta: "Omitidas", cantidad: omitir.size },
                      ]}
                    />
                    <div className="relative sm:w-64">
                      <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                      <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Persona o plan…" className={cn(claseControl, "h-9 pl-9")} />
                    </div>
                  </div>
                  {visibles.length === 0 ? (
                    <p className="px-4 pb-4 text-sm text-muted-foreground">Nada para mostrar.</p>
                  ) : (
                    <ul className="divide-y divide-linea">
                      {visibles.slice(0, limite).map((f, i) => {
                        const omitida = omitir.has(f.suscripcion_id);
                        return (
                          <motion.li
                            key={f.suscripcion_id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.25, delay: Math.min(i, 20) * 0.015 }}
                            className={cn(
                              "grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 px-3 py-2 text-sm",
                              (f.excluida || omitida) && "bg-superficie/50 text-muted-foreground"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={!f.excluida && !omitida}
                              disabled={!!f.excluida || !puedeEmitir}
                              onChange={() => alternar(f.suscripcion_id)}
                              className="mt-1 size-4 accent-bordo-800"
                              aria-label={`Incluir ${f.persona}`}
                            />
                            <div className="min-w-0">
                              <div className="truncate font-medium text-foreground">{f.persona}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {f.concepto}
                                {f.periodicidad === "anual" && " · anual"}
                              </div>
                              {f.excluida && <div className="text-xs text-rose-700">{f.excluida}</div>}
                            </div>
                            <div className="text-right tabular-nums">{formatImporte(f.importe)}</div>
                          </motion.li>
                        );
                      })}
                    </ul>
                  )}
                  {visibles.length > limite && (
                    <div className="p-3 text-center">
                      <Boton variante="secundario" onClick={() => setLimite((l) => l + LIMITE * 2)}>
                        Mostrar más ({visibles.length - limite})
                      </Boton>
                    </div>
                  )}
                </div>

                {puedeEmitir && (
                  <div className="flex flex-col gap-3 rounded-2xl border border-bordo-100 bg-bordo-50/40 p-4 sm:flex-row sm:items-end">
                    <Campo etiqueta="Fecha de emisión" className="sm:w-44">
                      <input type="date" value={emision} onChange={(e) => setEmision(e.target.value)} className={claseControl} />
                    </Campo>
                    <Campo etiqueta="Vencimiento" className="sm:w-44">
                      <input type="date" value={vence} min={emision} onChange={(e) => setVence(e.target.value)} className={claseControl} />
                    </Campo>
                    <div className="flex-1" />
                    <Boton onClick={() => setConfirmar(true)} disabled={calc.incluidas.length === 0}>
                      <Layers className="size-4" />
                      Emitir {calc.incluidas.length} cuota{calc.incluidas.length === 1 ? "" : "s"}
                    </Boton>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Panel>

      <Panel titulo="Lotes emitidos" icono={History} delay={0.1}>
        {lotes.length === 0 ? (
          <div className="p-4">
            <Vacio icono={Layers} titulo="Todavía no hay lotes" texto="Elegí un mes y previsualizalo para emitir el primero." />
          </div>
        ) : (
          <ul className="divide-y divide-linea">
            {lotes.map((l, i) => (
              <motion.li
                key={l.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...easeSmooth, delay: Math.min(i, 10) * 0.03 }}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_9rem_auto]",
                  l.estado === "anulado" && "opacity-60"
                )}
              >
                <div>
                  <div className="font-heading text-base text-bordo-800">{nombrePeriodo(l.periodo)}</div>
                  <div className="text-xs text-muted-foreground">Lote {l.id}</div>
                </div>
                <div className="col-span-2 row-start-2 text-xs text-muted-foreground sm:col-span-1 sm:row-start-auto">
                  Emitido {formatFecha(l.fecha_emision)} · vence {formatFecha(l.fecha_vencimiento)} · {l.cantidad} cuotas
                  {l.motivo_anulacion && <div className="text-rose-700">Anulado: {l.motivo_anulacion}</div>}
                </div>
                <div className="text-right font-heading tabular-nums">{formatImporte(l.importe_total, "UYU")}</div>
                <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 sm:col-span-1">
                  <BadgeEstado estado={l.estado} />
                  <LinkAsiento id={l.asiento_id} />
                  {puedeEmitir && l.estado === "emitido" && (
                    <Boton variante="peligro" className="h-8 px-3 text-xs" onClick={() => setAnular(l)}>
                      <Ban className="size-3.5" />
                      Anular
                    </Boton>
                  )}
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </Panel>

      <DialogoAccion
        open={confirmar}
        onOpenChange={setConfirmar}
        icono={Layers}
        titulo={`Emitir cuotas de ${nombrePeriodo(previo ?? periodo)}`}
        descripcion={
          <span>
            Se emiten <strong>{calc.incluidas.length}</strong> cuotas por <strong>{formatImporte(calc.total, "UYU")}</strong>, con
            fecha {formatFecha(emision)} y vencimiento {formatFecha(vence)}. Las cuotas no se editan: se corrigen con notas de
            crédito o anulando el lote entero. Quien tenga saldo a favor lo ve aplicado automáticamente.
          </span>
        }
        textoAccion="Emitir lote"
        mensaje="Lote emitido"
        ejecutar={async () => {
          const r = await emitirLote({
            periodo: previo ?? periodo,
            fecha_emision: emision,
            fecha_vencimiento: vence,
            omitir: [...omitir],
          });
          if (r.ok) {
            setFilas(null);
            setPrevio(null);
            setOmitir(new Set());
          }
          return r;
        }}
      />

      <DialogoAnular
        open={!!anular}
        onOpenChange={(o) => !o && setAnular(null)}
        titulo={`Anular el lote de ${nombrePeriodo(anular?.periodo)}`}
        descripcion="Se revierte el asiento y sus cuotas quedan anuladas. La base lo rechaza si alguna cuota del lote ya tiene cobros o notas de crédito."
        anular={(motivo) => anularLote({ id: anular!.id, motivo })}
      />
    </div>
  );
}

function Totales({ titulo, filas, total }: { titulo: string; filas: [string, { cantidad: number; total: number }][]; total: number }) {
  return (
    <div className="rounded-2xl border border-linea p-3">
      <div className="mb-2 text-[10px] uppercase tracking-editorial text-muted-foreground">{titulo}</div>
      <ul className="space-y-1.5">
        {filas.map(([nombre, v]) => (
          <li key={nombre} className="space-y-0.5">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">
                {nombre} <span className="text-xs text-muted-foreground">× {v.cantidad}</span>
              </span>
              <span className="tabular-nums">{formatImporte(v.total)}</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-superficie">
              <motion.div
                className="h-full rounded-full bg-bordo-700/70"
                initial={{ width: 0 }}
                animate={{ width: `${total ? (v.total / total) * 100 : 0}%` }}
                transition={{ duration: 0.7 }}
              />
            </div>
          </li>
        ))}
      </ul>
      <Explicacion className="mt-2">Solo las cuotas que se emiten (sin excluidas ni omitidas).</Explicacion>
    </div>
  );
}
