"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, CalendarClock, Plus, RefreshCw, ShoppingBag, Trash2, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { r2 } from "@/lib/socios/cuotas";
import { NOMBRE_ESTADO_PEDIDO, generarCuotas, sumarMesesDia, type PedidoDisciplina } from "@/lib/socios/disciplinas";
import { Boton, Campo, Explicacion, ImporteAnimado, Panel, claseControl } from "@/components/socios/cuotas/ui";
import { crearPlanPago } from "@/app/(dashboard)/secretaria/disciplinas/actions";
import type { DatosDisciplina } from "./form-disciplina";
import { aNumero } from "./ui";

interface Fila {
  clave: number;
  vencimiento: string;
  importe: string;
}

const aTexto = (n: number) => n.toFixed(2).replace(".", ",");

/** Primer vencimiento sugerido: el día 10 del mes que viene. */
function primerSugerido(hoy: string) {
  return sumarMesesDia(`${hoy.slice(0, 7)}-10`, 1);
}

export function ArmarPlan({
  disciplina,
  pedidos,
  hoy,
  onClose,
}: {
  disciplina: DatosDisciplina;
  pedidos: PedidoDisciplina[];
  hoy: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const disponibles = pedidos.filter((p) => p.estado !== "cancelado" && !p.plan);
  const ocupados = pedidos.filter((p) => p.estado !== "cancelado" && p.plan);
  const contador = useRef(0);
  const nuevaClave = () => ++contador.current;

  const [elegidos, setElegidos] = useState<Set<number>>(new Set());
  const [importeManual, setImporteManual] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState("3");
  const [primero, setPrimero] = useState(primerSugerido(hoy));
  const [cada, setCada] = useState(1);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [editadas, setEditadas] = useState(false);
  const [descripcion, setDescripcion] = useState("");
  const [notas, setNotas] = useState("");
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const total = r2(disponibles.filter((p) => elegidos.has(p.id)).reduce((s, p) => s + p.total, 0));
  const importe = importeManual === null ? total : r2(aNumero(importeManual));
  const suma = r2(filas.reduce((s, f) => s + aNumero(f.importe), 0));
  const diferencia = r2(importe - suma);

  function regenerar(imp: number, cant: string, prim: string, c: number) {
    const n = Math.floor(Number(cant));
    if (!(imp > 0) || !(n >= 1) || !prim) {
      setFilas([]);
      return;
    }
    // Las filas que siguen existiendo conservan su clave: cambian de valor sin salir y volver a entrar.
    setFilas(
      generarCuotas(imp, Math.min(60, n), prim, c).map((q, i) => ({
        clave: filas[i]?.clave ?? nuevaClave(),
        vencimiento: q.vencimiento,
        importe: aTexto(q.importe),
      }))
    );
    setEditadas(false);
  }

  function alternar(id: number) {
    const s = new Set(elegidos);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setElegidos(s);
    const nuevoTotal = r2(disponibles.filter((p) => s.has(p.id)).reduce((a, p) => a + p.total, 0));
    if (importeManual === null) regenerar(nuevoTotal, cantidad, primero, cada);
  }

  function todos() {
    const s = elegidos.size === disponibles.length ? new Set<number>() : new Set(disponibles.map((p) => p.id));
    setElegidos(s);
    const nuevoTotal = r2(disponibles.filter((p) => s.has(p.id)).reduce((a, p) => a + p.total, 0));
    if (importeManual === null) regenerar(nuevoTotal, cantidad, primero, cada);
  }

  function editarFila(clave: number, campo: "vencimiento" | "importe", valor: string) {
    setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, [campo]: campo === "importe" ? valor.replace(/[^\d.,]/g, "") : valor } : f)));
    setEditadas(true);
  }

  function agregarFila() {
    const ultima = filas.at(-1);
    setFilas((fs) => [
      ...fs,
      { clave: nuevaClave(), vencimiento: ultima?.vencimiento ? sumarMesesDia(ultima.vencimiento, cada) : primero, importe: diferencia > 0 ? aTexto(diferencia) : "" },
    ]);
    setEditadas(true);
  }

  function quitarFila(clave: number) {
    setFilas((fs) => fs.filter((f) => f.clave !== clave));
    setEditadas(true);
  }

  const errores: string[] = [];
  if (elegidos.size === 0) errores.push("Elegí al menos un pedido");
  else if (!(importe > 0)) errores.push("El importe tiene que ser mayor que cero");
  else if (importe > total + 0.004) errores.push(`El importe no puede superar el total de los pedidos (${formatImporte(total)})`);
  if (filas.length === 0) errores.push("Armá al menos una cuota");
  if (filas.length > 60) errores.push("Como máximo 60 cuotas");
  if (filas.some((f) => !f.vencimiento)) errores.push("Falta el vencimiento de alguna cuota");
  if (filas.some((f) => !(aNumero(f.importe) > 0))) errores.push("Cada cuota tiene que ser mayor que cero");
  if (filas.some((f, i) => i > 0 && f.vencimiento && filas[i - 1].vencimiento && f.vencimiento < filas[i - 1].vencimiento)) errores.push("Los vencimientos van en orden");
  if (filas.length > 0 && Math.abs(diferencia) >= 0.005) errores.push(diferencia > 0 ? `Faltan ${formatImporte(diferencia)} para llegar al importe` : `Las cuotas se pasan por ${formatImporte(-diferencia)}`);

  function crear() {
    setError(null);
    start(async () => {
      const r = await crearPlanPago({
        disciplina_id: disciplina.id,
        pedidos: [...elegidos],
        importe,
        cuotas: filas.map((f) => ({ vencimiento: f.vencimiento, importe: r2(aNumero(f.importe)) })),
        descripcion: descripcion.trim() || null,
        notas: notas.trim() || null,
      });
      if (!r.ok) {
        setError(r.error);
        toast.error(r.error);
        return;
      }
      toast.success("Plan de pago creado");
      onClose();
      router.refresh();
    });
  }

  return (
    <Panel
      titulo="Armar un plan de pago"
      icono={Wand2}
      className="border-bordo-100 shadow-card"
      accion={
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={onClose}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-superficie hover:text-foreground"
          aria-label="Cerrar"
        >
          <X className="size-4" />
        </motion.button>
      }
    >
      <div className="grid grid-cols-1 gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* 1. Pedidos */}
        <section className="min-w-0 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-heading text-sm">1. Pedidos</h3>
            {disponibles.length > 1 && (
              <button type="button" onClick={todos} className="text-xs font-medium text-bordo-800 hover:underline">
                {elegidos.size === disponibles.length ? "Ninguno" : "Todos"}
              </button>
            )}
          </div>
          {disponibles.length === 0 ? (
            <div className="rounded-xl border border-dashed border-linea p-4 text-center text-xs text-muted-foreground">
              <ShoppingBag className="mx-auto mb-2 size-6 opacity-40" />
              No hay pedidos de la disciplina libres: están cancelados o ya en un plan vigente.
            </div>
          ) : (
            <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {disponibles.map((p) => {
                const on = elegidos.has(p.id);
                return (
                  <li key={p.id}>
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.98 }}
                      onClick={() => alternar(p.id)}
                      aria-pressed={on}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
                        on ? "border-bordo-200 bg-bordo-50/60" : "border-linea bg-white hover:bg-superficie"
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                          on ? "border-bordo-800 bg-bordo-800 text-white" : "border-linea bg-white"
                        )}
                      >
                        <AnimatePresence>
                          {on && (
                            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                              <Check className="size-3.5" />
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold">{p.numero}</span>
                          <span className="text-[11px] text-muted-foreground">{formatFecha(p.fecha)}</span>
                          <span className="text-[11px] text-muted-foreground">· {NOMBRE_ESTADO_PEDIDO[p.estado] ?? p.estado}</span>
                        </span>
                        {p.detalle && <span className="block truncate text-[11px] text-muted-foreground">{p.detalle}</span>}
                      </span>
                      <span className="shrink-0 text-sm tabular-nums">{formatImporte(p.total)}</span>
                    </motion.button>
                  </li>
                );
              })}
            </ul>
          )}
          {ocupados.length > 0 && (
            <Explicacion>
              {ocupados.length} pedido{ocupados.length === 1 ? " ya está" : "s ya están"} en un plan vigente ({ocupados.map((p) => p.numero).join(", ")}).
            </Explicacion>
          )}
          <div className="space-y-2 rounded-xl border border-linea bg-superficie/40 p-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total elegido</span>
              <ImporteAnimado valor={total} moneda="UYU" className="font-medium" />
            </div>
            <Campo
              etiqueta="Importe del plan ($)"
              ayuda={importeManual === null ? "El total de lo elegido. Si ya pagaron una parte, poné uno menor." : undefined}
            >
              <div className="flex gap-2">
                <input
                  inputMode="decimal"
                  value={importeManual ?? (total > 0 ? aTexto(total) : "")}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d.,]/g, "");
                    setImporteManual(v);
                    if (!editadas) regenerar(r2(aNumero(v)), cantidad, primero, cada);
                  }}
                  className={cn(claseControl, "text-right tabular-nums")}
                  disabled={elegidos.size === 0}
                  aria-invalid={importe > total + 0.004}
                />
                <AnimatePresence>
                  {importeManual !== null && (
                    <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }} exit={{ opacity: 0, width: 0 }}>
                      <Boton
                        variante="secundario"
                        className="h-10 px-3 text-xs whitespace-nowrap"
                        onClick={() => {
                          setImporteManual(null);
                          regenerar(total, cantidad, primero, cada);
                        }}
                      >
                        Usar el total
                      </Boton>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Campo>
            {importeManual !== null && importe > 0 && importe < total && (
              <p className="text-[11px] text-muted-foreground">{formatImporte(r2(total - importe))} se consideran ya pagados.</p>
            )}
          </div>
        </section>

        {/* 2. Cuotas */}
        <section className="min-w-0 space-y-3">
          <h3 className="font-heading text-sm">2. Cuotas</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <Campo etiqueta="Cantidad">
              <input
                type="number"
                min={1}
                max={60}
                value={cantidad}
                onChange={(e) => {
                  setCantidad(e.target.value);
                  regenerar(importe, e.target.value, primero, cada);
                }}
                className={cn(claseControl, "tabular-nums")}
              />
            </Campo>
            <Campo etiqueta="Frecuencia">
              <select
                value={cada}
                onChange={(e) => {
                  setCada(Number(e.target.value));
                  regenerar(importe, cantidad, primero, Number(e.target.value));
                }}
                className={claseControl}
              >
                <option value={1}>Mensual</option>
                <option value={2}>Cada 2 meses</option>
                <option value={3}>Cada 3 meses</option>
              </select>
            </Campo>
            <Campo etiqueta="Primer vencimiento" className="col-span-2 sm:col-span-1">
              <input
                type="date"
                value={primero}
                onChange={(e) => {
                  setPrimero(e.target.value);
                  regenerar(importe, cantidad, e.target.value, cada);
                }}
                className={claseControl}
              />
            </Campo>
            <Boton
              variante="secundario"
              className="col-span-2 h-10 px-3 text-xs sm:col-span-1"
              onClick={() => regenerar(importe, cantidad, primero, cada)}
              disabled={!(importe > 0)}
              title="Volver a repartir en partes iguales"
            >
              <RefreshCw className="size-3.5" />
              Repartir
            </Boton>
          </div>
          {editadas && <Explicacion>Editaste las cuotas a mano: cambiar la cantidad, la frecuencia o el primer vencimiento las vuelve a repartir.</Explicacion>}

          {filas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-linea p-4 text-center text-xs text-muted-foreground">
              <CalendarClock className="mx-auto mb-2 size-6 opacity-40" />
              Elegí los pedidos y las cuotas se reparten solas en partes iguales (la última absorbe el redondeo).
            </div>
          ) : (
            <ul className="space-y-1.5">
              <AnimatePresence initial={false}>
                {filas.map((f, i) => {
                  const desordenada = i > 0 && f.vencimiento && filas[i - 1].vencimiento && f.vencimiento < filas[i - 1].vencimiento;
                  return (
                    <motion.li
                      key={f.clave}
                      layout
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 8, height: 0 }}
                      transition={{ duration: 0.22, delay: Math.min(i, 12) * 0.02 }}
                      className="grid grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,7.5rem)_2rem] items-center gap-2"
                    >
                      <span className="flex size-7 items-center justify-center rounded-full bg-superficie text-[11px] font-medium tabular-nums">{i + 1}</span>
                      <input
                        type="date"
                        value={f.vencimiento}
                        onChange={(e) => editarFila(f.clave, "vencimiento", e.target.value)}
                        className={cn(claseControl, "h-9 px-2 text-xs sm:text-sm")}
                        aria-invalid={!!desordenada}
                        aria-label={`Vencimiento de la cuota ${i + 1}`}
                      />
                      <input
                        inputMode="decimal"
                        value={f.importe}
                        onChange={(e) => editarFila(f.clave, "importe", e.target.value)}
                        className={cn(claseControl, "h-9 px-2 text-right text-xs tabular-nums sm:text-sm")}
                        aria-invalid={!(aNumero(f.importe) > 0)}
                        aria-label={`Importe de la cuota ${i + 1}`}
                      />
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.85 }}
                        onClick={() => quitarFila(f.clave)}
                        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-700"
                        aria-label={`Quitar la cuota ${i + 1}`}
                      >
                        <Trash2 className="size-3.5" />
                      </motion.button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Boton variante="secundario" className="h-8 px-3 text-xs" onClick={agregarFila} disabled={filas.length >= 60 || !(importe > 0)}>
              <Plus className="size-3.5" />
              Agregar cuota
            </Boton>
            <div
              className={cn(
                "flex items-center gap-3 rounded-full border px-3 py-1 text-xs transition-colors",
                filas.length === 0 ? "border-linea text-muted-foreground" : Math.abs(diferencia) < 0.005 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"
              )}
              aria-live="polite"
            >
              <span>
                Suma <ImporteAnimado valor={suma} className="font-medium" />
              </span>
              <span className="opacity-60">de</span>
              <span className="tabular-nums">{formatImporte(importe)}</span>
              <AnimatePresence mode="wait">
                {filas.length > 0 && Math.abs(diferencia) < 0.005 ? (
                  <motion.span key="ok" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                    <Check className="size-3.5" />
                  </motion.span>
                ) : filas.length > 0 ? (
                  <motion.span key="dif" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="tabular-nums">
                    {diferencia > 0 ? "faltan" : "sobran"} {formatImporte(Math.abs(diferencia))}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </div>
          </div>
        </section>
      </div>

      {/* 3. Datos */}
      <div className="grid grid-cols-1 gap-3 border-t border-linea p-4 sm:grid-cols-2">
        <Campo etiqueta="Descripción" ayuda={`Si queda vacía: "Plan de pago de ${disciplina.nombre}".`}>
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder={`Plan de pago de ${disciplina.nombre}`} className={claseControl} maxLength={200} />
        </Campo>
        <Campo etiqueta="Notas">
          <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" className={claseControl} maxLength={1000} />
        </Campo>
      </div>

      <div className="flex flex-col gap-3 border-t border-linea bg-superficie/30 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-h-5 text-xs">
          <AnimatePresence mode="wait">
            {error ? (
              <motion.p key={error} initial={{ opacity: 0 }} animate={{ opacity: 1, x: [0, -6, 6, -4, 4, 0] }} exit={{ opacity: 0 }} className="text-rose-700" role="alert">
                {error}
              </motion.p>
            ) : errores.length > 0 ? (
              <motion.p key={errores[0]} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-muted-foreground">
                {errores[0]}
              </motion.p>
            ) : (
              <motion.p key="listo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-emerald-700">
                {filas.length} cuota{filas.length === 1 ? "" : "s"} de {formatFecha(filas[0]?.vencimiento)} a {formatFecha(filas.at(-1)?.vencimiento)} por {formatImporte(importe, "UYU")}.
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        <div className="flex gap-2">
          <Boton variante="secundario" onClick={onClose} disabled={pendiente} className="flex-1 sm:flex-none">
            Cancelar
          </Boton>
          <Boton onClick={crear} pendiente={pendiente} disabled={errores.length > 0} className="flex-1 sm:flex-none">
            <CalendarClock className="size-4" />
            Crear plan
          </Boton>
        </div>
      </div>
    </Panel>
  );
}
