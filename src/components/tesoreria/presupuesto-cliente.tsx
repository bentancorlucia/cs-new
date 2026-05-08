"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
} from "recharts";
import { TrendingUp, TrendingDown, Lock, Sparkles, RotateCcw, ChevronRight, Check, Loader2 } from "lucide-react";
import { springSmooth } from "@/lib/motion";
import { Slider } from "@/components/ui/slider";
import { formatearMoneda, formatearMonedaCompacta, type Moneda } from "@/lib/tesoreria/conversion";
import {
  PERIODOS_POR_TIPO,
  nombrePeriodo,
  periodoActual,
  type TipoPeriodo,
} from "@/lib/tesoreria/presupuesto";

// Colores del club
const COLORS = {
  bordo: "#730d32",
  bordoSoft: "#730d3233",
  bordoLight: "#730d3266",
  amarillo: "#f7b643",
  amarilloSoft: "#f7b64333",
  amarilloLight: "#f7b64366",
  oscuro: "#1a1a1a",
  textoSec: "#6b7280",
  linea: "#f0ebe5",
};

type Categoria = {
  id: number;
  nombre: string;
  slug: string;
  tipo: "ingreso" | "egreso";
  padre_id: number | null;
  color: string | null;
};

type Row = {
  categoria_id: number;
  categoria_nombre: string;
  categoria_color: string | null;
  categoria_tipo: "ingreso" | "egreso";
  padre_id: number | null;
  tiene_hijos: boolean;
  nivel: number;
  presupuestado: number;
  ejecutado: number;
  diferencia: number;
  porcentaje: number;
  presupuesto_id: number | null;
};

type MesSerie = {
  anio: number;
  mes: number;
  label: string;
  ingreso_presupuestado: number;
  egreso_presupuestado: number;
  ingreso_ejecutado: number;
  egreso_ejecutado: number;
  resultado_presupuestado: number;
  resultado_ejecutado: number;
};

const TIPOS: TipoPeriodo[] = ["anual", "semestral", "cuatrimestral", "trimestral", "mensual"];

