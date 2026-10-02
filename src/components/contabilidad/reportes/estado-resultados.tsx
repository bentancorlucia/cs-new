"use client";

import { Fragment, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Loader2, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import { formatFecha } from "@/lib/contabilidad/formato";
import type {
  EstadoResultados as Estado,
  NodoSaldo,
  ResultadoCentro,
  ResultadosPorCentro,
} from "@/lib/contabilidad/reportes";
import { easeSmooth, fadeInUp, springSmooth, staggerContainer } from "@/lib/motion";
import { Switch } from "@/components/ui/switch";
import { ImporteAnimado } from "./importe-animado";
import { ArbolFilas, filasPlanas, formatContable, sangria } from "./arbol-filas";
import type { HojaExcel } from "./acciones-reporte";
import type { Detalle } from "./estado-situacion";

export function hojasEstadoResultados(
  data: Estado,
  porCentro: ResultadosPorCentro | null,
  detalle: Detalle,
  rango: string
): HojaExcel[] {
  const filas: HojaExcel["filas"] = [];
  const bloque = (titulo: string, raiz: NodoSaldo | null, total: number) => {
    filas.push([titulo.toUpperCase(), null]);
    for (const { nodo, profundidad } of filasPlanas(raiz?.hijos ?? [], detalle === "cuentas")) {
      filas.push([`${sangria(profundidad + 1)}${nodo.nombre}`, nodo.saldoFinal]);
    }
    filas.push([`TOTAL ${titulo.toUpperCase()}`, total]);
    filas.push([]);
  };
  bloque("Recursos", data.ingresos, data.totalIngresos);
  bloque("Gastos", data.egresos, data.totalEgresos);
  filas.push([data.resultado < 0 ? "DÉFICIT DEL PERÍODO" : "SUPERÁVIT DEL PERÍODO", data.resultado]);

  const hojas: HojaExcel[] = [
    {
      nombre: "Recursos y gastos",
      titulo: "Estado de resultados (de recursos y gastos)",
      subtitulo: rango,
      columnas: [
        { titulo: "Concepto", ancho: 56 },
        { titulo: "Importe ($)", tipo: "importe", ancho: 18 },
      ],
      filas,
    },
  ];

  if (porCentro) {
    const f: HojaExcel["filas"] = [];
    const grupo = (titulo: string, lista: ResultadoCentro[]) => {
      if (lista.length === 0) return;
      f.push([titulo.toUpperCase(), null, null, null]);
      for (const r of lista) {
        f.push([`${sangria(1)}${r.centro?.nombre ?? "Sin centro de costo"}`, r.ingresos, r.egresos, r.resultado]);
        for (const rb of r.rubros) {
          f.push([
            `${sangria(3)}${rb.nombre}`,
            rb.clase === "ingreso" ? rb.importe : null,
            rb.clase === "egreso" ? rb.importe : null,
            null,
          ]);
        }
      }
      f.push([]);
    };
    grupo("Disciplinas", porCentro.disciplinas);
    grupo("Áreas del club", porCentro.areas);
    if (porCentro.sinCentro) grupo("Sin centro de costo", [porCentro.sinCentro]);
    f.push(["TOTAL", porCentro.total.ingresos, porCentro.total.egresos, porCentro.total.resultado]);
    hojas.push({
      nombre: "Por centro de costo",
      titulo: "Resultado por centro de costo",
      subtitulo: rango,
      columnas: [
        { titulo: "Centro / rubro", ancho: 48 },
        { titulo: "Recursos", tipo: "importe" },
        { titulo: "Gastos", tipo: "importe" },
        { titulo: "Superávit (déficit)", tipo: "importe", ancho: 20 },
      ],
      filas: f,
    });
  }
  return hojas;
}

export function EstadoResultados({
  data,
  porCentro,
  desde,
  hasta,
  detalle,
  verCentros,
  cargandoCentros,
  onVerCentros,
}: {
  data: Estado;
  porCentro: ResultadosPorCentro | null;
  desde: string;
  hasta: string;
  detalle: Detalle;
  verCentros: boolean;
  cargandoCentros: boolean;
  onVerCentros: (v: boolean) => void;
}) {
  const superavit = data.resultado >= 0;
  return (
    <div className="space-y-4">
      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid gap-3 sm:grid-cols-3">
        <Kpi titulo="Recursos" valor={data.totalIngresos} icono={TrendingUp} tono="text-emerald-700" />
        <Kpi titulo="Gastos" valor={data.totalEgresos} icono={TrendingDown} tono="text-rose-700" />
        <motion.div
          variants={fadeInUp}
          transition={easeSmooth}
          className={`reporte-tarjeta rounded-2xl border p-4 ${
            superavit ? "border-emerald-200 bg-emerald-50/50" : "border-rose-200 bg-rose-50/60"
          }`}
        >
          <div className="text-[11px] uppercase tracking-editorial text-muted-foreground font-heading">
            {superavit ? "Superávit del período" : "Déficit del período"}
          </div>
          <div className={`mt-1 font-heading text-lg sm:text-xl ${superavit ? "text-emerald-700" : "text-rose-700"}`}>
            <ImporteAnimado valor={data.resultado} />
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {data.totalIngresos > 0
              ? `${((data.resultado / data.totalIngresos) * 100).toLocaleString("es-UY", { maximumFractionDigits: 1 })}% de los recursos`
              : "Sin recursos en el período"}
          </div>
        </motion.div>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloque titulo="Recursos" raiz={data.ingresos} total={data.totalIngresos} detalle={detalle} color="bg-emerald-400" delay={0.05} />
        <Bloque titulo="Gastos" raiz={data.egresos} total={data.totalEgresos} detalle={detalle} color="bg-rose-400" delay={0.12} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...easeSmooth, delay: 0.2 }}
        className="reporte-tarjeta flex items-center justify-between rounded-2xl bg-bordo-800 px-5 py-4 text-white"
      >
        <span className="font-heading uppercase tracking-editorial text-sm">
          {superavit ? "Superávit" : "Déficit"} del período
        </span>
        <span className="font-display text-xl tabular-nums">{formatContable(data.resultado)}</span>
      </motion.div>

      {/* Por centro de costo */}
      <div className="flex items-center justify-between gap-3 pt-2 print:hidden">
        <div>
          <h3 className="font-heading text-base text-bordo-900">Resultado por centro de costo</h3>
          <p className="text-xs text-muted-foreground">Cuánto recauda y gasta cada disciplina y área del club.</p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          {cargandoCentros && <Loader2 className="size-3.5 animate-spin text-bordo-700" />}
          <Switch checked={verCentros} onCheckedChange={(v) => onVerCentros(!!v)} />
          Ver por centro
        </label>
      </div>
      <AnimatePresence>
        {verCentros && porCentro && (
          <motion.div
            key="centros"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={easeSmooth}
          >
            <TablaCentros data={porCentro} />
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-[11px] text-muted-foreground">
        Movimientos confirmados del {formatFecha(desde)} al {formatFecha(hasta)}, sin asientos de cierre ni refundición.
      </p>
    </div>
  );
}

function Kpi({
  titulo,
  valor,
  icono: Icono,
  tono,
}: {
  titulo: string;
  valor: number;
  icono: typeof TrendingUp;
  tono: string;
}) {
  return (
    <motion.div variants={fadeInUp} transition={easeSmooth} className="reporte-tarjeta rounded-2xl border border-linea bg-white p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-editorial text-muted-foreground font-heading">
        <Icono className={`size-3.5 ${tono}`} />
        {titulo}
      </div>
      <div className="mt-1 font-heading text-lg sm:text-xl text-foreground">
        <ImporteAnimado valor={valor} />
      </div>
    </motion.div>
  );
}

function Bloque({
  titulo,
  raiz,
  total,
  detalle,
  color,
  delay,
}: {
  titulo: string;
  raiz: NodoSaldo | null;
  total: number;
  detalle: Detalle;
  color: string;
  delay: number;
}) {
  const rubros = raiz?.hijos ?? [];
  const max = Math.max(...rubros.map((r) => Math.abs(r.saldoFinal)), 1);
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...easeSmooth, delay }}
      className="reporte-tarjeta rounded-2xl border border-linea bg-white p-4 sm:p-5 shadow-card"
    >
      <h3 className="border-b border-bordo-800/15 pb-2 font-display text-lg uppercase tracking-tightest text-bordo-900">
        {titulo}
      </h3>
      {rubros.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Sin movimientos en el período.</p>
      ) : (
        <>
          {/* Composición */}
          <div className="mt-3 space-y-1.5 print:hidden">
            {rubros.map((r, i) => (
              <div key={r.id} className="flex items-center gap-2">
                <span className="w-32 shrink-0 truncate text-[11px] text-muted-foreground sm:w-44">{r.nombre}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-superficie">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(Math.max(r.saldoFinal, 0) / max) * 100}%` }}
                    transition={{ ...springSmooth, delay: delay + i * 0.05 }}
                    className={`h-full rounded-full ${color}`}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
                  {total !== 0 ? `${Math.round((r.saldoFinal / total) * 100)}%` : ""}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <ArbolFilas key={detalle} nodos={rubros} expandirTodo={detalle === "cuentas"} />
          </div>
        </>
      )}
      <div className="mt-3 flex items-center justify-between rounded-xl bg-superficie px-3 py-2.5">
        <span className="font-heading text-sm uppercase tracking-editorial">Total {titulo.toLowerCase()}</span>
        <span className="font-heading tabular-nums text-bordo-900">{formatContable(total)}</span>
      </div>
    </motion.section>
  );
}

