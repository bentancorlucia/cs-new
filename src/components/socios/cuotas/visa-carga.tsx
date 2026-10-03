"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, ClipboardPaste, CreditCard, FileUp, Loader2, Scale, UserCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatImporte } from "@/lib/contabilidad/formato";
import { easeSmooth } from "@/lib/motion";
import {
  finMes,
  nombrePersona,
  nombrePeriodo,
  r2,
  type CuentaDisponible,
  type Persona,
  type SimulacionVisa,
  type TipoClave,
} from "@/lib/socios/cuotas";
import { aplicarLiquidacionVisa, identificarVisa, simularVisa } from "@/app/(dashboard)/cuotas/actions";
import {
  Aviso,
  Boton,
  BuscadorPersona,
  Campo,
  DialogoAccion,
  Explicacion,
  ImporteAnimado,
  Panel,
  Pastilla,
  claseControl,
} from "./ui";

type Tabla = { filas: string[][]; nombre: string | null };

interface Item {
  idx: number;
  clave: string;
  importe: number;
  cobrado: boolean;
  motivo: string;
  persona: Persona | null;
  via: "cedula" | "titular" | "tarjeta" | "manual" | null;
  candidatos: Persona[];
  ignorar: boolean;
}

const VIA: Record<string, string> = {
  cedula: "por cédula",
  titular: "por titular",
  tarjeta: "por tarjeta",
  manual: "a mano",
};

