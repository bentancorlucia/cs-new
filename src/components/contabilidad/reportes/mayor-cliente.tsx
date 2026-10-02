"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, BookOpen, Layers, ListOrdered, Loader2, Users } from "lucide-react";
import { springSmooth, staggerContainerFast, fadeInUp, easeSmooth } from "@/lib/motion";
import {
  formatFecha,
  formatImporte,
  NOMBRE_CLASE,
  NOMBRE_TIPO_ASIENTO,
  type ClaseCuenta,
} from "@/lib/contabilidad/formato";
import {
  acumularMayor,
  redondear,
  resumenPorAuxiliar,
  signoClase,
  saldoAnteriorAuxiliar,
  type ImporteAuxiliar,
  type MovimientoMayor,
} from "@/lib/contabilidad/reportes";
import { SelectorCuenta, type OpcionCuenta } from "./selector-cuenta";
import { ImporteAnimado } from "./importe-animado";
import { AccionesReporte, EncabezadoImpresion, exportarExcel, type HojaExcel } from "./acciones-reporte";

export interface CuentaMayor extends OpcionCuenta {
  requiere_auxiliar: "proveedor" | "disciplina" | null;
}

type FiltroAux = "todos" | number | "sin";

export function MayorCliente({
  cuentas,
  cuenta,
  desde,
  hasta,
  ejercicioNombre,
  movimientos,
  saldoAnterior,
  saldoAnteriorOrigen,
  anterioresAuxiliar,
  nombresAuxiliar,
  nombresCentro,
  error,
}: {
  cuentas: OpcionCuenta[];
  cuenta: CuentaMayor | null;
  desde: string;
  hasta: string;
  ejercicioNombre: string;
  movimientos: MovimientoMayor[];
  saldoAnterior: number;
  saldoAnteriorOrigen: number;
  anterioresAuxiliar: ImporteAuxiliar[];
  nombresAuxiliar: Record<number, string>;
  nombresCentro: Record<string, string>;
  error: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendiente, startTransition] = useTransition();
  const [filtro, setFiltro] = useState<FiltroAux>("todos");
  const [vista, setVista] = useState<"movimientos" | "auxiliares">("movimientos");

  const elegirCuenta = (id: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("cuenta", id);
    setFiltro("todos");
    setVista("movimientos");
    startTransition(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }));
  };

  const tipoAux = cuenta?.requiere_auxiliar ?? null;
  const enUsd = !!cuenta?.moneda;
  const clase: ClaseCuenta = cuenta?.clase ?? "activo";
  // Signo del importe en US$ para mostrar (como el saldo: + aumenta el saldo de la clase)
  const signo = signoClase(clase);

  const auxDe = (m: MovimientoMayor): number | null =>
    tipoAux === "proveedor" ? m.proveedor_id ?? null : tipoAux === "disciplina" ? m.disciplina_id ?? null : null;
  const nombreAux = (id: number | null) =>
    id === null ? "Sin auxiliar" : nombresAuxiliar[id] ?? `${tipoAux === "proveedor" ? "Proveedor" : "Disciplina"} #${id}`;

  // Filas visibles con saldo acumulado
  const { filas, anterior, anteriorOrigen } = useMemo(() => {
    if (filtro === "todos" || !tipoAux) {
      return {
        filas: movimientos.map((m) => ({
          ...m,
          saldoCalculado: Number(m.saldo),
          saldoOrigenCalculado: enUsd ? Number(m.saldo_origen) : null,
        })),
        anterior: saldoAnterior,
        anteriorOrigen: saldoAnteriorOrigen,
      };
    }
    const id = filtro === "sin" ? null : filtro;
    const ant = saldoAnteriorAuxiliar(clase, anterioresAuxiliar, id);
    const propios = movimientos.filter((m) => auxDe(m) === id);
    return {
      filas: acumularMayor(propios, clase, ant.saldo, enUsd ? ant.origen : null),
      anterior: ant.saldo,
      anteriorOrigen: ant.origen,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro, movimientos, saldoAnterior, saldoAnteriorOrigen, anterioresAuxiliar, clase, enUsd, tipoAux]);

  const totalDebe = redondear(filas.reduce((s, m) => s + Number(m.debe), 0));
  const totalHaber = redondear(filas.reduce((s, m) => s + Number(m.haber), 0));
  const saldoFinal = filas.length > 0 ? filas[filas.length - 1].saldoCalculado : anterior;
  const saldoFinalOrigen =
    filas.length > 0 ? filas[filas.length - 1].saldoOrigenCalculado ?? 0 : anteriorOrigen;

  const resumenAux = useMemo(
    () => (tipoAux ? resumenPorAuxiliar(clase, tipoAux, anterioresAuxiliar, movimientos) : []),
    [tipoAux, clase, anterioresAuxiliar, movimientos]
  );
  const auxiliaresOrdenados = useMemo(
    () => [...resumenAux].sort((a, b) => nombreAux(a.auxiliarId).localeCompare(nombreAux(b.auxiliarId), "es")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resumenAux, nombresAuxiliar]
  );

  const rango = `del ${formatFecha(desde)} al ${formatFecha(hasta)}`;
  const tituloCuenta = cuenta ? `${cuenta.codigo} ${cuenta.nombre}` : "";
  const sufijoFiltro =
    filtro !== "todos" && tipoAux ? ` — ${nombreAux(filtro === "sin" ? null : filtro)}` : "";

  const exportar = async () => {
    if (!cuenta) return;
    const hojas: HojaExcel[] = [];
    const cols = [
      { titulo: "Fecha", ancho: 11 },
      { titulo: "N° asiento", ancho: 10, tipo: "entero" as const },
      { titulo: "Tipo", ancho: 12 },
      { titulo: "Descripción", ancho: 48 },
      ...(tipoAux ? [{ titulo: tipoAux === "proveedor" ? "Proveedor" : "Disciplina", ancho: 28 }] : []),
      { titulo: "Centro de costo", ancho: 20 },
      { titulo: "Debe", tipo: "importe" as const },
      { titulo: "Haber", tipo: "importe" as const },
      { titulo: "Saldo", tipo: "importe" as const },
      ...(enUsd
        ? [
            { titulo: "TC", tipo: "tc" as const, ancho: 10 },
            { titulo: "Importe US$", tipo: "importe" as const },
            { titulo: "Saldo US$", tipo: "importe" as const },
          ]
        : []),
    ];
    hojas.push({
      nombre: "Mayor",
      titulo: `Libro mayor — ${tituloCuenta}${sufijoFiltro}`,
      subtitulo: `Ejercicio ${ejercicioNombre}, ${rango}`,
      columnas: cols,
      filas: [
        [
          formatFecha(desde), null, null, "Saldo anterior",
          ...(tipoAux ? [null] : []), null, null, null, anterior,
          ...(enUsd ? [null, null, anteriorOrigen] : []),
        ],
        ...filas.map((m) => [
          formatFecha(m.fecha),
          m.numero,
          NOMBRE_TIPO_ASIENTO[m.tipo],
          [m.asiento_descripcion, m.linea_descripcion].filter(Boolean).join(" — "),
          ...(tipoAux ? [nombreAux(auxDe(m))] : []),
          m.centro_costo_id ? nombresCentro[m.centro_costo_id] ?? "" : "",
          Number(m.debe),
          Number(m.haber),
          m.saldoCalculado,
          ...(enUsd
            ? [m.tc == null ? null : Number(m.tc), signo * Number(m.importe_origen ?? 0), m.saldoOrigenCalculado]
            : []),
        ]),
        [
          null, null, null, "Totales",
          ...(tipoAux ? [null] : []), null, totalDebe, totalHaber, saldoFinal,
          ...(enUsd ? [null, null, saldoFinalOrigen] : []),
        ],
      ],
    });
    if (tipoAux && resumenAux.length > 0) {
      hojas.push({
        nombre: tipoAux === "proveedor" ? "Por proveedor" : "Por disciplina",
        titulo: `Libro mayor por ${tipoAux} — ${tituloCuenta}`,
        subtitulo: `Ejercicio ${ejercicioNombre}, ${rango}`,
        columnas: [
          { titulo: tipoAux === "proveedor" ? "Proveedor" : "Disciplina", ancho: 32 },
          { titulo: "Saldo anterior", tipo: "importe" },
          { titulo: "Debe", tipo: "importe" },
          { titulo: "Haber", tipo: "importe" },
          { titulo: "Saldo final", tipo: "importe" },
          ...(enUsd ? [{ titulo: "Saldo final US$", tipo: "importe" as const }] : []),
        ],
        filas: auxiliaresOrdenados.map((r) => [
          nombreAux(r.auxiliarId),
          r.saldoAnterior,
          r.debe,
          r.haber,
          r.saldoFinal,
          ...(enUsd ? [r.saldoFinalOrigen] : []),
        ]),
      });
    }
    await exportarExcel(`Mayor ${cuenta.codigo} ${desde} a ${hasta}`, hojas);
  };

  return (
    <div className="space-y-5">
      <EncabezadoImpresion
        reporte={`Libro mayor ${tituloCuenta}${sufijoFiltro}`}
        detalle={`${rango} (ejercicio ${ejercicioNombre})`}
      />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springSmooth, delay: 0.05 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center print:hidden"
      >
        <div className="flex-1 min-w-0">
          <SelectorCuenta cuentas={cuentas} valor={cuenta?.id ?? null} onCambiar={elegirCuenta} />
        </div>
        <div className="flex items-center gap-3">
          <AnimatePresence>
            {pendiente && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Loader2 className="size-4 animate-spin text-bordo-700" />
              </motion.span>
            )}
          </AnimatePresence>
          <AccionesReporte onExcel={exportar} deshabilitado={!cuenta} />
        </div>
      </motion.div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      )}

      {!cuenta ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={easeSmooth}
          className="rounded-2xl border border-dashed border-linea bg-white px-6 py-14 text-center"
        >
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-bordo-50"
          >
            <BookOpen className="size-7 text-bordo-300" strokeWidth={1.5} />
          </motion.div>
          <p className="font-heading text-base text-foreground">Elegí una cuenta para ver su mayor</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Buscá por código (1.1.01.05) o por nombre (Banco, Proveedores…).
          </p>
        </motion.div>
      ) : (
        <>
          {/* Ficha de la cuenta + KPIs */}
          <motion.div
            variants={staggerContainerFast}
            initial="hidden"
            animate="visible"
            key={`${cuenta.id}-${filtro}`}
            className="grid gap-3 grid-cols-2 lg:grid-cols-4"
          >
            <Kpi titulo="Saldo anterior" valor={anterior} sub={`antes del ${formatFecha(desde)}`} usd={enUsd ? anteriorOrigen : null} />
            <Kpi titulo="Debe" valor={totalDebe} sub={`${filas.length} movimiento${filas.length === 1 ? "" : "s"}`} />
            <Kpi titulo="Haber" valor={totalHaber} sub={NOMBRE_CLASE[clase]} />
            <Kpi titulo="Saldo final" valor={saldoFinal} sub={`al ${formatFecha(hasta)}`} usd={enUsd ? saldoFinalOrigen : null} destacado />
          </motion.div>

          {/* Auxiliares */}
          {tipoAux && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...springSmooth, delay: 0.1 }}
              className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between print:hidden"
            >
              <div className="inline-flex w-fit rounded-full border border-linea bg-white p-1 text-xs">
                {([
                  ["movimientos", "Movimientos", ListOrdered],
                  ["auxiliares", tipoAux === "proveedor" ? "Por proveedor" : "Por disciplina", Users],
                ] as const).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setVista(id)}
                    className={`relative inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-heading transition-colors ${
                      vista === id ? "text-white" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {vista === id && (
                      <motion.span layoutId="mayor-vista" className="absolute inset-0 rounded-full bg-bordo-800" transition={springSmooth} />
                    )}
                    <Icon className="relative size-3.5" />
                    <span className="relative">{label}</span>
                  </button>
                ))}
              </div>
              {vista === "movimientos" && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Layers className="size-3.5" />
                  <span className="font-heading">{tipoAux === "proveedor" ? "Proveedor" : "Disciplina"}</span>
                  <select
                    value={String(filtro)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFiltro(v === "todos" ? "todos" : v === "sin" ? "sin" : Number(v));
                    }}
                    className="h-9 max-w-[16rem] rounded-lg border border-linea bg-white px-2 text-sm text-foreground focus:border-bordo-400 focus:outline-none focus:ring-2 focus:ring-bordo-100"
                  >
                    <option value="todos">Todos</option>
                    {auxiliaresOrdenados.map((r) => (
                      <option key={r.auxiliarId ?? "sin"} value={r.auxiliarId ?? "sin"}>
                        {nombreAux(r.auxiliarId)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </motion.div>
          )}

          <AnimatePresence mode="wait">
            {vista === "auxiliares" && tipoAux ? (
              <motion.div
                key="aux"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={easeSmooth}
                className="reporte-tarjeta overflow-hidden rounded-2xl border border-linea bg-white shadow-card"
              >
                <div className="reporte-scroll overflow-x-auto">
                  <table className="reporte-tabla w-full min-w-[640px] text-sm">
                    <thead className="bg-superficie">
                      <tr className="text-[11px] uppercase tracking-editorial text-muted-foreground font-heading">
                        <th className="px-4 py-2.5 text-left">{tipoAux === "proveedor" ? "Proveedor" : "Disciplina"}</th>
                        <th className="px-3 py-2.5 text-right">Saldo anterior</th>
                        <th className="px-3 py-2.5 text-right">Debe</th>
                        <th className="px-3 py-2.5 text-right">Haber</th>
                        <th className="px-4 py-2.5 text-right">Saldo final</th>
                        {enUsd && <th className="px-4 py-2.5 text-right">Saldo US$</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {auxiliaresOrdenados.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                            Sin saldos ni movimientos en el período.
                          </td>
                        </tr>
                      )}
                      {auxiliaresOrdenados.map((r, i) => (
                        <motion.tr
                          key={r.auxiliarId ?? "sin"}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ ...springSmooth, delay: Math.min(i, 20) * 0.02 }}
                          onClick={() => {
                            setFiltro(r.auxiliarId ?? "sin");
                            setVista("movimientos");
                          }}
                          className="cursor-pointer border-t border-linea hover:bg-bordo-50/50 transition-colors"
                        >
                          <td className="px-4 py-2.5 font-body">{nombreAux(r.auxiliarId)}</td>
                          <Celda valor={r.saldoAnterior} />
                          <Celda valor={r.debe} tenue />
                          <Celda valor={r.haber} tenue />
                          <Celda valor={r.saldoFinal} fuerte />
                          {enUsd && <Celda valor={r.saldoFinalOrigen} moneda="USD" />}
                        </motion.tr>
                      ))}
                    </tbody>
                    {auxiliaresOrdenados.length > 0 && (
                      <tfoot>
                        <tr className="border-t-2 border-bordo-800/20 bg-superficie/60 font-heading">
                          <td className="px-4 py-2.5">Total</td>
                          <Celda valor={redondear(auxiliaresOrdenados.reduce((s, r) => s + r.saldoAnterior, 0))} />
                          <Celda valor={redondear(auxiliaresOrdenados.reduce((s, r) => s + r.debe, 0))} />
                          <Celda valor={redondear(auxiliaresOrdenados.reduce((s, r) => s + r.haber, 0))} />
                          <Celda valor={redondear(auxiliaresOrdenados.reduce((s, r) => s + r.saldoFinal, 0))} fuerte />
                          {enUsd && (
                            <Celda valor={redondear(auxiliaresOrdenados.reduce((s, r) => s + r.saldoFinalOrigen, 0))} moneda="USD" />
                          )}
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={`mov-${filtro}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={easeSmooth}
                className="reporte-tarjeta overflow-hidden rounded-2xl border border-linea bg-white shadow-card"
              >
                <div className="reporte-scroll overflow-x-auto">
                  <table className={`reporte-tabla w-full text-sm ${enUsd ? "min-w-[1040px]" : "min-w-[720px]"}`}>
                    <thead className="bg-superficie">
                      <tr className="text-[11px] uppercase tracking-editorial text-muted-foreground font-heading">
                        <th className="px-4 py-2.5 text-left w-24">Fecha</th>
                        <th className="px-2 py-2.5 text-left w-16">N°</th>
                        <th className="px-3 py-2.5 text-left">Descripción</th>
                        <th className="px-3 py-2.5 text-right w-32">Debe</th>
                        <th className="px-3 py-2.5 text-right w-32">Haber</th>
                        <th className="px-4 py-2.5 text-right w-36">Saldo</th>
                        {enUsd && (
                          <>
                            <th className="px-3 py-2.5 text-right w-20">TC</th>
                            <th className="px-3 py-2.5 text-right w-32">US$</th>
                            <th className="px-4 py-2.5 text-right w-32">Saldo US$</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-linea bg-dorado-50/50">
                        <td className="px-4 py-2 text-xs tabular-nums text-muted-foreground">{formatFecha(desde)}</td>
                        <td />
                        <td className="px-3 py-2 font-heading text-sm text-foreground">Saldo anterior</td>
                        <td />
                        <td />
                        <Celda valor={anterior} fuerte />
                        {enUsd && (
                          <>
                            <td />
                            <td />
                            <Celda valor={anteriorOrigen} moneda="USD" />
                          </>
                        )}
                      </tr>
                      {filas.length === 0 && (
                        <tr>
                          <td colSpan={enUsd ? 9 : 6} className="px-4 py-10 text-center text-muted-foreground">
                            No hay movimientos confirmados en el período.
                          </td>
                        </tr>
                      )}
                      {filas.map((m, i) => {
                        const aux = tipoAux ? nombreAux(auxDe(m)) : null;
                        const centro = m.centro_costo_id ? nombresCentro[m.centro_costo_id] : null;
                        return (
                          <motion.tr
                            key={`${m.asiento_id}-${i}`}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ ...springSmooth, delay: Math.min(i, 25) * 0.015 }}
                            className="group border-t border-linea align-top hover:bg-bordo-50/40 transition-colors"
                          >
                            <td className="px-4 py-2.5 text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                              {formatFecha(m.fecha)}
                            </td>
                            <td className="px-2 py-2.5">
                              <Link
                                href={`/contabilidad/asientos/${m.asiento_id}`}
                                className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-mono text-xs text-bordo-800 hover:bg-bordo-100 transition-colors"
                              >
                                {m.numero ?? "—"}
                                <ArrowUpRight className="size-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all print:hidden" />
                              </Link>
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="font-body text-foreground leading-snug">{m.asiento_descripcion}</div>
                              {(m.linea_descripcion || aux || centro || m.tipo !== "manual") && (
                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                                  {m.tipo !== "manual" && (
                                    <span className="rounded-full bg-superficie px-1.5 py-px font-heading">
                                      {NOMBRE_TIPO_ASIENTO[m.tipo]}
                                    </span>
                                  )}
                                  {aux && (
                                    <span className="rounded-full bg-bordo-50 px-1.5 py-px font-heading text-bordo-800">{aux}</span>
                                  )}
                                  {centro && (
                                    <span className="rounded-full bg-dorado-50 px-1.5 py-px font-heading text-dorado-800">{centro}</span>
                                  )}
                                  {m.linea_descripcion && <span className="italic">{m.linea_descripcion}</span>}
                                </div>
                              )}
                            </td>
                            <Celda valor={Number(m.debe)} ocultarCero />
                            <Celda valor={Number(m.haber)} ocultarCero />
                            <Celda valor={m.saldoCalculado} fuerte />
                            {enUsd && (
                              <>
                                <td className="px-3 py-2.5 text-right text-xs tabular-nums text-muted-foreground">
                                  {m.tc == null ? "" : Number(m.tc).toLocaleString("es-UY", { maximumFractionDigits: 4 })}
                                </td>
                                <Celda valor={signo * Number(m.importe_origen ?? 0)} moneda="USD" ocultarCero />
                                <Celda valor={m.saldoOrigenCalculado ?? 0} moneda="USD" />
                              </>
                            )}
                          </motion.tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-bordo-800/20 bg-superficie/60 font-heading">
                        <td colSpan={3} className="px-4 py-2.5 text-sm">Totales del período</td>
                        <Celda valor={totalDebe} />
                        <Celda valor={totalHaber} />
                        <Celda valor={saldoFinal} fuerte />
                        {enUsd && (
                          <>
                            <td />
                            <td />
                            <Celda valor={saldoFinalOrigen} moneda="USD" fuerte />
                          </>
                        )}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {enUsd && (
            <p className="text-[11px] text-muted-foreground">
              Cuenta en dólares: Debe, Haber y Saldo en pesos (moneda funcional) al TC de cada operación; US$ con el signo del saldo
              ({signo > 0 ? "+ aumenta, − disminuye" : "+ aumenta la deuda, − la cancela"}). Las líneas de revaluación ajustan
              solo los pesos.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({
  titulo,
  valor,
  sub,
  usd,
  destacado,
}: {
  titulo: string;
  valor: number;
  sub: string;
  usd?: number | null;
  destacado?: boolean;
}) {
  return (
    <motion.div
      variants={fadeInUp}
      transition={easeSmooth}
      whileHover={{ y: -2 }}
      className={`reporte-tarjeta rounded-2xl border p-4 shadow-card transition-shadow hover:shadow-card-hover ${
        destacado ? "border-bordo-200 bg-bordo-50/40" : "border-linea bg-white"
      }`}
    >
      <div className="text-[11px] uppercase tracking-editorial text-muted-foreground font-heading">{titulo}</div>
      <div className={`mt-1 font-heading text-lg sm:text-xl ${valor < 0 ? "text-rose-700" : destacado ? "text-bordo-900" : "text-foreground"}`}>
        <ImporteAnimado valor={valor} />
      </div>
      {usd != null && (
        <div className="text-xs text-dorado-800 font-heading">
          <ImporteAnimado valor={usd} moneda="USD" />
        </div>
      )}
      <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>
    </motion.div>
  );
}

function Celda({
  valor,
  moneda,
  fuerte,
  tenue,
  ocultarCero,
}: {
  valor: number;
  moneda?: string;
  fuerte?: boolean;
  tenue?: boolean;
  ocultarCero?: boolean;
}) {
  const texto = ocultarCero && valor === 0 ? "" : formatImporte(valor, moneda === "USD" ? "USD" : undefined);
  return (
    <td
      className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap ${
        valor < 0 ? "text-rose-700" : fuerte ? "text-foreground" : tenue ? "text-muted-foreground" : "text-foreground/90"
      } ${fuerte ? "font-heading" : "font-body"}`}
    >
      {texto}
    </td>
  );
}