export function PresupuestoCliente({ categorias }: { categorias: Categoria[] }) {
  const hoy = new Date();
  const [tipo, setTipo] = useState<TipoPeriodo>("mensual");
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [numero, setNumero] = useState(periodoActual("mensual", hoy).numero);
  const [moneda, setMoneda] = useState<Moneda>("UYU");

  const [rows, setRows] = useState<Row[]>([]);
  const [meses, setMeses] = useState<MesSerie[]>([]);
  const [totales, setTotales] = useState<null | {
    ingreso_presupuestado: number;
    ingreso_ejecutado: number;
    egreso_presupuestado: number;
    egreso_ejecutado: number;
    resultado_presupuestado: number;
    resultado_ejecutado: number;
  }>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const [savingId, setSavingId] = useState<number | null>(null);
  const [lastSavedId, setLastSavedId] = useState<number | null>(null);
  const lastSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Slider único: magnitud de incertidumbre (0..50%). Aplica a ingresos y egresos.
  const [variacion, setVariacion] = useState(0);

  useEffect(() => {
    const np = periodoActual(tipo, hoy);
    if (numero > PERIODOS_POR_TIPO[tipo]) {
      setNumero(np.numero);
    }
    if (tipo === "mensual") {
      setVariacion(0);
    }
  }, [tipo]);

  const cargar = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) setLoading(true);
      const params = new URLSearchParams({
        tipo_periodo: tipo,
        anio: String(anio),
        periodo_numero: String(numero),
        moneda,
      });
      const res = await fetch(`/api/tesoreria/presupuestos/ejecucion?${params}`);
      const data = await res.json();
      setRows(data.rows ?? []);
      setMeses(data.meses ?? []);
      setTotales(data.totales ?? null);
      if (!silent) setLoading(false);
    },
    [tipo, anio, numero, moneda]
  );

  useEffect(() => {
    cargar();
  }, [cargar]);

  const persistir = useCallback(
    async (categoriaId: number, monto: number) => {
      if (tipo !== "mensual") return;
      setSavingId(categoriaId);
      try {
        await fetch("/api/tesoreria/presupuestos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            anio,
            mes: numero,
            categoria_id: categoriaId,
            monto,
            moneda,
          }),
        });
        setLastSavedId(categoriaId);
        if (lastSavedTimer.current) clearTimeout(lastSavedTimer.current);
        lastSavedTimer.current = setTimeout(() => setLastSavedId(null), 1500);
        await cargar({ silent: true });
      } finally {
        setSavingId((prev) => (prev === categoriaId ? null : prev));
      }
    },
    [tipo, anio, numero, moneda, cargar]
  );

  const onAutoSave = useCallback(
    (categoriaId: number, monto: number) => {
      startTransition(() => {
        void persistir(categoriaId, monto);
      });
    },
    [persistir]
  );

  const ingresos = rows.filter((r) => r.categoria_tipo === "ingreso");
  const egresos = rows.filter((r) => r.categoria_tipo === "egreso");

  const ing = variacion / 100;
  const egr = variacion / 100;
  const escenarioActivo = variacion !== 0;

  // Escenarios (sobre cualquier monto presupuestado):
  // - max (optimista resultado): +ing en ingresos, -egr en egresos
  // - min (pesimista resultado): -ing en ingresos, +egr en egresos
  const escenarios = useMemo(() => {
    if (!totales) return null;
    const ip = totales.ingreso_presupuestado;
    const ep = totales.egreso_presupuestado;
    return {
      normal: { ingreso: ip, egreso: ep, resultado: ip - ep },
      max: {
        ingreso: ip * (1 + ing),
        egreso: ep * (1 - egr),
        resultado: ip * (1 + ing) - ep * (1 - egr),
      },
      min: {
        ingreso: ip * (1 - ing),
        egreso: ep * (1 + egr),
        resultado: ip * (1 - ing) - ep * (1 + egr),
      },
    };
  }, [totales, ing, egr]);

  const chartMensual = useMemo(() => {
    return meses.map((m) => {
      const ip = m.ingreso_presupuestado;
      const ep = m.egreso_presupuestado;
      const resN = ip - ep;
      const resMax = ip * (1 + ing) - ep * (1 - egr);
      const resMin = ip * (1 - ing) - ep * (1 + egr);
      return {
        label: m.label,
        ing_p: ip,
        egr_p: ep,
        ing_e: m.ingreso_ejecutado,
        egr_e: m.egreso_ejecutado,
        res_n: resN,
        res_max: resMax,
        res_min: resMin,
        // Banda min..max para el Area
        banda: [resMin, resMax],
        res_e: m.resultado_ejecutado,
      };
    });
  }, [meses, ing, egr]);

  const periodosDisp = PERIODOS_POR_TIPO[tipo];
  const editable = tipo === "mensual";

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white border border-linea p-3">
        <div className="inline-flex rounded-full border border-linea bg-superficie p-1 text-xs">
          {TIPOS.map((t) => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              className={`relative px-3 py-1.5 rounded-full font-heading transition-colors capitalize ${
                tipo === t ? "text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tipo === t && (
                <motion.span
                  layoutId="presup-tipo"
                  className="absolute inset-0 rounded-full bg-bordo-800"
                  transition={springSmooth}
                />
              )}
              <span className="relative">{t}</span>
            </button>
          ))}
        </div>

        <select
          value={anio}
          onChange={(e) => setAnio(Number(e.target.value))}
          className="text-sm border border-linea rounded-lg px-3 py-1.5 outline-none focus:border-bordo-700"
        >
          {[hoy.getFullYear() - 1, hoy.getFullYear(), hoy.getFullYear() + 1].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        {periodosDisp > 1 && (
          <select
            value={numero}
            onChange={(e) => setNumero(Number(e.target.value))}
            className="text-sm border border-linea rounded-lg px-3 py-1.5 outline-none focus:border-bordo-700 capitalize"
          >
            {Array.from({ length: periodosDisp }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{nombrePeriodo(tipo, n)}</option>
            ))}
          </select>
        )}

        <div className="ml-auto inline-flex rounded-full border border-linea bg-superficie p-1 text-xs">
          {(["UYU", "USD"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMoneda(m)}
              className={`relative px-3 py-1 rounded-full font-heading transition-colors ${
                moneda === m ? "text-white" : "text-muted-foreground"
              }`}
            >
              {moneda === m && (
                <motion.span
                  layoutId="presup-moneda"
                  className="absolute inset-0 rounded-full bg-bordo-800"
                  transition={springSmooth}
                />
              )}
              <span className="relative">{m}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Escenarios "what-if" — slider único de incertidumbre (oculto en vista mensual) */}
      {tipo !== "mensual" && (
      <div className="rounded-2xl bg-white border border-linea p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4" style={{ color: COLORS.bordo }} />
            <h3 className="font-heading text-sm" style={{ color: COLORS.bordo }}>
              Sensibilidad del plan
            </h3>
            {escenarioActivo && (
              <span
                className="text-[10px] uppercase tracking-editorial rounded-full px-2 py-0.5 font-medium"
                style={{ background: COLORS.bordoSoft, color: COLORS.bordo }}
              >
                ±{variacion}%
              </span>
            )}
          </div>
          {escenarioActivo && (
            <button
              onClick={() => setVariacion(0)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-bordo-700"
            >
              <RotateCcw className="size-3" /> Reset
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          Movés un único deslizador con el margen de incertidumbre del plan. Aparecen tres líneas:{" "}
          <strong style={{ color: COLORS.oscuro }}>normal</strong> (lo presupuestado),{" "}
          <strong style={{ color: COLORS.bordo }}>máximo</strong> (ingresos +X% y egresos -X%, mejor caso) y{" "}
          <strong style={{ color: COLORS.amarillo }}>mínimo</strong> (ingresos -X% y egresos +X%, peor caso).
        </p>
        <SliderEscenario
          label="Margen de incertidumbre"
          value={variacion}
          setValue={setVariacion}
          color={COLORS.bordo}
        />
      </div>
      )}

      {/* KPIs */}
      {totales && escenarios && (
        <div className="grid gap-3 sm:grid-cols-3">
          <KpiPresupuesto
            label="Ingresos"
            ejecutado={totales.ingreso_ejecutado}
            normal={escenarios.normal.ingreso}
            max={escenarios.max.ingreso}
            min={escenarios.min.ingreso}
            moneda={moneda}
            invertido={false}
            mostrarRango={escenarioActivo}
            color={COLORS.bordo}
          />
          <KpiPresupuesto
            label="Egresos"
            ejecutado={totales.egreso_ejecutado}
            normal={escenarios.normal.egreso}
            max={escenarios.max.egreso}
            min={escenarios.min.egreso}
            moneda={moneda}
            invertido={true}
            mostrarRango={escenarioActivo}
            color={COLORS.amarillo}
          />
          <KpiResultado
            ejecutado={totales.resultado_ejecutado}
            normal={escenarios.normal.resultado}
            max={escenarios.max.resultado}
            min={escenarios.min.resultado}
            moneda={moneda}
            mostrarRango={escenarioActivo}
          />
        </div>
      )}

      {/* Chart mensual */}
      {chartMensual.length > 1 && (
        <div className="rounded-2xl bg-white border border-linea p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="font-heading text-sm" style={{ color: COLORS.bordo }}>
              Evolución mensual · {nombrePeriodo(tipo, numero)} {anio}
            </h3>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
              <LegendItem variant="striped" color={COLORS.bordo} label="Ing. plan" />
              <LegendItem variant="solid" color={COLORS.bordo} label="Ing. ejec." />
              <LegendItem variant="striped" color={COLORS.amarillo} label="Egr. plan" />
              <LegendItem variant="solid" color={COLORS.amarillo} label="Egr. ejec." />
              <LegendItem variant="line-dashed" color={COLORS.oscuro} label="Result. plan" />
              <LegendItem variant="line" color={COLORS.bordo} label="Result. ejec." />
            </div>
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={chartMensual} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <pattern id="planIngPattern" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                  <rect width="6" height="6" fill={COLORS.bordo} fillOpacity="0.08" />
                  <line x1="0" y1="0" x2="0" y2="6" stroke={COLORS.bordo} strokeWidth="1.4" strokeOpacity="0.7" />
                </pattern>
                <pattern id="planEgrPattern" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
                  <rect width="6" height="6" fill={COLORS.amarillo} fillOpacity="0.14" />
                  <line x1="0" y1="0" x2="0" y2="6" stroke={COLORS.amarillo} strokeWidth="1.4" strokeOpacity="0.95" />
                </pattern>
                <linearGradient id="bandaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.bordo} stopOpacity={0.16} />
                  <stop offset="100%" stopColor={COLORS.bordo} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="#e5e7eb" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
                dy={6}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatearMonedaCompacta(v, moneda)}
                width={70}
              />
              <Tooltip
                cursor={{ fill: "#f9fafb" }}
                formatter={((value: number | number[], name: string) => {
                  if (Array.isArray(value)) {
                    const [a, b] = value;
                    return [`${formatearMoneda(Number(a), moneda)} – ${formatearMoneda(Number(b), moneda)}`, name];
                  }
                  return [formatearMoneda(Number(value), moneda), name];
                }) as never}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  fontSize: 12,
                  boxShadow: "0 6px 24px -8px rgba(0,0,0,0.12)",
                }}
              />
              {escenarioActivo && (
                <Area
                  type="monotone"
                  dataKey="banda"
                  name="Rango proyectado"
                  stroke="none"
                  fill="url(#bandaGradient)"
                  isAnimationActive={false}
                />
              )}
              <Bar
                dataKey="ing_p"
                name="Ing. plan"
                fill="url(#planIngPattern)"
                stroke={COLORS.bordo}
                strokeOpacity={0.5}
                strokeWidth={1}
                radius={[5, 5, 0, 0]}
                barSize={14}
              />
              <Bar dataKey="ing_e" name="Ing. ejec." fill={COLORS.bordo} radius={[5, 5, 0, 0]} barSize={14} />
              <Bar
                dataKey="egr_p"
                name="Egr. plan"
                fill="url(#planEgrPattern)"
                stroke={COLORS.amarillo}
                strokeOpacity={0.7}
                strokeWidth={1}
                radius={[5, 5, 0, 0]}
                barSize={14}
              />
              <Bar dataKey="egr_e" name="Egr. ejec." fill={COLORS.amarillo} radius={[5, 5, 0, 0]} barSize={14} />
              {escenarioActivo && (
                <Line
                  type="monotone"
                  dataKey="res_max"
                  name="Result. máx."
                  stroke={COLORS.bordo}
                  strokeWidth={1.5}
                  strokeDasharray="2 4"
                  strokeOpacity={0.7}
                  dot={false}
                />
              )}
              {escenarioActivo && (
                <Line
                  type="monotone"
                  dataKey="res_min"
                  name="Result. mín."
                  stroke={COLORS.amarillo}
                  strokeWidth={1.5}
                  strokeDasharray="2 4"
                  strokeOpacity={0.8}
                  dot={false}
                />
              )}
              <Line
                type="monotone"
                dataKey="res_n"
                name="Result. plan"
                stroke={COLORS.oscuro}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={{ r: 2.5, fill: COLORS.oscuro, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: COLORS.oscuro }}
              />
              <Line
                type="monotone"
                dataKey="res_e"
                name="Result. ejec."
                stroke={COLORS.bordo}
                strokeWidth={2.5}
                dot={{ r: 3, fill: COLORS.bordo, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: COLORS.bordo }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tablas */}
      {!editable && (
        <div
          className="rounded-2xl border p-3 text-sm flex items-center gap-2"
          style={{ background: COLORS.bordoSoft, borderColor: COLORS.bordoLight, color: COLORS.bordo }}
        >
          <Lock className="size-4 shrink-0" />
          <span>
            Vista agregada de solo lectura. El plan se carga mes a mes — cambiá a <strong>mensual</strong> para editar.
          </span>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl bg-white border border-linea p-8 text-center text-muted-foreground">
          Cargando…
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <TablaCategorias
            titulo="Ingresos"
            tipo="ingreso"
            rows={ingresos}
            categoriasDisponibles={categorias.filter((c) => c.tipo === "ingreso")}
            moneda={moneda}
            editing={editing}
            setEditing={setEditing}
            onAutoSave={onAutoSave}
            editable={editable}
            savingId={savingId}
            lastSavedId={lastSavedId}
          />
          <TablaCategorias
            titulo="Egresos"
            tipo="egreso"
            rows={egresos}
            categoriasDisponibles={categorias.filter((c) => c.tipo === "egreso")}
            moneda={moneda}
            editing={editing}
            setEditing={setEditing}
            onAutoSave={onAutoSave}
            editable={editable}
            savingId={savingId}
            lastSavedId={lastSavedId}
          />
        </div>
      )}
    </div>
  );
}

function LegendItem({
  variant,
  color,
  label,
}: {
  variant: "solid" | "striped" | "line" | "line-dashed";
  color: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {variant === "solid" && (
        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: color }} />
      )}
      {variant === "striped" && (
        <span
          className="inline-block w-3 h-3 rounded-sm border"
          style={{
            borderColor: color,
            backgroundImage: `repeating-linear-gradient(45deg, ${color}, ${color} 1.5px, transparent 1.5px, transparent 4px)`,
          }}
        />
      )}
      {variant === "line" && (
        <span className="inline-block w-4 h-[2.5px] rounded-full" style={{ background: color }} />
      )}
      {variant === "line-dashed" && (
        <span
          className="inline-block w-4 h-[2px]"
          style={{
            backgroundImage: `repeating-linear-gradient(to right, ${color} 0 4px, transparent 4px 7px)`,
          }}
        />
      )}
      {label}
    </span>
  );
}

function SliderEscenario({
  label,
  value,
  setValue,
  color,
}: {
  label: string;
  value: number;
  setValue: (v: number) => void;
  color: string;
}) {
  const display = `±${value}%`;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-editorial text-muted-foreground font-heading">
          {label}
        </span>
        <span className="font-heading text-sm tabular-nums" style={{ color }}>
          {display}
        </span>
      </div>
      <Slider
        value={[value]}
        min={0}
        max={50}
        step={5}
        onValueChange={(v) => setValue(Array.isArray(v) ? v[0] : v)}
      />
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1 tabular-nums">
        <span>0%</span>
        <span>25%</span>
        <span>50%</span>
      </div>
      <div className="mt-2 h-0.5 rounded-full opacity-30" style={{ background: color }} />
    </div>
  );
}

function KpiPresupuesto({
  label,
  ejecutado,
  normal,
  max,
  min,
  moneda,
  invertido,
  mostrarRango,
  color,
}: {
  label: string;
  ejecutado: number;
  normal: number;
  max: number;
  min: number;
  moneda: Moneda;
  invertido: boolean;
  mostrarRango: boolean;
  color: string;
}) {
  const pct = normal > 0 ? (ejecutado / normal) * 100 : 0;
  const buena = invertido ? pct <= 100 : pct >= 80;
  return (
    <div className="rounded-2xl bg-white border border-linea p-4">
      <div className="text-xs uppercase tracking-editorial text-muted-foreground font-heading flex items-center justify-between">
        <span>{label}</span>
        <span className="size-2 rounded-full" style={{ background: color }} />
      </div>
      <div className="font-heading text-xl text-foreground mt-1 tabular-nums">
        {formatearMoneda(ejecutado, moneda)}
      </div>
      <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
        de {formatearMoneda(normal, moneda)} · {pct.toFixed(0)}%
      </div>
      {mostrarRango && (
        <div className="text-[11px] text-muted-foreground tabular-nums mt-1">
          rango: {formatearMoneda(Math.min(min, max), moneda)} – {formatearMoneda(Math.max(min, max), moneda)}
        </div>
      )}
      <div className="mt-2 h-1.5 rounded-full bg-superficie overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(pct, 100)}%` }}
          transition={springSmooth}
          className="h-full rounded-full"
          style={{ background: buena ? COLORS.bordo : pct > 100 ? COLORS.amarillo : COLORS.amarillo }}
        />
      </div>
    </div>
  );
}