function TablaCentros({ data }: { data: ResultadosPorCentro }) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const todas = [...data.disciplinas, ...data.areas, ...(data.sinCentro ? [data.sinCentro] : [])];
  const max = Math.max(...todas.map((r) => Math.max(r.ingresos, r.egresos)), 1);
  const alternar = (k: string) =>
    setAbiertos((prev) => {
      const s = new Set(prev);
      if (s.has(k)) s.delete(k);
      else s.add(k);
      return s;
    });

  const grupo = (titulo: string, lista: ResultadoCentro[], nota?: string) =>
    lista.length === 0 ? null : (
      <Fragment key={titulo}>
        <tr className="bg-superficie/70">
          <td colSpan={4} className="px-4 py-2 text-[11px] uppercase tracking-editorial font-heading text-bordo-900">
            {titulo}
            {nota && <span className="ml-2 normal-case tracking-normal font-body text-muted-foreground">{nota}</span>}
          </td>
        </tr>
        {lista.map((r, i) => {
          const k = r.centro?.id ?? "sin-centro";
          const abierto = abiertos.has(k);
          return (
            <Fragment key={k}>
              <motion.tr
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...springSmooth, delay: Math.min(i, 15) * 0.03 }}
                onClick={() => alternar(k)}
                className="cursor-pointer border-t border-linea hover:bg-bordo-50/40 transition-colors"
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <motion.span animate={{ rotate: abierto ? 90 : 0 }} transition={springSmooth} className="print:hidden">
                      <ChevronRight className="size-3.5 text-muted-foreground" />
                    </motion.span>
                    <span className="font-heading text-foreground">{r.centro?.nombre ?? "Sin centro de costo"}</span>
                  </div>
                  <div className="mt-1 flex gap-1 pl-5 print:hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(r.ingresos / max) * 100}%` }}
                      transition={{ ...springSmooth, delay: 0.1 + i * 0.03 }}
                      className="h-1 max-w-[45%] rounded-full bg-emerald-400"
                    />
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(r.egresos / max) * 100}%` }}
                      transition={{ ...springSmooth, delay: 0.15 + i * 0.03 }}
                      className="h-1 max-w-[45%] rounded-full bg-rose-400"
                    />
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatContable(r.ingresos)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatContable(r.egresos)}</td>
                <td className={`px-4 py-2.5 text-right font-heading tabular-nums ${r.resultado < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                  {formatContable(r.resultado)}
                </td>
              </motion.tr>
              <AnimatePresence initial={false}>
                {abierto &&
                  r.rubros.map((rb) => (
                    <motion.tr
                      key={`${k}-${rb.id}`}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={easeSmooth}
                      className="text-[13px] text-foreground/75"
                    >
                      <td className="py-1.5 pl-12 pr-3">
                        <span className="mr-2 font-mono text-[11px] text-muted-foreground">{rb.codigo}</span>
                        {rb.nombre}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{rb.clase === "ingreso" ? formatContable(rb.importe) : ""}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{rb.clase === "egreso" ? formatContable(rb.importe) : ""}</td>
                      <td />
                    </motion.tr>
                  ))}
              </AnimatePresence>
            </Fragment>
          );
        })}
      </Fragment>
    );

  const mejor = [...data.disciplinas].sort((a, b) => b.resultado - a.resultado)[0];

  return (
    <div className="space-y-3">
      {mejor && data.disciplinas.length > 1 && (
        <div className="flex items-center gap-2 rounded-xl border border-dorado-200 bg-dorado-50 px-3 py-2 text-xs text-dorado-900 print:hidden">
          <Trophy className="size-3.5" />
          Mejor resultado: <span className="font-heading">{mejor.centro?.nombre}</span> ({formatContable(mejor.resultado)})
        </div>
      )}
      <div className="reporte-tarjeta overflow-hidden rounded-2xl border border-linea bg-white shadow-card">
        <div className="reporte-scroll overflow-x-auto">
          <table className="reporte-tabla w-full min-w-[600px] text-sm">
            <thead className="bg-superficie">
              <tr className="text-[11px] uppercase tracking-editorial text-muted-foreground font-heading">
                <th className="px-4 py-2.5 text-left">Centro de costo</th>
                <th className="px-3 py-2.5 text-right w-36">Recursos</th>
                <th className="px-3 py-2.5 text-right w-36">Gastos</th>
                <th className="px-4 py-2.5 text-right w-40">Superávit (déficit)</th>
              </tr>
            </thead>
            <tbody>
              {todas.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    No hay recursos ni gastos en el período.
                  </td>
                </tr>
              )}
              {grupo("Disciplinas", data.disciplinas)}
              {grupo("Áreas del club", data.areas)}
              {data.sinCentro &&
                grupo("Generales", [data.sinCentro], "recursos y gastos sin centro (cuotas sociales, administración…)")}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-bordo-800/25 bg-superficie font-heading">
                <td className="px-4 py-3">Total</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatContable(data.total.ingresos)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatContable(data.total.egresos)}</td>
                <td className={`px-4 py-3 text-right tabular-nums ${data.total.resultado < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                  {formatContable(data.total.resultado)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
