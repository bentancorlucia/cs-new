"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ChevronRight, AlertTriangle } from "lucide-react";
import { formatFecha, formatImporte, NOMBRE_CLASE } from "@/lib/contabilidad/formato";
import { filtrarArbol, recorrer, type NodoSaldo, type SumasYSaldos } from "@/lib/contabilidad/reportes";
import { springSmooth, easeSmooth } from "@/lib/motion";
import { Switch } from "@/components/ui/switch";
import { ImporteAnimado } from "./importe-animado";
import type { HojaExcel } from "./acciones-reporte";
import { sangria } from "./arbol-filas";

type Nivel = 1 | 2 | 3 | 99;
const NIVELES: { valor: Nivel; label: string }[] = [
  { valor: 1, label: "Clases" },
  { valor: 2, label: "Nivel 2" },
  { valor: 3, label: "Rubros" },
  { valor: 99, label: "Todo" },
];

function agrupadorasHasta(nodos: NodoSaldo[], nivel: number): Set<string> {
  const s = new Set<string>();
  recorrer(nodos, (n) => {
    if (n.hijos.length > 0 && n.nivel < nivel) s.add(n.id);
  });
  return s;
}

export function arbolSumas(data: SumasYSaldos, ocultarSinMovimiento: boolean): NodoSaldo[] {
  return ocultarSinMovimiento ? filtrarArbol(data.arbol, (n) => n.conMovimiento) : data.arbol;
}

export function hojaSumasYSaldos(
  data: SumasYSaldos,
  ocultarSinMovimiento: boolean,
  subtitulo: string
): HojaExcel {
  const filas: HojaExcel["filas"] = [];
  recorrer(arbolSumas(data, ocultarSinMovimiento), (n) => {
    filas.push([
      n.codigo,
      `${sangria(n.nivel - 1)}${n.nombre}`,
      n.imputable ? "" : "Agrupadora",
      n.saldoAnterior,
      n.debe,
      n.haber,
      n.saldoFinal,
    ]);
  });
  filas.push([]);
  filas.push(["", "Totales", "", null, data.totales.debe, data.totales.haber, null]);
  filas.push(["", "Saldos deudores / acreedores", "", null, data.totales.saldosDeudores, data.totales.saldosAcreedores, null]);
  return {
    nombre: "Sumas y saldos",
    titulo: "Balance de sumas y saldos",
    subtitulo: `${subtitulo} · Saldos con el signo de su clase (activo y egresos: debe − haber; pasivo, patrimonio e ingresos: haber − debe)`,
    columnas: [
      { titulo: "Código", ancho: 12 },
      { titulo: "Cuenta", ancho: 46 },
      { titulo: "Tipo", ancho: 12 },
      { titulo: "Saldo anterior", tipo: "importe" },
      { titulo: "Debe", tipo: "importe" },
      { titulo: "Haber", tipo: "importe" },
      { titulo: "Saldo final", tipo: "importe" },
    ],
    filas,
  };
}