function KpiResultado({
  ejecutado,
  normal,
  max,
  min,
  moneda,
  mostrarRango,
}: {
  ejecutado: number;
  normal: number;
  max: number;
  min: number;
  moneda: Moneda;
  mostrarRango: boolean;
}) {
  const positivo = ejecutado >= 0;
  return (
    <div className="rounded-2xl bg-white border border-linea p-4">
      <div className="text-xs uppercase tracking-editorial text-muted-foreground font-heading">
        Resultado
      </div>
      <div
        className="font-heading text-xl mt-1 tabular-nums flex items-center gap-1.5"
        style={{ color: positivo ? COLORS.bordo : COLORS.amarillo }}
      >
        {positivo ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
        {formatearMoneda(ejecutado, moneda)}
      </div>
      <div className="text-xs text-muted-foreground tabular-nums mt-0.5">
        Plan: {formatearMoneda(normal, moneda)}
      </div>
      {mostrarRango && (
        <div className="text-[11px] tabular-nums mt-1 flex flex-col gap-0.5">
          <span style={{ color: COLORS.bordo }}>máx: {formatearMoneda(max, moneda)}</span>
          <span style={{ color: COLORS.amarillo }}>mín: {formatearMoneda(min, moneda)}</span>
        </div>
      )}
    </div>
  );
}

function TablaCategorias({
  titulo,
  tipo,
  rows,
  categoriasDisponibles,
  moneda,
  editing,
  setEditing,
  onAutoSave,
  editable,
  savingId,
  lastSavedId,
}: {
  titulo: string;
  tipo: "ingreso" | "egreso";
  rows: Row[];
  categoriasDisponibles: Categoria[];
  moneda: Moneda;
  editing: number | null;
  setEditing: (id: number | null) => void;
  onAutoSave: (categoriaId: number, monto: number) => void;
  editable: boolean;
  savingId: number | null;
  lastSavedId: number | null;
}) {
  // Categorías hoja sin presupuesto (para "+ Presupuestar"), solo en modo editable
  const idsConFila = new Set(rows.map((r) => r.categoria_id));
  const idsHijos = new Set<number>();
  for (const c of categoriasDisponibles) {
    if (c.padre_id != null) idsHijos.add(c.padre_id);
  }
  const sinPresupuestar = editable
    ? categoriasDisponibles.filter(
        (c) => !idsConFila.has(c.id) && !idsHijos.has(c.id) // sólo hojas
      )
    : [];

  return (
    <div className="rounded-2xl bg-white border border-linea overflow-hidden">
      <div className="px-4 py-3 border-b border-linea">
        <h3
          className="font-heading text-sm"
          style={{ color: tipo === "ingreso" ? COLORS.bordo : COLORS.amarillo }}
        >
          {titulo}
        </h3>
      </div>
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-editorial text-muted-foreground bg-superficie">
          <tr>
            <th className="text-left px-4 py-2 font-heading">Categoría</th>
            <th className="text-right px-4 py-2 font-heading">Presupuesto</th>
            <th className="text-right px-4 py-2 font-heading">Ejecutado</th>
            <th className="text-right px-4 py-2 font-heading">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <FilaPresupuesto
              key={r.categoria_id}
              row={r}
              moneda={moneda}
              isEditing={editing === r.categoria_id}
              onEdit={() => editable && !r.tiene_hijos && setEditing(r.categoria_id)}
              onAutoSave={(m) => onAutoSave(r.categoria_id, m)}
              onClose={() => setEditing(null)}
              editable={editable && !r.tiene_hijos}
              saving={savingId === r.categoria_id}
              justSaved={lastSavedId === r.categoria_id}
            />
          ))}
          {sinPresupuestar.map((c) => (
            <FilaSinPresupuesto
              key={c.id}
              categoria={c}
              moneda={moneda}
              isEditing={editing === c.id}
              onEdit={() => setEditing(c.id)}
              onAutoSave={(m) => onAutoSave(c.id, m)}
              onClose={() => setEditing(null)}
              saving={savingId === c.id}
              justSaved={lastSavedId === c.id}
            />
          ))}
          {rows.length === 0 && sinPresupuestar.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                No hay categorías de {tipo}.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function FilaPresupuesto({
  row,
  moneda,
  isEditing,
  onEdit,
  onAutoSave,
  onClose,
  editable,
  saving,
  justSaved,
}: {
  row: Row;
  moneda: Moneda;
  isEditing: boolean;
  onEdit: () => void;
  onAutoSave: (monto: number) => void;
  onClose: () => void;
  editable: boolean;
  saving: boolean;
  justSaved: boolean;
}) {
  const [valor, setValor] = useState(row.presupuestado.toString());
  const lastSaved = useRef(row.presupuestado);
  useEffect(() => {
    // No pisar el valor mientras el usuario está tipeando.
    if (isEditing) {
      lastSaved.current = row.presupuestado;
      return;
    }
    setValor(row.presupuestado.toString());
    lastSaved.current = row.presupuestado;
  }, [row.presupuestado, isEditing]);

  // Auto-save con debounce mientras el usuario tipea
  useEffect(() => {
    if (!isEditing || !editable) return;
    if (valor === "" || valor === "-") return;
    const num = Number(valor);
    if (!Number.isFinite(num) || num < 0) return;
    if (num === lastSaved.current) return;
    const t = setTimeout(() => {
      lastSaved.current = num;
      onAutoSave(num);
    }, 600);
    return () => clearTimeout(t);
  }, [valor, isEditing, editable, onAutoSave]);

  const overrun =
    row.categoria_tipo === "egreso" && row.ejecutado > row.presupuestado && row.presupuestado > 0;

  const padding = row.nivel * 16;
  const esPadre = row.tiene_hijos;

  return (
    <tr
      className={`border-t border-linea hover:bg-superficie/50 ${esPadre ? "font-medium bg-superficie/30" : ""}`}
    >
      <td className="px-4 py-2">
        <div className="flex items-center gap-1.5" style={{ paddingLeft: padding }}>
          {row.nivel > 0 && (
            <ChevronRight className="size-3 text-muted-foreground/40 shrink-0" />
          )}
          <span
            className="inline-flex items-center gap-1.5 text-xs rounded-full px-2 py-0.5 font-medium"
            style={{
              backgroundColor: (row.categoria_color ?? COLORS.bordo) + "1a",
              color: row.categoria_color ?? COLORS.bordo,
            }}
          >
            {row.categoria_nombre}
          </span>
          {esPadre && (
            <span className="text-[10px] uppercase tracking-editorial text-muted-foreground/70">
              Σ subcat.
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-2 text-right tabular-nums">
        <div className="inline-flex items-center gap-1.5 justify-end">
          {isEditing && editable ? (
            <input
              type="number"
              step="0.01"
              value={valor}
              autoFocus
              onChange={(e) => setValor(e.target.value)}
              onBlur={() => {
                const num = Number(valor) || 0;
                if (num !== lastSaved.current) {
                  lastSaved.current = num;
                  onAutoSave(num);
                }
                onClose();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const num = Number(valor) || 0;
                  if (num !== lastSaved.current) {
                    lastSaved.current = num;
                    onAutoSave(num);
                  }
                  onClose();
                }
                if (e.key === "Escape") onClose();
              }}
              className="w-28 text-right text-sm border rounded-md px-2 py-0.5 outline-none tabular-nums"
              style={{ borderColor: COLORS.bordo }}
            />
          ) : editable ? (
            <button
              onClick={onEdit}
              className="text-foreground hover:underline tabular-nums"
              style={{ color: COLORS.bordo }}
            >
              {row.presupuestado > 0 ? formatearMoneda(row.presupuestado, moneda) : "—"}
            </button>
          ) : (
            <span
              className="text-foreground tabular-nums"
              title={esPadre ? "Suma de subcategorías" : undefined}
            >
              {row.presupuestado > 0 ? formatearMoneda(row.presupuestado, moneda) : "—"}
            </span>
          )}
          <SaveStatus saving={saving} justSaved={justSaved} />
        </div>
      </td>
      <td className="px-4 py-2 text-right tabular-nums">
        {row.ejecutado !== 0 ? formatearMoneda(row.ejecutado, moneda) : "—"}
      </td>
      <td
        className={`px-4 py-2 text-right tabular-nums ${overrun ? "font-medium" : "text-muted-foreground"}`}
        style={overrun ? { color: COLORS.amarillo } : undefined}
      >
        {row.presupuestado > 0 ? formatearMoneda(row.diferencia, moneda) : "—"}
      </td>
    </tr>
  );
}

function FilaSinPresupuesto({
  categoria,
  moneda: _moneda,
  isEditing,
  onEdit,
  onAutoSave,
  onClose,
  saving,
  justSaved,
}: {
  categoria: Categoria;
  moneda: Moneda;
  isEditing: boolean;
  onEdit: () => void;
  onAutoSave: (monto: number) => void;
  onClose: () => void;
  saving: boolean;
  justSaved: boolean;
}) {
  const [valor, setValor] = useState("");
  const lastSaved = useRef(0);

  // Auto-save con debounce
  useEffect(() => {
    if (!isEditing) return;
    if (valor === "" || valor === "-") return;
    const num = Number(valor);
    if (!Number.isFinite(num) || num < 0) return;
    if (num === lastSaved.current) return;
    const t = setTimeout(() => {
      lastSaved.current = num;
      onAutoSave(num);
    }, 600);
    return () => clearTimeout(t);
  }, [valor, isEditing, onAutoSave]);

  return (
    <tr className="border-t border-linea hover:bg-superficie/50">
      <td className="px-4 py-2">
        <span
          className="inline-flex items-center gap-1.5 text-xs rounded-full px-2 py-0.5 font-medium opacity-60"
          style={{
            backgroundColor: (categoria.color ?? COLORS.bordo) + "1a",
            color: categoria.color ?? COLORS.bordo,
          }}
        >
          {categoria.nombre}
        </span>
      </td>
      <td className="px-4 py-2 text-right tabular-nums">
        <div className="inline-flex items-center gap-1.5 justify-end">
          {isEditing ? (
            <input
              type="number"
              step="0.01"
              value={valor}
              autoFocus
              placeholder="0.00"
              onChange={(e) => setValor(e.target.value)}
              onBlur={() => {
                if (valor) {
                  const num = Number(valor) || 0;
                  if (num !== lastSaved.current) {
                    lastSaved.current = num;
                    onAutoSave(num);
                  }
                }
                onClose();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const num = Number(valor) || 0;
                  if (num !== lastSaved.current) {
                    lastSaved.current = num;
                    onAutoSave(num);
                  }
                  onClose();
                }
                if (e.key === "Escape") onClose();
              }}
              className="w-28 text-right text-sm border rounded-md px-2 py-0.5 outline-none tabular-nums"
              style={{ borderColor: COLORS.bordo }}
            />
          ) : (
            <button
              onClick={onEdit}
              className="text-xs hover:underline"
              style={{ color: COLORS.bordo }}
            >
              + Presupuestar
            </button>
          )}
          <SaveStatus saving={saving} justSaved={justSaved} />
        </div>
      </td>
      <td className="px-4 py-2 text-right text-muted-foreground" colSpan={2}>—</td>
    </tr>
  );
}

function SaveStatus({ saving, justSaved }: { saving: boolean; justSaved: boolean }) {
  return (
    <span className="inline-flex items-center w-4 h-4 justify-center">
      <AnimatePresence mode="wait">
        {saving ? (
          <motion.span
            key="saving"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={springSmooth}
            title="Guardando…"
          >
            <Loader2 className="size-3 animate-spin" style={{ color: COLORS.bordo }} />
          </motion.span>
        ) : justSaved ? (
          <motion.span
            key="saved"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={springSmooth}
            title="Guardado"
          >
            <Check className="size-3" style={{ color: COLORS.bordo }} />
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
