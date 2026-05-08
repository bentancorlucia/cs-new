"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Link2,
  Plus,
  EyeOff,
  HelpCircle,
  Search,
} from "lucide-react";
import { formatearMoneda, type Moneda } from "@/lib/tesoreria/conversion";

type CuentaCompacta = {
  id: number;
  nombre: string;
  tipo: string;
  moneda: Moneda;
  banco: string | null;
  modulo: string | null;
};

type Candidato = {
  id: number;
  fecha: string;
  descripcion: string;
  monto: number;
  tipo: "ingreso" | "egreso";
  referencia: string | null;
  origen_tipo: string | null;
  origen_id: number | null;
  categoria_nombre: string | null;
};

type Linea = {
  indice: number;
  fecha: string;
  descripcion: string;
  referencia: string | null;
  tipo: "ingreso" | "egreso";
  monto: number;
  hash_dedupe: string;
  saldo_post: number | null;
  estado: "duplicado_extracto" | "match_unico" | "match_ambiguo" | "sin_match";
  candidatos: Candidato[];
  sugerido_id: number | null;
  requiere_verificacion: boolean;
};

type Analisis = {
  archivo_hash: string;
  archivo_nombre: string;
  ya_importado: boolean;
  extracto_existente_id: number | null;
  cuenta: { id: number; nombre: string; moneda: Moneda; banco: string | null };
  fecha_desde: string | null;
  fecha_hasta: string | null;
  saldo_inicial: number | null;
  saldo_final: number | null;
  total_lineas: number;
  lineas: Linea[];
};

type Decision =
  | { accion: "match"; movimiento_id: number }
  | { accion: "crear_nuevo" }
  | { accion: "ignorar" };