/** "1.234,50", "1,234.50", "1234.5", 1234.5 → número (o null). */
function parsearImporte(v: string): number | null {
  let t = v.replace(/\s|\$|UYU/gi, "");
  if (!t) return null;
  const coma = t.lastIndexOf(",");
  const punto = t.lastIndexOf(".");
  if (coma >= 0 && punto >= 0) {
    t = coma > punto ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (coma >= 0) {
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, "");
  }
  const n = Number(t);
  return Number.isFinite(n) ? r2(Math.abs(n)) : null;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const pareceRechazo = (v: string) => /rechaz|denegad|error|fall|invalid|insuf|vencid|no aprob|^no$|^r$/.test(norm(v));

function adivinar(encabezados: string[]) {
  const buscar = (re: RegExp) => encabezados.findIndex((h) => re.test(norm(h)));
  const ced = buscar(/cedula|^ci$|c\.i|documento|doc/);
  const tarj = buscar(/tarjeta|ultimos|ult\.|4 dig|nro.*tarj/);
  return {
    colId: ced >= 0 ? ced : tarj >= 0 ? tarj : 0,
    tipo: (ced >= 0 || tarj < 0 ? "cedula" : "ultimos4") as TipoClave,
    colImporte: Math.max(buscar(/importe|monto|total|valor/), -1),
    colEstado: buscar(/estado|resultado|situacion|respuesta/),
    colMotivo: buscar(/motivo|observ|rechazo|descripcion|detalle/),
  };
}

export function CargaVisa({
  cuentas,
  cuentaDefecto,
  hoy,
  alAplicar,
}: {
  cuentas: CuentaDisponible[];
  cuentaDefecto: string | null;
  hoy: string;
  alAplicar: () => void;
}) {
  const router = useRouter();
  const archivoRef = useRef<HTMLInputElement>(null);
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [fecha, setFecha] = useState(hoy);
  const [cuentaId, setCuentaId] = useState(cuentaDefecto ?? cuentas[0]?.id ?? "");
  const [comision, setComision] = useState("");
  const [tabla, setTabla] = useState<Tabla | null>(null);
  const [pegado, setPegado] = useState("");
  const [encabezado, setEncabezado] = useState(true);
  const [mapa, setMapa] = useState({ colId: 0, tipo: "cedula" as TipoClave, colImporte: 1, colEstado: -1, colMotivo: -1 });
  const [cobradoSi, setCobradoSi] = useState<Record<string, boolean>>({});
  const [items, setItems] = useState<Item[] | null>(null);
  const [sim, setSim] = useState<{ clave: string; datos: SimulacionVisa } | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [identificando, startId] = useTransition();
  const [simulando, startSim] = useTransition();
  const [confirmar, setConfirmar] = useState(false);

  const periodo = `${mes}-01`;
  const montoComision = parsearImporte(comision) ?? 0;

  // -------- Lectura --------
  function cargarFilas(filas: string[][], nombre: string | null) {
    const limpias = filas.map((f) => f.map((c) => String(c ?? "").trim())).filter((f) => f.some((c) => c !== ""));
    if (limpias.length === 0) {
      toast.error("No se encontraron filas");
      return;
    }
    if (limpias.length > 5000) {
      toast.error("Máximo 5000 filas");
      return;
    }
    const conTitulos = limpias[0].some((c) => c && !/^[\d.,\s$-]+$/.test(c));
    setEncabezado(conTitulos);
    setTabla({ filas: limpias, nombre });
    const enc = conTitulos ? limpias[0] : limpias[0].map((_, i) => `Columna ${i + 1}`);
    const g = adivinar(enc);
    if (g.colImporte < 0) g.colImporte = Math.min(1, enc.length - 1);
    setMapa(g);
    setCobradoSi({});
    setItems(null);
    setSim(null);
  }

  async function leerArchivo(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("El archivo supera 5 MB");
      return;
    }
    setLeyendo(true);
    try {
      const nombre = file.name.toLowerCase();
      if (nombre.endsWith(".csv") || nombre.endsWith(".txt")) {
        const Papa = (await import("papaparse")).default;
        const texto = (await file.text()).replace(/^﻿/, "");
        const r = Papa.parse<string[]>(texto, { skipEmptyLines: true });
        cargarFilas(r.data, file.name);
      } else {
        const XLSX = await import("xlsx");
        const libro = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const hoja = libro.Sheets[libro.SheetNames[0] ?? ""];
        if (!hoja) throw new Error("El archivo no tiene hojas");
        const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, raw: true, defval: "" });
        cargarFilas(filas.map((f) => f.map((c) => (c == null ? "" : String(c)))), file.name);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer el archivo");
    } finally {
      setLeyendo(false);
      if (archivoRef.current) archivoRef.current.value = "";
    }
  }

  async function leerPegado() {
    const Papa = (await import("papaparse")).default;
    const r = Papa.parse<string[]>(pegado.trim(), { skipEmptyLines: true });
    cargarFilas(r.data, null);
  }

  const encabezados = tabla ? (encabezado ? tabla.filas[0] : tabla.filas[0].map((_, i) => `Columna ${i + 1}`)) : [];
  const datos = useMemo(() => (tabla ? (encabezado ? tabla.filas.slice(1) : tabla.filas) : []), [tabla, encabezado]);
  const valoresEstado = useMemo(() => {
    if (mapa.colEstado < 0) return [];
    return [...new Set(datos.map((f) => (f[mapa.colEstado] ?? "").trim()))].sort();
  }, [datos, mapa.colEstado]);
  const esCobrado = (v: string) => cobradoSi[v] ?? !pareceRechazo(v);

  // -------- Identificación --------
  function identificar() {
    const base = datos
      .map((f, idx) => ({
        idx,
        clave: (f[mapa.colId] ?? "").trim(),
        importe: parsearImporte(f[mapa.colImporte] ?? "") ?? 0,
        cobrado: mapa.colEstado < 0 ? true : esCobrado((f[mapa.colEstado] ?? "").trim()),
        motivo: mapa.colMotivo >= 0 ? (f[mapa.colMotivo] ?? "").trim() : "",
      }))
      .filter((b) => b.clave || b.importe > 0);
    if (base.length === 0) {
      toast.error("No hay filas con datos en esas columnas");
      return;
    }
    startId(async () => {
      const r = await identificarVisa({ fecha: finMes(periodo), claves: base.map((b) => ({ clave: b.clave, tipo: mapa.tipo })) });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setItems(
        base.map((b, i) => ({
          ...b,
          persona: r.data[i]?.persona ?? null,
          via: r.data[i]?.via ?? null,
          candidatos: r.data[i]?.candidatos ?? [],
          ignorar: b.importe <= 0,
        }))
      );
      setSim(null);
    });
  }

  const cambiar = (idx: number, cambio: Partial<Item>) =>
    setItems((xs) => xs?.map((x) => (x.idx === idx ? { ...x, ...cambio } : x)) ?? null);

  // -------- Totales y validación --------
  const activos = (items ?? []).filter((i) => !i.ignorar);
  const cobrados = activos.filter((i) => i.cobrado);
  const rechazados = activos.filter((i) => !i.cobrado);
  const sinPersona = cobrados.filter((i) => !i.persona);
  const repetidos = new Set(
    cobrados
      .map((i) => i.persona?.id)
      .filter((id, k, arr): id is number => id != null && arr.indexOf(id) !== k)
  );
  const bruto = r2(cobrados.reduce((s, i) => s + i.importe, 0));
  const claveSim = JSON.stringify([periodo, fecha, montoComision, cobrados.map((c) => [c.persona?.id, c.importe])]);
  const simVigente = sim && sim.clave === claveSim ? sim.datos : null;
  const yaDebitados = simVigente?.personas.filter((p) => p.yaDebitado) ?? [];

  const problemas: string[] = [];
  if (!items) problemas.push("Identificá a las personas");
  if (cobrados.length === 0 && items) problemas.push("No hay débitos cobrados");
  if (sinPersona.length) problemas.push(`${sinPersona.length} cobro${sinPersona.length === 1 ? "" : "s"} sin identificar`);
  if (repetidos.size) problemas.push("Hay personas repetidas entre los cobrados");
  if (montoComision >= bruto && bruto > 0) problemas.push("La comisión no puede ser mayor que lo cobrado");
  if (!fecha || fecha > hoy) problemas.push("La fecha de acreditación no puede ser futura");

  function simular() {
    startSim(async () => {
      const r = await simularVisa({
        periodo,
        fecha,
        comision: montoComision,
        cobrados: cobrados.map((c) => ({ persona_id: c.persona!.id, importe: c.importe })),
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setSim({ clave: claveSim, datos: r.data });
    });
  }

  return (
    <div className="space-y-4">
      {/* 1. Datos */}
      <Panel titulo="1 · Liquidación" icono={CreditCard}>
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo etiqueta="Mes del débito">
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className={claseControl} />
          </Campo>
          <Campo etiqueta="Fecha de acreditación">
            <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className={claseControl} />
          </Campo>
          <Campo etiqueta="Cuenta donde se acreditó">
            <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className={claseControl}>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} · {c.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Comisión total ($)" ayuda="Lo que descontó Visa (con IVA).">
            <input inputMode="decimal" value={comision} onChange={(e) => setComision(e.target.value)} placeholder="0,00" className={cn(claseControl, "text-right tabular-nums")} />
          </Campo>
        </div>
      </Panel>

      {/* 2. Archivo */}
      <Panel titulo="2 · Filas de la liquidación" icono={FileUp} delay={0.04}>
        <div className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => archivoRef.current?.click()}
              className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-linea bg-superficie/40 p-4 text-sm text-muted-foreground transition-colors hover:border-bordo-200 hover:text-bordo-800"
            >
              {leyendo ? <Loader2 className="size-6 animate-spin" /> : <FileUp className="size-6" />}
              <span className="font-medium">Subir CSV o Excel</span>
              <span className="text-[11px]">{tabla?.nombre ?? "Las columnas se eligen después"}</span>
            </motion.button>
            <input
              ref={archivoRef}
              type="file"
              accept=".csv,.txt,.xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && leerArchivo(e.target.files[0])}
            />
            <div className="space-y-2">
              <textarea
                value={pegado}
                onChange={(e) => setPegado(e.target.value)}
                rows={4}
                placeholder={"O pegá las filas (de Excel o texto):\ncédula;importe;estado;motivo"}
                className={cn(claseControl, "h-auto py-2 font-mono text-xs")}
              />
              <Boton variante="secundario" className="h-8 px-3 text-xs" onClick={leerPegado} disabled={!pegado.trim()}>
                <ClipboardPaste className="size-3.5" />
                Usar lo pegado
              </Boton>
            </div>
          </div>

          <AnimatePresence>
            {tabla && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={easeSmooth} className="space-y-3">
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <Pastilla>{datos.length} filas</Pastilla>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={encabezado} onChange={(e) => setEncabezado(e.target.checked)} className="size-4 accent-bordo-800" />
                    La primera fila son los títulos
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <Campo etiqueta="Identificación">
                    <SelectorColumna valor={mapa.colId} encabezados={encabezados} onChange={(v) => setMapa((m) => ({ ...m, colId: v }))} />
                  </Campo>
                  <Campo etiqueta="Es…">
                    <select value={mapa.tipo} onChange={(e) => setMapa((m) => ({ ...m, tipo: e.target.value as TipoClave }))} className={claseControl}>
                      <option value="cedula">Cédula (socio o titular)</option>
                      <option value="ultimos4">Últimos 4 de la tarjeta</option>
                    </select>
                  </Campo>
                  <Campo etiqueta="Importe">
                    <SelectorColumna valor={mapa.colImporte} encabezados={encabezados} onChange={(v) => setMapa((m) => ({ ...m, colImporte: v }))} />
                  </Campo>
                  <Campo etiqueta="Estado">
                    <SelectorColumna valor={mapa.colEstado} encabezados={encabezados} opcional="Todas cobradas" onChange={(v) => setMapa((m) => ({ ...m, colEstado: v }))} />
                  </Campo>
                  <Campo etiqueta="Motivo del rechazo">
                    <SelectorColumna valor={mapa.colMotivo} encabezados={encabezados} opcional="Sin motivo" onChange={(v) => setMapa((m) => ({ ...m, colMotivo: v }))} />
                  </Campo>
                </div>
                {valoresEstado.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="px-0.5 text-[10px] uppercase tracking-editorial text-muted-foreground">Qué valores del estado son cobrados</span>
                    <div className="flex flex-wrap gap-1.5">
                      {valoresEstado.slice(0, 20).map((v) => {
                        const on = esCobrado(v);
                        return (
                          <motion.button
                            key={v || "(vacío)"}
                            type="button"
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setCobradoSi((s) => ({ ...s, [v]: !on }))}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                              on ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"
                            )}
                          >
                            {on ? <CheckCircle2 className="size-3" /> : <XCircle className="size-3" />}
                            {v || "(vacío)"}
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="max-w-full overflow-x-auto rounded-xl border border-linea">
                  <table className="w-full text-xs">
                    <thead className="bg-superficie/60">
                      <tr>
                        {encabezados.map((h, i) => (
                          <th key={i} className={cn("px-2 py-1.5 text-left font-medium whitespace-nowrap", [mapa.colId, mapa.colImporte, mapa.colEstado, mapa.colMotivo].includes(i) ? "text-bordo-800" : "text-muted-foreground")}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-linea">
                      {datos.slice(0, 4).map((f, k) => (
                        <tr key={k}>
                          {encabezados.map((_, i) => (
                            <td key={i} className="px-2 py-1 whitespace-nowrap tabular-nums">
                              {f[i]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Boton onClick={identificar} pendiente={identificando}>
                  {!identificando && <UserCheck className="size-4" />}
                  Identificar personas
                </Boton>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Panel>

      {/* 3. Identificación */}
      <AnimatePresence>
        {items && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={easeSmooth}>
            <Panel
              titulo="3 · Personas"
              icono={UserCheck}
              accion={
                <div className="flex flex-wrap gap-1.5">
                  <Pastilla tono="bueno">{cobrados.length} cobrados</Pastilla>
                  <Pastilla tono="alerta">{rechazados.length} rechazados</Pastilla>
                  {sinPersona.length > 0 && <Pastilla tono="alerta">{sinPersona.length} sin identificar</Pastilla>}
                </div>
              }
            >
              <ul className="divide-y divide-linea">
                {items.map((it, i) => {
                  const repetido = it.cobrado && it.persona && repetidos.has(it.persona.id) && !it.ignorar;
                  const falta = it.cobrado && !it.persona && !it.ignorar;
                  return (
                    <motion.li
                      key={it.idx}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: Math.min(i, 25) * 0.015 }}
                      className={cn(
                        "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 px-4 py-2.5 text-sm sm:grid-cols-[8rem_minmax(0,1fr)_7rem_7rem_auto]",
                        it.ignorar && "opacity-50",
                        (falta || repetido) && "bg-rose-50/50"
                      )}
                    >
                      <div className="font-mono text-xs tabular-nums">{it.clave || "—"}</div>
                      <div className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:row-start-auto">
                        {it.persona ? (
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate">{nombrePersona(it.persona)}</span>
                            <span className="shrink-0 text-[11px] text-muted-foreground">{it.via ? VIA[it.via] : ""}</span>
                            <button type="button" onClick={() => cambiar(it.idx, { persona: null, via: null })} className="shrink-0 text-[11px] text-bordo-800 hover:underline">
                              cambiar
                            </button>
                            {repetido && <span className="shrink-0 text-[11px] text-rose-700">repetida</span>}
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {it.candidatos.length > 1 && (
                              <div className="flex flex-wrap gap-1">
                                {it.candidatos.map((c) => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => cambiar(it.idx, { persona: c, via: "tarjeta" })}
                                    className="rounded-full border border-linea px-2 py-0.5 text-[11px] hover:border-bordo-200 hover:bg-bordo-50"
                                  >
                                    {nombrePersona(c)}
                                  </button>
                                ))}
                              </div>
                            )}
                            <BuscadorPersona compacto valor={null} onElegir={(p) => p && cambiar(it.idx, { persona: p, via: "manual" })} placeholder={it.cobrado ? "Buscar a quién corresponde…" : "Opcional en un rechazo"} />
                          </div>
                        )}
                      </div>
                      <div className="text-right tabular-nums">{formatImporte(it.importe)}</div>
                      <button
                        type="button"
                        onClick={() => cambiar(it.idx, { cobrado: !it.cobrado })}
                        className={cn(
                          "justify-self-end rounded-full border px-2 py-0.5 text-[11px] transition-colors sm:justify-self-start",
                          it.cobrado ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"
                        )}
                        title="Cambiar cobrado / rechazado"
                      >
                        {it.cobrado ? "Cobrado" : "Rechazado"}
                      </button>
                      <label className="flex items-center gap-1.5 justify-self-end text-[11px] text-muted-foreground">
                        <input type="checkbox" checked={it.ignorar} onChange={(e) => cambiar(it.idx, { ignorar: e.target.checked })} className="size-3.5 accent-bordo-800" />
                        Ignorar
                      </label>
                    </motion.li>
                  );
                })}
              </ul>
            </Panel>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. Previsualización */}
      <AnimatePresence>
        {items && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ ...easeSmooth, delay: 0.05 }}>
            <Panel titulo="4 · Antes de aplicar" icono={Scale}>
              <div className="space-y-4 p-4">
                <div className="grid grid-cols-3 gap-3">
                  <Numero etiqueta="Bruto" valor={bruto} />
                  <Numero etiqueta="Comisión" valor={montoComision} />
                  <Numero etiqueta="Neto al banco" valor={r2(bruto - montoComision)} fuerte />
                </div>
                <Explicacion>
                  Bruto: suma de los débitos cobrados. Neto: lo que tiene que haber entrado al banco. Los rechazos ({rechazados.length},{" "}
                  {formatImporte(rechazados.reduce((s, r) => s + r.importe, 0))}) se registran pero la deuda sigue.
                </Explicacion>

                {problemas.length > 0 ? (
                  <Aviso titulo="Falta resolver">
                    {problemas.map((p) => (
                      <div key={p}>{p}</div>
                    ))}
                  </Aviso>
                ) : (
                  <Boton variante="secundario" onClick={simular} pendiente={simulando}>
                    {!simulando && <Scale className="size-4" />}
                    {sim ? "Recalcular reparto" : "Calcular reparto"}
                  </Boton>
                )}

                <AnimatePresence>
                  {simVigente && problemas.length === 0 && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                      {yaDebitados.length > 0 && (
                        <Aviso titulo={`${yaDebitados.length} persona${yaDebitados.length === 1 ? "" : "s"} ya tienen débito aplicado en ${nombrePeriodo(periodo)}`}>
                          La base va a rechazar la liquidación: ignorá esas filas o anulá la liquidación anterior.
                        </Aviso>
                      )}
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-linea p-3">
                          <div className="mb-2 text-[10px] uppercase tracking-editorial text-muted-foreground">Reparto de la comisión</div>
                          {simVigente.comisiones.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Sin comisión.</p>
                          ) : (
                            <ul className="space-y-1.5 text-sm">
                              {simVigente.comisiones.map((k) => (
                                <li key={k.nombre} className="flex items-baseline justify-between gap-3">
                                  <span className="min-w-0 truncate">
                                    {k.nombre}
                                    {k.disciplina_id && (
                                      <span className="ml-1 text-[11px] text-muted-foreground">
                                        {k.porcentaje}% sobre {formatImporte(k.cobrado)}
                                      </span>
                                    )}
                                  </span>
                                  <span className="tabular-nums">{formatImporte(k.importe)}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          <Explicacion className="mt-2">
                            A cada disciplina, la parte de la comisión proporcional a lo cobrado de sus cuotas por su porcentaje; el resto es del club.
                          </Explicacion>
                        </div>
                        <div className="rounded-2xl border border-linea p-3">
                          <div className="mb-2 text-[10px] uppercase tracking-editorial text-muted-foreground">Sobre las cuotas</div>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span>Se aplica a cuotas</span>
                              <span className="tabular-nums">{formatImporte(simVigente.personas.reduce((s, p) => s + p.aplicado, 0))}</span>
                            </div>
                            <div className="flex justify-between text-sky-800">
                              <span>Queda como saldo a favor</span>
                              <span className="tabular-nums">{formatImporte(simVigente.personas.reduce((s, p) => s + p.aFavor, 0))}</span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {simVigente.personas.filter((p) => p.aFavor > 0).length} persona(s) debitadas por más de lo que deben.
                            </div>
                          </div>
                        </div>
                      </div>
                      <Boton onClick={() => setConfirmar(true)} disabled={yaDebitados.length > 0}>
                        <CreditCard className="size-4" />
                        Aplicar liquidación
                      </Boton>
                    </motion.div>
                  )}
                </AnimatePresence>
                {sim && !simVigente && problemas.length === 0 && (
                  <p className="flex items-center gap-1.5 text-xs text-dorado-800">
                    <AlertTriangle className="size-3.5" /> Cambiaste datos: recalculá el reparto antes de aplicar.
                  </p>
                )}
              </div>
            </Panel>
          </motion.div>
        )}
      </AnimatePresence>

      <DialogoAccion
        open={confirmar}
        onOpenChange={setConfirmar}
        icono={CreditCard}
        titulo={`Aplicar el débito de ${nombrePeriodo(periodo)}`}
        descripcion={
          <span>
            {cobrados.length} cobros por {formatImporte(bruto, "UYU")}, comisión {formatImporte(montoComision, "UYU")}, neto{" "}
            {formatImporte(r2(bruto - montoComision), "UYU")} al banco el {fecha.split("-").reverse().join("/")}. {rechazados.length} rechazos
            quedan registrados. Todo se aplica junto, con un asiento.
          </span>
        }
        textoAccion="Aplicar"
        mensaje="Liquidación aplicada"
        alTerminar={() => {
          setItems(null);
          setTabla(null);
          setSim(null);
          setPegado("");
          setComision("");
          router.refresh();
          alAplicar();
        }}
        ejecutar={async () => {
          const r = await aplicarLiquidacionVisa({
            periodo,
            fecha,
            comision: montoComision,
            cuenta_id: cuentaId || null,
            archivo: tabla?.nombre ?? null,
            cobrados: cobrados.map((c) => ({ persona_id: c.persona!.id, importe: c.importe })),
            rechazados: rechazados.map((c) => ({
              persona_id: c.persona?.id ?? null,
              documento: c.persona ? null : c.clave || "sin identificar",
              importe: c.importe,
              motivo: c.motivo || null,
            })),
          });
          return r.ok ? { ok: true } : r;
        }}
      />
    </div>
  );
}

function SelectorColumna({
  valor,
  encabezados,
  onChange,
  opcional,
}: {
  valor: number;
  encabezados: string[];
  onChange: (v: number) => void;
  opcional?: string;
}) {
  return (
    <select value={valor} onChange={(e) => onChange(Number(e.target.value))} className={claseControl}>
      {opcional && <option value={-1}>{opcional}</option>}
      {encabezados.map((h, i) => (
        <option key={i} value={i}>
          {h || `Columna ${i + 1}`}
        </option>
      ))}
    </select>
  );
}

function Numero({ etiqueta, valor, fuerte }: { etiqueta: string; valor: number; fuerte?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-3", fuerte ? "border-emerald-200 bg-emerald-50/50" : "border-linea")}>
      <div className="text-[10px] uppercase tracking-editorial text-muted-foreground">{etiqueta}</div>
      <ImporteAnimado valor={valor} className={cn("font-heading text-base sm:text-lg", fuerte && "text-emerald-800")} />
    </div>
  );
}
