"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { springSmooth } from "@/lib/motion";
import {
  formatearMoneda,
  formatearMonedaCompacta,
  type Moneda,
} from "@/lib/tesoreria/conversion";

type Panorama = {
  totales: { totalUYU: number; totalUSD: number };
  cuentas: Array<{
    id: number;
    nombre: string;
    moneda: Moneda;
    saldo_actual: number | string;
    color: string | null;
    tipo: string;
    banco: string | null;
  }>;
  cotizacion: { compra: number; venta: number; fecha: string } | null;
  evolucion: Array<{
    mes: string;
    ingreso_uyu: number;
    egreso_uyu: number;
    ingreso_usd: number;
    egreso_usd: number;
  }>;
  topEgresos: Array<{ id: number; nombre: string; color: string | null; egreso: number }>;
  topIngresos: Array<{ id: number; nombre: string; color: string | null; ingreso: number }>;
};

const TABS = [
  { id: "panorama", label: "Panorama actual" },
  { id: "proyeccion", label: "Proyecciones" },
  { id: "historico", label: "Histórico" },
] as const;

const PALETA_PATRIMONIO = [
  "#730d32", // bordó del club
  "#f7b643", // amarillo del club
  "#0d7377", // teal profundo
  "#c97064", // rosa terracota
  "#4a5d6c", // pizarra
  "#a64161", // ciruela
  "#8a8b3d", // oliva
  "#d9a679", // arena cálida
  "#3d5a80", // azul polvoriento
  "#b56576", // malva
];

type Tab = (typeof TABS)[number]["id"];

export function ReportesCliente() {
  const [tab, setTab] = useState<Tab>("panorama");
  const [moneda, setMoneda] = useState<Moneda>("UYU");
  const [panorama, setPanorama] = useState<Panorama | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tesoreria/reportes/panorama")
      .then((r) => r.json())
      .then((d) => {
        setPanorama(d);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-linea bg-superficie p-1 text-xs">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative px-4 py-1.5 rounded-full font-heading transition-colors ${
                tab === t.id ? "text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === t.id && (
                <motion.span
                  layoutId="reportes-tab"
                  className="absolute inset-0 rounded-full bg-bordo-800"
                  transition={springSmooth}
                />
              )}
              <span className="relative">{t.label}</span>
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-full border border-linea bg-superficie p-1 text-xs">
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
                  layoutId="reportes-moneda"
                  className="absolute inset-0 rounded-full bg-bordo-800"
                  transition={springSmooth}
                />
              )}
              <span className="relative">{m}</span>
            </button>
          ))}
        </div>
      </div>

      {loading || !panorama ? (
        <div className="rounded-2xl bg-white border border-linea p-10 text-center text-muted-foreground">
          Cargando datos…
        </div>
      ) : tab === "panorama" ? (
        <Panorama panorama={panorama} moneda={moneda} />
      ) : tab === "proyeccion" ? (
        <Proyecciones panorama={panorama} moneda={moneda} />
      ) : (
        <Historico panorama={panorama} moneda={moneda} />
      )}
    </div>
  );
}

