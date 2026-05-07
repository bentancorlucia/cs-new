"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  ComposedChart,
  Line,
  Area,
} from "recharts";
import { TrendingUp, TrendingDown, Lock, Sparkles, RotateCcw, ChevronRight } from "lucide-react";
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

  // Sliders: magnitud (0..50). Genera tres escenarios: normal, max, min.
  const [ingresoVar, setIngresoVar] = useState(0);
  const [egresoVar, setEgresoVar] = useState(0);

  useEffect(() => {
    const np = periodoActual(tipo, hoy);
    if (numero > PERIODOS_POR_TIPO[tipo]) {
      setNumero(np.numero);
    }
  }, [tipo]);

  const cargar = async () => {
    setLoading(true);
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
    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, [tipo, anio, numero, moneda]);

  const onGuardar = (categoriaId: number, monto: number) => {
    if (tipo !== "mensual") return;
    startTransition(async () => {
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
      setEditing(null);
      cargar();
    });
  };

  const ingresos = rows.filter((r) => r.categoria_tipo === "ingreso");
  const egresos = rows.filter((r) => r.categoria_tipo === "egreso");

  const ing = ingresoVar / 100;
  const egr = egresoVar / 100;
  const escenarioActivo = ingresoVar !== 0 || egresoVar !== 0;

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

  const chartCategorias = useMemo(() => {
    return rows
      .filter((r) => !r.tiene_hijos && (r.presupuestado > 0 || Math.abs(r.ejecutado) > 0))
      .slice(0, 10)
      .map((r) => ({
        nombre: r.categoria_nombre,
        Presupuestado: r.presupuestado,
        Ejecutado: r.ejecutado,
      }));
  }, [rows]);

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

      {/* Escenarios "what-if" */}
      <div className="rounded-2xl bg-white border border-linea p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4" style={{ color: COLORS.bordo }} />
            <h3 className="font-heading text-sm" style={{ color: COLORS.bordo }}>
              Escenarios proyectados
            </h3>
            {escenarioActivo && (
              <span
                className="text-[10px] uppercase tracking-editorial rounded-full px-2 py-0.5 font-medium"
                style={{ background: COLORS.bordoSoft, color: COLORS.bordo }}
              >
                Activo
              </span>
            )}
          </div>
          {escenarioActivo && (
            <button
              onClick={() => {
                setIngresoVar(0);
                setEgresoVar(0);
              }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-bordo-700"
            >
              <RotateCcw className="size-3" /> Reset
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          Ajustá el rango de incertidumbre. Verás tres líneas: <strong>normal</strong>, escenario <strong>máximo</strong>{" "}
          (más ingresos / menos egresos) y <strong>mínimo</strong> (menos ingresos / más egresos).
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <SliderEscenario
            label="Variación ingresos"
            value={ingresoVar}
            setValue={setIngresoVar}
            color={COLORS.bordo}
          />
          <SliderEscenario
            label="Variación egresos"
            value={egresoVar}
            setValue={setEgresoVar}
            color={COLORS.amarillo}
          />
        </div>
      </div>

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
            mostrarRango={ingresoVar !== 0}
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
            mostrarRango={egresoVar !== 0}
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

      {/* Chart mensual con tres líneas de escenario */}
      {chartMensual.length > 1 && (
        <div className="rounded-2xl bg-white border border-linea p-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h3 className="font-heading text-sm" style={{ color: COLORS.bordo }}>
              Evolución mensual · {nombrePeriodo(tipo, numero)} {anio}
            </h3>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
              <span className="inline-flex items-center gap-1">
                <LegendDot color={COLORS.bordoLight} /> Ing. plan
              </span>
              <span className="inline-flex items-center gap-1">
                <LegendDot color={COLORS.bordo} /> Ing. ejec.
              </span>
              <span className="inline-flex items-center gap-1">
                <LegendDot color={COLORS.amarilloLight} /> Egr. plan
              </span>
              <span className="inline-flex items-center gap-1">
                <LegendDot color={COLORS.amarillo} /> Egr. ejec.
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartMensual}>
              <defs>
                <linearGradient id="bandaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.bordo} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={COLORS.bordo} stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.linea} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatearMonedaCompacta(v, moneda)} />
              <Tooltip
                formatter={((value: number | number[], name: string) => {
                  if (Array.isArray(value)) {
                    const [a, b] = value;
                    return [`${formatearMoneda(Number(a), moneda)} – ${formatearMoneda(Number(b), moneda)}`, name];
                  }
                  return [formatearMoneda(Number(value), moneda), name];
                }) as never}
                contentStyle={{ borderRadius: 12, border: `1px solid ${COLORS.linea}`, fontSize: 12 }}
              />
              <Bar dataKey="ing_p" name="Ing. plan" fill={COLORS.bordoLight} radius={[4, 4, 0, 0]} />
              <Bar dataKey="ing_e" name="Ing. ejec." fill={COLORS.bordo} radius={[4, 4, 0, 0]} />
              <Bar dataKey="egr_p" name="Egr. plan" fill={COLORS.amarilloLight} radius={[4, 4, 0, 0]} />
              <Bar dataKey="egr_e" name="Egr. ejec." fill={COLORS.amarillo} radius={[4, 4, 0, 0]} />
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
              {escenarioActivo && (
                <Line
                  type="monotone"
                  dataKey="res_max"
                  name="Resultado máx."
                  stroke={COLORS.bordo}
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={{ r: 3, fill: COLORS.bordo }}
                />
              )}
              <Line
                type="monotone"
                dataKey="res_n"
                name="Resultado normal"
                stroke={COLORS.oscuro}
                strokeWidth={2.5}
                dot={{ r: 3.5, fill: COLORS.oscuro }}
              />
              {escenarioActivo && (
                <Line
                  type="monotone"
                  dataKey="res_min"
                  name="Resultado mín."
                  stroke={COLORS.amarillo}
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={{ r: 3, fill: COLORS.amarillo }}
                />
              )}
              <Line
                type="monotone"
                dataKey="res_e"
                name="Resultado ejec."
                stroke={COLORS.bordo}
                strokeWidth={2.5}
                strokeOpacity={0.7}
                dot={{ r: 3, fill: COLORS.bordo }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top categorías */}
      {chartCategorias.length > 0 && (
        <div className="rounded-2xl bg-white border border-linea p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading text-sm" style={{ color: COLORS.bordo }}>
              Top categorías · plan vs ejecutado
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartCategorias}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.linea} />
              <XAxis
                dataKey="nombre"
                tick={{ fontSize: 11 }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={70}
              />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatearMonedaCompacta(v, moneda)} />
              <Tooltip
                formatter={((value: number) => formatearMoneda(Number(value), moneda)) as never}
                contentStyle={{ borderRadius: 12, border: `1px solid ${COLORS.linea}`, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Presupuestado" fill={COLORS.amarillo} radius={[6, 6, 0, 0]} />
              <Bar dataKey="Ejecutado" fill={COLORS.bordo} radius={[6, 6, 0, 0]} />
            </BarChart>
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
            onGuardar={onGuardar}
            editable={editable}
          />
          <TablaCategorias
            titulo="Egresos"
            tipo="egreso"
            rows={egresos}
            categoriasDisponibles={categorias.filter((c) => c.tipo === "egreso")}
            moneda={moneda}
            editing={editing}
            setEditing={setEditing}
            onGuardar={onGuardar}
            editable={editable}
          />
        </div>
      )}
    </div>
  );
}

function LegendDot({ color }: { color: string }) {
  return <span className="inline-block size-2 rounded-full" style={{ background: color }} />;
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
          rango: {formatearMoneda(min, moneda)} – {formatearMoneda(max, moneda)}
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
  onGuardar,
  editable,
}: {
  titulo: string;
  tipo: "ingreso" | "egreso";
  rows: Row[];
  categoriasDisponibles: Categoria[];
  moneda: Moneda;
  editing: number | null;
  setEditing: (id: number | null) => void;
  onGuardar: (categoriaId: number, monto: number) => void;
  editable: boolean;
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
              onSave={(m) => onGuardar(r.categoria_id, m)}
              onCancel={() => setEditing(null)}
              editable={editable && !r.tiene_hijos}
            />
          ))}
          {sinPresupuestar.map((c) => (
            <FilaSinPresupuesto
              key={c.id}
              categoria={c}
              moneda={moneda}
              isEditing={editing === c.id}
              onEdit={() => setEditing(c.id)}
              onSave={(m) => onGuardar(c.id, m)}
              onCancel={() => setEditing(null)}
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
  onSave,
  onCancel,
  editable,
}: {
  row: Row;
  moneda: Moneda;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (monto: number) => void;
  onCancel: () => void;
  editable: boolean;
}) {
  const [valor, setValor] = useState(row.presupuestado.toString());
  useEffect(() => {
    setValor(row.presupuestado.toString());
  }, [row.presupuestado]);

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
        {isEditing && editable ? (
          <input
            type="number"
            step="0.01"
            value={valor}
            autoFocus
            onChange={(e) => setValor(e.target.value)}
            onBlur={() => onSave(Number(valor) || 0)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave(Number(valor) || 0);
              if (e.key === "Escape") onCancel();
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
  moneda,
  isEditing,
  onEdit,
  onSave,
  onCancel,
}: {
  categoria: Categoria;
  moneda: Moneda;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (monto: number) => void;
  onCancel: () => void;
}) {
  const [valor, setValor] = useState("");

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
        {isEditing ? (
          <input
            type="number"
            step="0.01"
            value={valor}
            autoFocus
            placeholder="0.00"
            onChange={(e) => setValor(e.target.value)}
            onBlur={() => valor && onSave(Number(valor) || 0)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave(Number(valor) || 0);
              if (e.key === "Escape") onCancel();
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
      </td>
      <td className="px-4 py-2 text-right text-muted-foreground" colSpan={2}>—</td>
    </tr>
  );
}