export function SumasSaldos({
  data,
  desde,
  ocultarSinMovimiento,
  onOcultarSinMovimiento,
}: {
  data: SumasYSaldos;
  desde: string;
  ocultarSinMovimiento: boolean;
  onOcultarSinMovimiento: (v: boolean) => void;
}) {
  const arbol = useMemo(() => arbolSumas(data, ocultarSinMovimiento), [data, ocultarSinMovimiento]);
  const [nivel, setNivel] = useState<Nivel>(99);
  const [expandidos, setExpandidos] = useState<Set<string>>(() => agrupadorasHasta(data.arbol, 99));

  const elegirNivel = (n: Nivel) => {
    setNivel(n);
    setExpandidos(agrupadorasHasta(data.arbol, n));
  };
  const alternar = (id: string) =>
    setExpandidos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  // Filas visibles: todo nodo cuyos antepasados están expandidos
  const filas = useMemo(() => {
    const res: NodoSaldo[] = [];
    const visitar = (nodos: NodoSaldo[]) => {
      for (const n of nodos) {
        res.push(n);
        if (n.hijos.length > 0 && expandidos.has(n.id)) visitar(n.hijos);
      }
    };
    visitar(arbol);
    return res;
  }, [arbol, expandidos]);

  const t = data.totales;
  const controles = [
    {
      ok: data.cuadraPeriodo,
      titulo: "Debe = Haber del período",
      a: t.debe,
      b: t.haber,
    },
    {
      ok: data.cuadraAnterior,
      titulo: `Saldos al ${formatFecha(desde)}`,
      a: t.debeAnterior,
      b: t.haberAnterior,
    },
    {
      ok: data.cuadraSaldos,
      titulo: "Saldos deudores = acreedores",
      a: t.saldosDeudores,
      b: t.saldosAcreedores,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Controles de partida doble */}
      <div className="grid gap-3 sm:grid-cols-3">
        {controles.map((c, i) => (
          <motion.div
            key={c.titulo}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...easeSmooth, delay: i * 0.06 }}
            className={`reporte-tarjeta rounded-2xl border p-4 ${
              c.ok ? "border-emerald-200 bg-emerald-50/50" : "border-rose-200 bg-rose-50/60"
            }`}
          >
            <div className="flex items-center gap-2">
              <motion.span
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 18, delay: 0.3 + i * 0.08 }}
              >
                {c.ok ? (
                  <CheckCircle2 className="size-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="size-4 text-rose-600" />
                )}
              </motion.span>
              <span className="text-[11px] uppercase tracking-editorial font-heading text-muted-foreground">{c.titulo}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-[10px] text-muted-foreground">Debe</div>
                <ImporteAnimado valor={c.a} className="font-heading" />
              </div>
              <div className="text-right">
                <div className="text-[10px] text-muted-foreground">Haber</div>
                <ImporteAnimado valor={c.b} className="font-heading" />
              </div>
            </div>
            {!c.ok && (
              <div className="mt-1 text-xs text-rose-700">Diferencia: {formatImporte(c.a - c.b)}</div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Opciones */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="inline-flex w-fit rounded-full border border-linea bg-white p-1 text-xs">
          {NIVELES.map((n) => (
            <button
              key={n.valor}
              type="button"
              onClick={() => elegirNivel(n.valor)}
              className={`relative rounded-full px-3 py-1.5 font-heading transition-colors ${
                nivel === n.valor ? "text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {nivel === n.valor && (
                <motion.span layoutId="sumas-nivel" className="absolute inset-0 rounded-full bg-bordo-800" transition={springSmooth} />
              )}
              <span className="relative">{n.label}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <Switch checked={ocultarSinMovimiento} onCheckedChange={(v) => onOcultarSinMovimiento(!!v)} />
          Ocultar cuentas sin saldo ni movimientos
        </label>
      </div>

      {/* Tabla */}
      <div className="reporte-tarjeta overflow-hidden rounded-2xl border border-linea bg-white shadow-card">
        <div className="reporte-scroll overflow-x-auto">
          <table className="reporte-tabla w-full min-w-[680px] text-sm">
            <thead className="bg-superficie">
              <tr className="text-[11px] uppercase tracking-editorial text-muted-foreground font-heading">
                <th className="px-4 py-2.5 text-left">Cuenta</th>
                <th className="hidden px-3 py-2.5 text-right md:table-cell print:table-cell w-36">Saldo anterior</th>
                <th className="px-3 py-2.5 text-right w-36">Debe</th>
                <th className="px-3 py-2.5 text-right w-36">Haber</th>
                <th className="px-4 py-2.5 text-right w-36">Saldo final</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {filas.map((n, i) => {
                  const agrupadora = n.hijos.length > 0;
                  const raiz = n.nivel === 1;
                  const abierto = expandidos.has(n.id);
                  return (
                    <motion.tr
                      key={n.id}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0, transition: { ...springSmooth, delay: Math.min(i, 30) * 0.008 } }}
                      exit={{ opacity: 0, transition: { duration: 0.12 } }}
                      onClick={agrupadora ? () => alternar(n.id) : undefined}
                      className={`border-t border-linea transition-colors ${
                        raiz ? "bg-superficie/70" : ""
                      } ${agrupadora ? "cursor-pointer hover:bg-bordo-50/50" : "hover:bg-bordo-50/30"}`}
                    >
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2" style={{ paddingLeft: (n.nivel - 1) * 14 }}>
                          <span className="flex size-4 shrink-0 items-center justify-center print:hidden">
                            {agrupadora && (
                              <motion.span animate={{ rotate: abierto ? 90 : 0 }} transition={springSmooth}>
                                <ChevronRight className="size-3.5 text-muted-foreground" />
                              </motion.span>
                            )}
                          </span>
                          <span className="w-20 shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">{n.codigo}</span>
                          <span
                            className={`min-w-0 ${
                              raiz
                                ? "font-heading uppercase tracking-editorial text-xs text-bordo-900"
                                : agrupadora
                                  ? "font-heading text-foreground"
                                  : "font-body text-foreground/85"
                            } ${!n.activa ? "italic text-muted-foreground" : ""}`}
                          >
                            {raiz ? NOMBRE_CLASE[n.clase] : n.nombre}
                          </span>
                        </div>
                      </td>
                      <Importe valor={n.saldoAnterior} fuerte={agrupadora} className="hidden md:table-cell print:table-cell" />
                      <Importe valor={n.debe} fuerte={agrupadora} tenue />
                      <Importe valor={n.haber} fuerte={agrupadora} tenue />
                      <Importe valor={n.saldoFinal} fuerte />
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
              {filas.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No hay cuentas con saldo ni movimientos en el período.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-bordo-800/25 bg-superficie font-heading">
                <td className="px-4 py-3 text-sm">Totales</td>
                <td className="hidden md:table-cell print:table-cell" />
                <td className="px-3 py-3 text-right tabular-nums">{formatImporte(t.debe)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatImporte(t.haber)}</td>
                <td className="px-4 py-3 text-right">
                  {data.cuadraPeriodo ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                      <CheckCircle2 className="size-3.5" /> Cuadra
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-rose-700">
                      <AlertTriangle className="size-3.5" /> No cuadra
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Saldos con el signo de su clase: activo y egresos debe − haber; pasivo, patrimonio e ingresos haber − debe. Las
        regularizadoras (amortizaciones acumuladas, previsiones) aparecen en negativo y restan dentro de su rubro.
      </p>
    </div>
  );
}

function Importe({
  valor,
  fuerte,
  tenue,
  className = "",
}: {
  valor: number;
  fuerte?: boolean;
  tenue?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${className} ${
        valor < 0 ? "text-rose-700" : valor === 0 ? "text-muted-foreground/60" : tenue && !fuerte ? "text-foreground/75" : "text-foreground"
      } ${fuerte ? "font-heading" : "font-body"}`}
    >
      {valor === 0 ? "—" : formatImporte(valor)}
    </td>
  );
}