function Panorama({ panorama, moneda }: { panorama: Panorama; moneda: Moneda }) {
  const total = moneda === "UYU" ? panorama.totales.totalUYU : panorama.totales.totalUSD;

  const cuentasGrafico = useMemo(() => {
    return panorama.cuentas
      .map((c) => {
        const saldo = Number(c.saldo_actual);
        // Convertir todo a la moneda de visualización
        let valor = saldo;
        if (c.moneda !== moneda && panorama.cotizacion) {
          const tc = (panorama.cotizacion.compra + panorama.cotizacion.venta) / 2;
          if (c.moneda === "USD" && moneda === "UYU") valor = saldo * tc;
          else if (c.moneda === "UYU" && moneda === "USD") valor = saldo / tc;
        }
        return {
          nombre: c.nombre,
          valor: Math.max(valor, 0),
          color: c.color ?? null,
        };
      })
      .filter((c) => c.valor > 0)
      .map((c, i) => ({
        ...c,
        color: c.color && c.color !== "#730d32" ? c.color : PALETA_PATRIMONIO[i % PALETA_PATRIMONIO.length],
      }));
  }, [panorama, moneda]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-white border border-linea p-5">
          <div className="text-xs uppercase tracking-editorial text-muted-foreground font-heading">
            Patrimonio total
          </div>
          <div className="font-heading text-3xl text-bordo-900 mt-1 tabular-nums">
            {formatearMoneda(total, moneda)}
          </div>
          <div className="text-xs text-muted-foreground mt-1 tabular-nums">
            ≈ {formatearMoneda(
              moneda === "UYU" ? panorama.totales.totalUSD : panorama.totales.totalUYU,
              moneda === "UYU" ? "USD" : "UYU"
            )}
          </div>
        </div>

        <ResultadoMes evolucion={panorama.evolucion} moneda={moneda} />

        <div className="rounded-2xl bg-white border border-linea p-5">
          <div className="text-xs uppercase tracking-editorial text-muted-foreground font-heading">
            Cotización BCU
          </div>
          {panorama.cotizacion ? (
            <>
              <div className="font-heading text-2xl text-foreground mt-1 tabular-nums">
                {((panorama.cotizacion.compra + panorama.cotizacion.venta) / 2).toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                C: {panorama.cotizacion.compra.toFixed(2)} · V: {panorama.cotizacion.venta.toFixed(2)}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground mt-2">No disponible</div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white border border-linea p-4">
          <h3 className="font-heading text-sm text-bordo-900 mb-3">
            Distribución del patrimonio
          </h3>
          {cuentasGrafico.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={cuentasGrafico}
                  dataKey="valor"
                  nameKey="nombre"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {cuentasGrafico.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={((value: number) => formatearMoneda(Number(value), moneda)) as never}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e5e0db", fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-12">
              No hay saldos para mostrar.
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white border border-linea p-4">
          <h3 className="font-heading text-sm text-bordo-900 mb-3">
            Evolución 12 meses ({moneda})
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart
              data={panorama.evolucion.map((m) => ({
                mes: m.mes.slice(5) + "/" + m.mes.slice(2, 4),
                ingresos: moneda === "UYU" ? m.ingreso_uyu : m.ingreso_usd,
                egresos: moneda === "UYU" ? m.egreso_uyu : m.egreso_usd,
              }))}
            >
              <defs>
                <linearGradient id="ing" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="egr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe5" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatearMonedaCompacta(v, moneda)} />
              <Tooltip
                formatter={((value: number) => formatearMoneda(Number(value), moneda)) as never}
                contentStyle={{ borderRadius: 12, border: "1px solid #e5e0db", fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area
                type="monotone"
                dataKey="ingresos"
                stroke="#10b981"
                fill="url(#ing)"
                strokeWidth={2}
                name="Ingresos"
              />
              <Area
                type="monotone"
                dataKey="egresos"
                stroke="#f43f5e"
                fill="url(#egr)"
                strokeWidth={2}
                name="Egresos"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TopCategorias
          titulo="Top egresos del mes"
          tipo="egreso"
          items={panorama.topEgresos.map((e) => ({ ...e, valor: e.egreso }))}
          moneda={moneda}
        />
        <TopCategorias
          titulo="Top ingresos del mes"
          tipo="ingreso"
          items={panorama.topIngresos.map((e) => ({ ...e, valor: e.ingreso }))}
          moneda={moneda}
        />
      </div>
    </div>
  );
}

function ResultadoMes({ evolucion, moneda }: { evolucion: Panorama["evolucion"]; moneda: Moneda }) {
  const ult = evolucion[evolucion.length - 1];
  if (!ult) return null;
  const ing = moneda === "UYU" ? ult.ingreso_uyu : ult.ingreso_usd;
  const egr = moneda === "UYU" ? ult.egreso_uyu : ult.egreso_usd;
  const result = ing - egr;
  const positivo = result >= 0;

  return (
    <div className="rounded-2xl bg-white border border-linea p-5">
      <div className="text-xs uppercase tracking-editorial text-muted-foreground font-heading">
        Resultado mes actual
      </div>
      <div className={`font-heading text-2xl mt-1 tabular-nums flex items-center gap-1.5 ${positivo ? "text-emerald-700" : "text-rose-700"}`}>
        {positivo ? <TrendingUp className="size-5" /> : <TrendingDown className="size-5" />}
        {formatearMoneda(result, moneda)}
      </div>
      <div className="text-xs text-muted-foreground tabular-nums mt-1">
        +{formatearMoneda(ing, moneda)} · -{formatearMoneda(egr, moneda)}
      </div>
    </div>
  );
}

function TopCategorias({
  titulo,
  tipo,
  items,
  moneda,
}: {
  titulo: string;
  tipo: "ingreso" | "egreso";
  items: Array<{ id: number; nombre: string; color: string | null; valor: number }>;
  moneda: Moneda;
}) {
  const max = Math.max(...items.map((i) => i.valor), 1);
  return (
    <div className="rounded-2xl bg-white border border-linea p-4">
      <h3 className="font-heading text-sm text-bordo-900 mb-3">{titulo}</h3>
      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-6">Sin datos.</div>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={item.id} className="flex items-center gap-3">
              <span
                className="size-2.5 rounded-full shrink-0"
                style={{ backgroundColor: item.color ?? "#730d32" }}
              />
              <span className="text-sm flex-1 truncate">{item.nombre}</span>
              <div className="flex-1 h-1.5 rounded-full bg-superficie overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(item.valor / max) * 100}%` }}
                  transition={{ ...springSmooth, delay: i * 0.05 }}
                  className={`h-full rounded-full ${tipo === "egreso" ? "bg-rose-400" : "bg-emerald-400"}`}
                />
              </div>
              <span className="text-xs tabular-nums shrink-0 w-24 text-right">
                {formatearMoneda(item.valor, moneda)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Proyecciones({ panorama, moneda }: { panorama: Panorama; moneda: Moneda }) {
  // Proyección lineal: usar promedio últimos 3 meses para proyectar 6 meses adelante
  const evol = panorama.evolucion;
  const ult3 = evol.slice(-3);
  const promIngresos =
    ult3.reduce((s, m) => s + (moneda === "UYU" ? m.ingreso_uyu : m.ingreso_usd), 0) /
    Math.max(ult3.length, 1);
  const promEgresos =
    ult3.reduce((s, m) => s + (moneda === "UYU" ? m.egreso_uyu : m.egreso_usd), 0) /
    Math.max(ult3.length, 1);
  const tasaMensual = promIngresos - promEgresos;

  const saldoBase =
    moneda === "UYU" ? panorama.totales.totalUYU : panorama.totales.totalUSD;

  // Histórico real
  const historico = evol.map((m) => ({
    mes: m.mes.slice(5) + "/" + m.mes.slice(2, 4),
    real: moneda === "UYU" ? m.ingreso_uyu - m.egreso_uyu : m.ingreso_usd - m.egreso_usd,
    proyectado: null as number | null,
  }));

  // Proyección
  const proyHist: Array<{ mes: string; real: number | null; proyectado: number | null }> = [];
  let saldoAcum = saldoBase;
  for (let i = 1; i <= 6; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() + i);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    saldoAcum += tasaMensual;
    proyHist.push({
      mes: ym.slice(5) + "/" + ym.slice(2, 4),
      real: null,
      proyectado: saldoAcum,
    });
  }

  // Saldo acumulado histórico
  let acum = saldoBase - evol.reduce((s, m) => s + (moneda === "UYU" ? m.ingreso_uyu - m.egreso_uyu : m.ingreso_usd - m.egreso_usd), 0);
  const histSaldo = evol.map((m) => {
    acum += moneda === "UYU" ? m.ingreso_uyu - m.egreso_uyu : m.ingreso_usd - m.egreso_usd;
    return {
      mes: m.mes.slice(5) + "/" + m.mes.slice(2, 4),
      saldo: acum,
      proyeccion: null as number | null,
    };
  });
  // Punto de unión
  if (histSaldo.length > 0) {
    histSaldo[histSaldo.length - 1].proyeccion = saldoBase;
  }

  let saldoProy = saldoBase;
  const proyectado = [];
  for (let i = 1; i <= 6; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() + i);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    saldoProy += tasaMensual;
    proyectado.push({
      mes: ym.slice(5) + "/" + ym.slice(2, 4),
      saldo: null as number | null,
      proyeccion: saldoProy,
    });
  }
  const dataLine = [...histSaldo, ...proyectado];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-white border border-linea p-5">
          <div className="text-xs uppercase tracking-editorial text-muted-foreground font-heading">
            Tasa mensual neta
          </div>
          <div className={`font-heading text-2xl mt-1 tabular-nums flex items-center gap-1.5 ${tasaMensual >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {tasaMensual >= 0 ? <TrendingUp className="size-5" /> : <TrendingDown className="size-5" />}
            {formatearMoneda(tasaMensual, moneda)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Promedio últimos 3 meses</div>
        </div>
        <div className="rounded-2xl bg-white border border-linea p-5">
          <div className="text-xs uppercase tracking-editorial text-muted-foreground font-heading">
            Proyección 6 meses
          </div>
          <div className="font-heading text-2xl text-foreground mt-1 tabular-nums">
            {formatearMoneda(saldoBase + tasaMensual * 6, moneda)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Si la tasa se mantiene</div>
        </div>
        <div className="rounded-2xl bg-white border border-linea p-5">
          <div className="text-xs uppercase tracking-editorial text-muted-foreground font-heading">
            Runway estimado
          </div>
          <div className="font-heading text-2xl text-foreground mt-1 tabular-nums flex items-center gap-1.5">
            <Wallet className="size-5" />
            {tasaMensual >= 0 ? "∞" : `${Math.floor(saldoBase / Math.abs(tasaMensual))} meses`}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Hasta agotar fondos</div>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-linea p-4">
        <h3 className="font-heading text-sm text-bordo-900 mb-3">
          Saldo proyectado · 12 meses pasados + 6 futuros
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={dataLine}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe5" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatearMonedaCompacta(v, moneda)} />
            <Tooltip
              formatter={((value: number) => formatearMoneda(Number(value), moneda)) as never}
              contentStyle={{ borderRadius: 12, border: "1px solid #e5e0db", fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line
              type="monotone"
              dataKey="saldo"
              stroke="#730d32"
              strokeWidth={2.5}
              dot={false}
              name="Histórico"
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="proyeccion"
              stroke="#f7b643"
              strokeWidth={2.5}
              strokeDasharray="6 4"
              dot={false}
              name="Proyectado"
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Historico({ panorama, moneda }: { panorama: Panorama; moneda: Moneda }) {
  const data = panorama.evolucion.map((m) => ({
    mes: m.mes.slice(5) + "/" + m.mes.slice(2, 4),
    Ingresos: moneda === "UYU" ? m.ingreso_uyu : m.ingreso_usd,
    Egresos: moneda === "UYU" ? m.egreso_uyu : m.egreso_usd,
    Resultado:
      moneda === "UYU"
        ? m.ingreso_uyu - m.egreso_uyu
        : m.ingreso_usd - m.egreso_usd,
  }));

  const totalIngresos = data.reduce((s, m) => s + m.Ingresos, 0);
  const totalEgresos = data.reduce((s, m) => s + m.Egresos, 0);
  const promResultado = data.reduce((s, m) => s + m.Resultado, 0) / Math.max(data.length, 1);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-white border border-linea p-5">
          <div className="text-xs uppercase tracking-editorial text-muted-foreground font-heading">
            Total ingresos 12m
          </div>
          <div className="font-heading text-2xl text-emerald-700 mt-1 tabular-nums">
            {formatearMoneda(totalIngresos, moneda)}
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-linea p-5">
          <div className="text-xs uppercase tracking-editorial text-muted-foreground font-heading">
            Total egresos 12m
          </div>
          <div className="font-heading text-2xl text-rose-700 mt-1 tabular-nums">
            {formatearMoneda(totalEgresos, moneda)}
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-linea p-5">
          <div className="text-xs uppercase tracking-editorial text-muted-foreground font-heading">
            Promedio mensual
          </div>
          <div className={`font-heading text-2xl mt-1 tabular-nums ${promResultado >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {formatearMoneda(promResultado, moneda)}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-linea p-4">
        <h3 className="font-heading text-sm text-bordo-900 mb-3">
          Comparativa mensual ({moneda})
        </h3>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0ebe5" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatearMonedaCompacta(v, moneda)} />
            <Tooltip
              formatter={((value: number) => formatearMoneda(Number(value), moneda)) as never}
              contentStyle={{ borderRadius: 12, border: "1px solid #e5e0db", fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Egresos" fill="#f43f5e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