function fmtFecha(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("es-UY", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

export function ConciliacionItauModal({
  open,
  onClose,
  cuentas,
  onCompleted,
}: {
  open: boolean;
  onClose: () => void;
  cuentas: CuentaCompacta[];
  onCompleted: () => void;
}) {
  const cuentasBancarias = useMemo(
    () => cuentas.filter((c) => c.tipo === "bancaria"),
    [cuentas]
  );
  const cuentaTiendaDefault = useMemo(() => {
    const itauTienda = cuentasBancarias.find(
      (c) => c.modulo === "tienda" && (c.banco ?? "").toLowerCase().includes("ita")
    );
    if (itauTienda) return itauTienda;
    const itau = cuentasBancarias.find((c) => (c.banco ?? "").toLowerCase().includes("ita"));
    if (itau) return itau;
    const tienda = cuentasBancarias.find((c) => c.modulo === "tienda");
    if (tienda) return tienda;
    return cuentasBancarias[0] ?? null;
  }, [cuentasBancarias]);

  const [cuentaId, setCuentaId] = useState<number | null>(cuentaTiendaDefault?.id ?? null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [decisiones, setDecisiones] = useState<Map<number, Decision>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{
    creados: number;
    matcheados: number;
    ignorados: number;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setCuentaId(cuentaTiendaDefault?.id ?? null);
      setArchivo(null);
      setAnalisis(null);
      setDecisiones(new Map());
      setError(null);
      setResultado(null);
      setLoading(false);
    }
  }, [open, cuentaTiendaDefault]);

  const cuentaSeleccionada = cuentas.find((c) => c.id === cuentaId) ?? null;

  const onAnalizar = async () => {
    if (!archivo || !cuentaId) return;
    setLoading(true);
    setError(null);
    const fd = new FormData();
    fd.append("cuenta_id", String(cuentaId));
    fd.append("archivo", archivo);
    const res = await fetch("/api/tesoreria/extractos/conciliar", {
      method: "POST",
      body: fd,
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo analizar el archivo");
      return;
    }
    if (data.ya_importado) {
      setError("Este extracto ya fue importado anteriormente.");
      return;
    }
    setAnalisis(data);
    // Pre-poblar decisiones con sugerencias automáticas
    // Las líneas que requieren verificación quedan SIN decisión, fuerzan al usuario a elegir
    const inicial = new Map<number, Decision>();
    for (const l of data.lineas as Linea[]) {
      if (l.estado === "duplicado_extracto") {
        inicial.set(l.indice, { accion: "ignorar" });
      } else if (l.requiere_verificacion) {
        // ambigüedades o líneas que comparten fecha+monto: el usuario decide
        continue;
      } else if (l.estado === "match_unico" && l.sugerido_id) {
        inicial.set(l.indice, { accion: "match", movimiento_id: l.sugerido_id });
      } else if (l.estado === "sin_match") {
        inicial.set(l.indice, { accion: "crear_nuevo" });
      }
    }
    setDecisiones(inicial);
  };

  const setDecision = (indice: number, d: Decision) => {
    const next = new Map(decisiones);
    next.set(indice, d);
    setDecisiones(next);
  };

  const conteos = useMemo(() => {
    if (!analisis)
      return { matches: 0, nuevos: 0, ignorar: 0, verificacionesPendientes: 0 };
    let matches = 0;
    let nuevos = 0;
    let ignorar = 0;
    let verificacionesPendientes = 0;
    for (const l of analisis.lineas) {
      const d = decisiones.get(l.indice);
      if (!d) {
        if (l.requiere_verificacion) verificacionesPendientes++;
        continue;
      }
      if (d.accion === "match") matches++;
      else if (d.accion === "crear_nuevo") nuevos++;
      else if (d.accion === "ignorar") ignorar++;
    }
    return { matches, nuevos, ignorar, verificacionesPendientes };
  }, [analisis, decisiones]);

  const onConfirmar = async () => {
    if (!archivo || !cuentaId || !analisis) return;
    if (conteos.verificacionesPendientes > 0) return;
    setLoading(true);
    setError(null);
    const decisionesArray = Array.from(decisiones.entries()).map(([indice, d]) => {
      if (d.accion === "match") {
        return { indice, accion: "match", match_movimiento_id: d.movimiento_id };
      }
      return { indice, accion: d.accion };
    });
    const fd = new FormData();
    fd.append("cuenta_id", String(cuentaId));
    fd.append("archivo", archivo);
    fd.append("decisiones", JSON.stringify(decisionesArray));
    const res = await fetch("/api/tesoreria/extractos/conciliar/confirmar", {
      method: "POST",
      body: fd,
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo confirmar la conciliación");
      return;
    }
    setResultado({
      creados: data.creados,
      matcheados: data.matcheados,
      ignorados: data.ignorados,
    });
    onCompleted();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-xl border border-linea overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-linea">
              <div>
                <div className="text-xs uppercase tracking-editorial text-muted-foreground font-heading">
                  Conciliación bancaria
                </div>
                <div className="font-heading text-lg text-bordo-900">
                  Subir extracto ITAÚ
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-superficie"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {resultado ? (
                <ResultadoStep resultado={resultado} onClose={onClose} />
              ) : analisis ? (
                <RevisionStep
                  analisis={analisis}
                  decisiones={decisiones}
                  setDecision={setDecision}
                  conteos={conteos}
                />
              ) : (
                <UploadStep
                  cuentas={cuentasBancarias}
                  cuentaId={cuentaId}
                  setCuentaId={setCuentaId}
                  archivo={archivo}
                  setArchivo={setArchivo}
                  cuentaSeleccionada={cuentaSeleccionada}
                />
              )}

              {error && (
                <div className="mx-5 mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  <AlertCircle className="size-4 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
            </div>

            {!resultado && (
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-linea bg-superficie">
                {analisis ? (
                  <>
                    <div className="text-xs text-muted-foreground">
                      {conteos.matches} matches · {conteos.nuevos} nuevos · {conteos.ignorar}{" "}
                      ignorados
                      {conteos.verificacionesPendientes > 0 && (
                        <span className="ml-2 text-amber-700 font-medium">
                          {conteos.verificacionesPendientes} para verificar
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setAnalisis(null);
                          setDecisiones(new Map());
                          setError(null);
                        }}
                        className="px-3 py-2 text-sm rounded-lg border border-linea text-muted-foreground hover:text-foreground hover:bg-white"
                      >
                        Volver
                      </button>
                      <button
                        onClick={onConfirmar}
                        disabled={loading || conteos.verificacionesPendientes > 0}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-bordo-700 text-white font-medium hover:bg-bordo-900 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loading ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-4" />
                        )}
                        Confirmar conciliación
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-xs text-muted-foreground">
                      El sistema buscará matches contra movimientos no conciliados de la cuenta
                      seleccionada.
                    </div>
                    <button
                      onClick={onAnalizar}
                      disabled={!archivo || !cuentaId || loading}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-bordo-700 text-white font-medium hover:bg-bordo-900 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Upload className="size-4" />
                      )}
                      Analizar extracto
                    </button>
                  </>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function UploadStep({
  cuentas,
  cuentaId,
  setCuentaId,
  archivo,
  setArchivo,
  cuentaSeleccionada,
}: {
  cuentas: CuentaCompacta[];
  cuentaId: number | null;
  setCuentaId: (id: number | null) => void;
  archivo: File | null;
  setArchivo: (f: File | null) => void;
  cuentaSeleccionada: CuentaCompacta | null;
}) {
  return (
    <div className="p-5 space-y-4">
      {cuentas.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No se encontró ninguna cuenta bancaria. Crear una desde{" "}
          <span className="font-medium">Tesorería → Cuentas</span> antes de conciliar.
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-editorial text-muted-foreground font-heading">
              Cuenta destino
            </label>
            <select
              value={cuentaId ?? ""}
              onChange={(e) => setCuentaId(e.target.value ? Number(e.target.value) : null)}
              className="w-full text-sm border border-linea rounded-lg px-3 py-2 bg-white outline-none focus:border-bordo-700"
            >
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({c.moneda}){c.modulo ? ` · ${c.modulo}` : ""}
                </option>
              ))}
            </select>
            {cuentaSeleccionada && (
              <p className="text-xs text-muted-foreground">
                Moneda: {cuentaSeleccionada.moneda}
                {cuentaSeleccionada.banco ? ` · Banco: ${cuentaSeleccionada.banco}` : ""}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-editorial text-muted-foreground font-heading">
              Archivo CSV de ITAÚ
            </label>
            <label
              htmlFor="conciliacion-archivo"
              className="flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-dashed border-linea hover:border-bordo-700 cursor-pointer transition-colors"
            >
              <FileText className="size-5 text-muted-foreground" />
              <div className="flex-1 text-sm">
                {archivo ? (
                  <span className="text-foreground font-medium">{archivo.name}</span>
                ) : (
                  <span className="text-muted-foreground">
                    Seleccionar archivo CSV exportado desde el portal de ITAÚ…
                  </span>
                )}
              </div>
              <input
                id="conciliacion-archivo"
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <div className="rounded-lg bg-superficie border border-linea p-3 text-xs text-muted-foreground space-y-1">
            <div className="flex items-center gap-2 text-foreground font-medium">
              <HelpCircle className="size-3.5" />
              ¿Cómo funciona?
            </div>
            <ol className="list-decimal list-inside space-y-0.5 ml-1">
              <li>El sistema parsea el extracto y compara cada línea con los movimientos sin conciliar de la cuenta.</li>
              <li>Los matches automáticos (mismo monto, fecha cercana) se sugieren para conciliar sin duplicar.</li>
              <li>Las líneas sin match se crean como movimientos nuevos para clasificar después.</li>
            </ol>
          </div>
        </>
      )}
    </div>
  );
}

function RevisionStep({
  analisis,
  decisiones,
  setDecision,
  conteos,
}: {
  analisis: Analisis;
  decisiones: Map<number, Decision>;
  setDecision: (i: number, d: Decision) => void;
  conteos: {
    matches: number;
    nuevos: number;
    ignorar: number;
    verificacionesPendientes: number;
  };
}) {
  const moneda = analisis.cuenta.moneda;

  return (
    <div className="p-5 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Matches" valor={conteos.matches} color="emerald" />
        <Stat label="Nuevos" valor={conteos.nuevos} color="bordo" />
        <Stat label="Ignorados" valor={conteos.ignorar} color="muted" />
        <Stat
          label="Para verificar"
          valor={conteos.verificacionesPendientes}
          color={conteos.verificacionesPendientes > 0 ? "amber" : "muted"}
        />
      </div>

      <div className="rounded-lg bg-superficie border border-linea p-3 text-xs text-muted-foreground">
        Período: {analisis.fecha_desde ? fmtFecha(analisis.fecha_desde) : "—"} al{" "}
        {analisis.fecha_hasta ? fmtFecha(analisis.fecha_hasta) : "—"}
        {analisis.saldo_inicial !== null && (
          <span className="ml-3">
            Saldo inicial: {formatearMoneda(analisis.saldo_inicial, moneda)}
          </span>
        )}
        {analisis.saldo_final !== null && (
          <span className="ml-3">
            Saldo final: {formatearMoneda(analisis.saldo_final, moneda)}
          </span>
        )}
      </div>

      <div className="rounded-xl border border-linea overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-editorial text-muted-foreground bg-superficie">
            <tr>
              <th className="text-left px-3 py-2 font-heading">Fecha</th>
              <th className="text-left px-3 py-2 font-heading">Concepto ITAÚ</th>
              <th className="text-right px-3 py-2 font-heading">Monto</th>
              <th className="text-left px-3 py-2 font-heading">Acción</th>
            </tr>
          </thead>
          <tbody>
            {analisis.lineas.map((linea) => (
              <FilaLinea
                key={linea.indice}
                linea={linea}
                decision={decisiones.get(linea.indice)}
                setDecision={(d) => setDecision(linea.indice, d)}
                moneda={moneda}
                cuentaId={analisis.cuenta.id}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilaLinea({
  linea,
  decision,
  setDecision,
  moneda,
  cuentaId,
}: {
  linea: Linea;
  decision: Decision | undefined;
  setDecision: (d: Decision) => void;
  moneda: Moneda;
  cuentaId: number;
}) {
  const esIngreso = linea.tipo === "ingreso";
  const isAmbiguo = linea.estado === "match_ambiguo";
  const isDuplicado = linea.estado === "duplicado_extracto";
  const necesitaVerificar = linea.requiere_verificacion && !decision;
  const [buscarOpen, setBuscarOpen] = useState(false);

  // Si el usuario eligió un match que NO está en candidatos (vino del buscador), guardamos info para mostrarlo
  const matchManual =
    decision?.accion === "match" &&
    !linea.candidatos.find((c) => c.id === decision.movimiento_id);

  return (
    <tr
      className={`border-t border-linea align-top ${
        necesitaVerificar ? "bg-amber-50/70" : ""
      }`}
    >
      <td className="px-3 py-2 text-muted-foreground tabular-nums whitespace-nowrap">
        {fmtFecha(linea.fecha)}
      </td>
      <td className="px-3 py-2 max-w-md">
        <div className="space-y-0.5">
          <div className="text-foreground">{linea.descripcion}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <BadgeEstado estado={linea.estado} />
            {linea.requiere_verificacion && (
              <span className="inline-flex items-center text-[11px] px-1.5 py-0.5 rounded-full border bg-amber-100 text-amber-800 border-amber-300 font-medium">
                Verificar (fecha+monto repetido)
              </span>
            )}
            {linea.referencia && (
              <span className="text-xs text-muted-foreground">Ref: {linea.referencia}</span>
            )}
          </div>
          {/* Candidatos visibles si ambiguo o si es match único, para que el usuario vea contra qué matchea */}
          {linea.candidatos.length > 0 && linea.estado !== "duplicado_extracto" && (
            <div className="mt-1.5 space-y-1">
              {linea.candidatos.map((c) => {
                const isSelected =
                  decision?.accion === "match" && decision.movimiento_id === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setDecision({ accion: "match", movimiento_id: c.id })}
                    className={`w-full text-left text-xs px-2 py-1.5 rounded-md border transition-colors ${
                      isSelected
                        ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                        : "border-linea bg-white text-muted-foreground hover:border-bordo-700"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">{c.descripcion}</span>
                      <span className="tabular-nums whitespace-nowrap">{fmtFecha(c.fecha)}</span>
                    </div>
                    {(c.categoria_nombre || c.origen_tipo) && (
                      <div className="text-[11px] mt-0.5">
                        {c.categoria_nombre && <span>{c.categoria_nombre}</span>}
                        {c.origen_tipo && (
                          <span className="ml-2">
                            {c.origen_tipo}
                            {c.origen_id ? ` #${c.origen_id}` : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {matchManual && decision?.accion === "match" && (
            <div className="mt-1.5 text-xs px-2 py-1.5 rounded-md border border-emerald-500 bg-emerald-50 text-emerald-900">
              <div className="flex items-center gap-1.5">
                <Link2 className="size-3" /> Linkeado manualmente al movimiento{" "}
                <span className="font-medium">#{decision.movimiento_id}</span>
              </div>
            </div>
          )}

          {!isDuplicado && (
            <div className="mt-1.5">
              <button
                onClick={() => setBuscarOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-linea bg-white text-muted-foreground hover:text-foreground hover:border-bordo-700"
              >
                <Search className="size-3" />
                {buscarOpen ? "Cerrar buscador" : "Buscar y linkear movimiento existente"}
              </button>
              {buscarOpen && (
                <BuscarMovimiento
                  cuentaId={cuentaId}
                  tipoLinea={linea.tipo}
                  moneda={moneda}
                  onPick={(id) => {
                    setDecision({ accion: "match", movimiento_id: id });
                    setBuscarOpen(false);
                  }}
                />
              )}
            </div>
          )}
        </div>
      </td>
      <td
        className={`px-3 py-2 text-right tabular-nums font-medium whitespace-nowrap ${
          esIngreso ? "text-emerald-700" : "text-rose-700"
        }`}
      >
        {esIngreso ? "+" : "-"}
        {formatearMoneda(linea.monto, moneda)}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <div className="flex flex-col gap-1">
          {!isDuplicado && (
            <BotonAccion
              icon={<Plus className="size-3" />}
              label="Crear nuevo"
              activo={decision?.accion === "crear_nuevo"}
              onClick={() => setDecision({ accion: "crear_nuevo" })}
            />
          )}
          <BotonAccion
            icon={<EyeOff className="size-3" />}
            label="Ignorar"
            activo={decision?.accion === "ignorar"}
            onClick={() => setDecision({ accion: "ignorar" })}
          />
          {isAmbiguo && !decision && (
            <span className="text-[11px] text-amber-700 italic">Elegir candidato →</span>
          )}
          {decision?.accion === "match" && (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
              <Link2 className="size-3" /> Vinculado
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

function BuscarMovimiento({
  cuentaId,
  tipoLinea,
  moneda,
  onPick,
}: {
  cuentaId: number;
  tipoLinea: "ingreso" | "egreso";
  moneda: Moneda;
  onPick: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"" | "ingreso" | "egreso">(tipoLinea);
  const [resultados, setResultados] = useState<
    Array<{
      id: number;
      fecha: string;
      descripcion: string;
      monto: number | string;
      tipo: "ingreso" | "egreso";
      referencia: string | null;
      categorias_financieras?: { nombre: string } | null;
    }>
  >([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("cuenta_id", String(cuentaId));
    params.set("sin_extracto", "1");
    if (filtroTipo) params.set("tipo", filtroTipo);
    if (query) params.set("search", query);
    params.set("limit", "20");
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/tesoreria/movimientos?${params}`)
        .then((r) => r.json())
        .then((d) => {
          setResultados(d.movimientos ?? []);
          setLoading(false);
        });
    }, 250);
    return () => clearTimeout(t);
  }, [cuentaId, query, filtroTipo]);

  return (
    <div className="mt-2 rounded-md border border-linea bg-superficie p-2 space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por descripción, alias o referencia…"
            className="w-full pl-7 pr-2 py-1 text-xs border border-linea rounded-md bg-white outline-none focus:border-bordo-700"
          />
        </div>
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value as "" | "ingreso" | "egreso")}
          className="text-xs border border-linea rounded-md px-2 py-1 bg-white outline-none focus:border-bordo-700"
        >
          <option value="">Todos</option>
          <option value="ingreso">Ingresos</option>
          <option value="egreso">Egresos</option>
        </select>
      </div>
      <div className="max-h-56 overflow-y-auto space-y-1">
        {loading ? (
          <div className="text-xs text-muted-foreground py-3 text-center">Buscando…</div>
        ) : resultados.length === 0 ? (
          <div className="text-xs text-muted-foreground py-3 text-center">
            Sin resultados.
          </div>
        ) : (
          resultados.map((r) => {
            const monto = Number(r.monto);
            const esIng = r.tipo === "ingreso";
            return (
              <button
                key={r.id}
                onClick={() => onPick(r.id)}
                className="w-full text-left text-xs px-2 py-1.5 rounded-md border border-linea bg-white hover:border-bordo-700 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground line-clamp-1">
                    {r.descripcion}
                  </span>
                  <span
                    className={`tabular-nums whitespace-nowrap ${
                      esIng ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {esIng ? "+" : "-"}
                    {formatearMoneda(monto, moneda)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mt-0.5">
                  <span>
                    {fmtFecha(r.fecha)}
                    {r.categorias_financieras?.nombre
                      ? ` · ${r.categorias_financieras.nombre}`
                      : ""}
                  </span>
                  {r.referencia && <span>Ref: {r.referencia}</span>}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function BotonAccion({
  icon,
  label,
  activo,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border transition-colors ${
        activo
          ? "border-bordo-700 bg-bordo-700 text-white"
          : "border-linea bg-white text-muted-foreground hover:text-foreground hover:border-bordo-700"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function BadgeEstado({ estado }: { estado: Linea["estado"] }) {
  const map: Record<Linea["estado"], { label: string; cls: string }> = {
    match_unico: {
      label: "Match único",
      cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    },
    match_ambiguo: {
      label: "Ambiguo",
      cls: "bg-amber-50 text-amber-700 border-amber-200",
    },
    sin_match: {
      label: "Sin match",
      cls: "bg-bordo-50 text-bordo-700 border-bordo-200",
    },
    duplicado_extracto: {
      label: "Duplicado",
      cls: "bg-superficie text-muted-foreground border-linea",
    },
  };
  const { label, cls } = map[estado];
  return (
    <span
      className={`inline-flex items-center text-[11px] px-1.5 py-0.5 rounded-full border ${cls}`}
    >
      {label}
    </span>
  );
}

function Stat({
  label,
  valor,
  color,
}: {
  label: string;
  valor: number;
  color: "emerald" | "bordo" | "amber" | "muted";
}) {
  const colorMap = {
    emerald: "text-emerald-700",
    bordo: "text-bordo-700",
    amber: "text-amber-700",
    muted: "text-muted-foreground",
  } as const;
  return (
    <div className="rounded-lg border border-linea bg-white px-3 py-2">
      <div className="text-[11px] uppercase tracking-editorial text-muted-foreground font-heading">
        {label}
      </div>
      <div className={`text-2xl font-heading tabular-nums ${colorMap[color]}`}>{valor}</div>
    </div>
  );
}

function ResultadoStep({
  resultado,
  onClose,
}: {
  resultado: { creados: number; matcheados: number; ignorados: number };
  onClose: () => void;
}) {
  return (
    <div className="p-8 flex flex-col items-center text-center gap-4">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300 }}
        className="size-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"
      >
        <CheckCircle2 className="size-7" />
      </motion.div>
      <div>
        <div className="font-heading text-lg text-bordo-900">Conciliación completada</div>
        <div className="text-sm text-muted-foreground mt-1">
          {resultado.matcheados} movimientos conciliados · {resultado.creados} nuevos creados
          {resultado.ignorados > 0 ? ` · ${resultado.ignorados} ignorados` : ""}
        </div>
      </div>
      <button
        onClick={onClose}
        className="px-4 py-2 text-sm rounded-lg bg-bordo-700 text-white font-medium hover:bg-bordo-900"
      >
        Cerrar
      </button>
    </div>
  );
}
