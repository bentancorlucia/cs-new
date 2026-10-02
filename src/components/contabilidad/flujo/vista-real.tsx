"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, Landmark, Wallet } from "lucide-react";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { nombreMes, sumarMeses, type AgrupacionFlujo, type EstadoFlujo, type SeccionFlujo } from "@/lib/contabilidad/flujo";
import { easeSmooth, staggerContainer } from "@/lib/motion";
import { Switch } from "@/components/ui/switch";
import {
  AccionesReporte,
  EncabezadoImpresion,
  exportarExcel,
  type CeldaExcel,
  type HojaExcel,
} from "@/components/contabilidad/reportes/acciones-reporte";
import { TablaFlujo, type ColumnaTabla, type FilaTabla } from "./tabla-flujo";
import { GraficoFlujoReal } from "./graficos-flujo";
import { CLASE_SELECT, Segmentos, TarjetaKpi } from "./ui-flujo";

export interface OpcionMes {
  clave: string;
  etiqueta: string;
}

export interface OpcionDisponibilidad {
  id: string;
  codigo: string;
  nombre: string;
  moneda: string | null;
}

/** Filas de una sección para Excel: total, grupos y (con detalle) cuentas. */
export function filasSeccionExcel(titulo: string, s: SeccionFlujo, conCuentas: boolean): CeldaExcel[][] {
  const filas: CeldaExcel[][] = [[titulo.toUpperCase(), ...s.porMes, s.total]];
  for (const g of s.grupos) {
    filas.push([`    ${g.codigo && !g.etiqueta ? `${g.codigo} ` : ""}${g.nombre}`, ...g.porMes, g.total]);
    if (conCuentas) for (const h of g.hijos) filas.push([`        ${h.codigo ?? ""} ${h.nombre}`, ...h.porMes, h.total]);
  }
  return filas;
}

export function VistaReal({
  datos,
  hoy,
  opcionesMeses,
  disponibilidades,
  filtros,
  navegar,
}: {
  datos: EstadoFlujo | null;
  hoy: string;
  opcionesMeses: OpcionMes[];
  disponibilidades: OpcionDisponibilidad[];
  filtros: { desde: string; hasta: string; cuenta: string | null; agrupar: AgrupacionFlujo; ejercicioDesde: string };
  navegar: (cambios: Record<string, string | null>) => void;
}) {
  const [verCuentas, setVerCuentas] = useState(false);
  const mesActual = hoy.slice(0, 7);
  const primero = opcionesMeses[0]?.clave ?? mesActual;
  const ultimo = opcionesMeses[opcionesMeses.length - 1]?.clave ?? mesActual;
  const atajos = [
    { id: "ejercicio", etiqueta: "Ejercicio a la fecha", desde: filtros.ejercicioDesde, hasta: ultimo },
    {
      id: "12",
      etiqueta: "Últimos 12 meses",
      desde: sumarMeses(ultimo, -11) < primero ? primero : sumarMeses(ultimo, -11),
      hasta: ultimo,
    },
    { id: "mes", etiqueta: "Último mes", desde: ultimo, hasta: ultimo },
  ];

  const disp = disponibilidades.find((d) => d.id === filtros.cuenta) ?? null;
  const nombreAmbito = disp ? `${disp.codigo} ${disp.nombre}` : "todas las cajas y bancos";

  return (
    <div className="space-y-4">
      {datos && (
        <EncabezadoImpresion
          reporte="Flujo de caja"
          detalle={`del ${formatFecha(datos.desde)} al ${formatFecha(datos.hasta)} · ${nombreAmbito}`}
        />
      )}

      {/* Filtros */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={easeSmooth}
        className="reporte-tarjeta space-y-3 rounded-2xl border border-linea bg-white p-3 shadow-card sm:p-4 print:hidden"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label htmlFor="flujo-desde" className="text-muted-foreground">
              Desde
            </label>
            <select
              id="flujo-desde"
              value={filtros.desde}
              onChange={(e) => {
                const d = e.target.value;
                navegar({ desde: d, hasta: d > filtros.hasta ? d : filtros.hasta });
              }}
              className={`${CLASE_SELECT} !w-auto`}
            >
              {opcionesMeses.map((m) => (
                <option key={m.clave} value={m.clave}>
                  {m.etiqueta}
                </option>
              ))}
            </select>
            <label htmlFor="flujo-hasta" className="text-muted-foreground">
              hasta
            </label>
            <select
              id="flujo-hasta"
              value={filtros.hasta}
              onChange={(e) => {
                const h = e.target.value;
                navegar({ hasta: h, desde: h < filtros.desde ? h : filtros.desde });
              }}
              className={`${CLASE_SELECT} !w-auto`}
            >
              {opcionesMeses.map((m) => (
                <option key={m.clave} value={m.clave}>
                  {m.etiqueta}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {atajos.map((a, i) => {
              // Si dos atajos dan el mismo rango, se marca solo el primero.
              const activo =
                a.desde === filtros.desde &&
                a.hasta === filtros.hasta &&
                !atajos.slice(0, i).some((b) => b.desde === a.desde && b.hasta === a.hasta);
              return (
                <motion.button
                  key={a.id}
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => !activo && navegar({ desde: a.desde, hasta: a.hasta })}
                  className={`rounded-full border px-3 py-1.5 text-xs font-heading transition-colors ${
                    activo
                      ? "border-bordo-800 bg-bordo-50 text-bordo-800"
                      : "border-linea text-muted-foreground hover:border-bordo-200 hover:text-foreground"
                  }`}
                >
                  {a.etiqueta}
                </motion.button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-linea/70 pt-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
            <select
              aria-label="Caja o banco"
              value={filtros.cuenta ?? ""}
              onChange={(e) => navegar({ cuenta: e.target.value || null })}
              className={`${CLASE_SELECT} sm:max-w-72`}
            >
              <option value="">Todas las cajas y bancos</option>
              {disponibilidades.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.codigo} {d.nombre}
                  {d.moneda && d.moneda !== "UYU" ? ` (${d.moneda})` : ""}
                </option>
              ))}
            </select>
            <Segmentos
              id="agrupar"
              ariaLabel="Agrupar por"
              valor={filtros.agrupar}
              onChange={(v) => navegar({ agrupar: v === "plan" ? null : v })}
              opciones={[
                { valor: "plan", etiqueta: "Por rubro" },
                { valor: "centro", etiqueta: "Por centro de costo" },
              ]}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={verCuentas} onCheckedChange={(v) => setVerCuentas(!!v)} />
              Ver cuentas
            </label>
            <AccionesReporte
              deshabilitado={!datos}
              onExcel={async () => {
                if (datos) await exportarExcel(`Flujo de caja ${datos.desde} a ${datos.hasta}`, [hojaFlujoReal(datos, verCuentas, nombreAmbito)]);
              }}
            />
          </div>
        </div>
      </motion.div>

      {datos && <ContenidoReal datos={datos} verCuentas={verCuentas} nombreAmbito={nombreAmbito} />}
    </div>
  );
}

function ContenidoReal({ datos, verCuentas, nombreAmbito }: { datos: EstadoFlujo; verCuentas: boolean; nombreAmbito: string }) {
  const { control } = datos;
  const enUsd = datos.disponibilidad?.moneda && datos.disponibilidad.moneda !== "UYU";
  const columnas: ColumnaTabla[] = datos.meses.map((m) => ({
    clave: m.clave,
    titulo: nombreMes(m.clave),
    sub: m.desde.slice(8) !== "01" || m.hasta.slice(8) !== finMesSimple(m.clave) ? `${m.desde.slice(8)} al ${m.hasta.slice(8)}` : undefined,
  }));
  const hayReval = datos.revaluacion.porMes.some((v) => v !== 0);
  const vacio = datos.agrupacion === "centro" ? "Sin movimientos." : "Sin movimientos en el período.";
  const filas: FilaTabla[] = [
    { tipo: "valor", id: "si", titulo: "Saldo inicial", valores: datos.saldoInicialMes, total: datos.saldoInicial, estilo: "saldo" },
    { tipo: "seccion", id: "ing", titulo: "Ingresos de fondos", seccion: datos.ingresos, tono: "ingreso", vacio },
    { tipo: "seccion", id: "egr", titulo: "Egresos de fondos", seccion: datos.egresos, tono: "egreso", vacio },
    {
      tipo: "valor",
      id: "rev",
      titulo: "Diferencia de cambio",
      ayuda: hayReval ? "Revaluación de cajas y bancos en dólares" : "Revaluación de cajas y bancos en dólares (sin movimientos)",
      valores: datos.revaluacion.porMes,
      total: datos.revaluacion.total,
      estilo: "normal",
    },
    { tipo: "valor", id: "var", titulo: "Variación del mes", valores: datos.variacionMes, total: datos.variacion, estilo: "total" },
    { tipo: "valor", id: "sf", titulo: "Saldo final", valores: datos.saldoFinalMes, total: datos.saldoFinal, estilo: "saldo" },
  ];

  return (
    <>
      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <TarjetaKpi titulo="Saldo inicial" valor={datos.saldoInicial} icono={Wallet} sub={`Al empezar el ${formatFecha(datos.desde)}`} />
        <TarjetaKpi titulo="Ingresos" valor={datos.ingresos.total} icono={ArrowUpRight} tono="ingreso" sub="Entradas de fondos" />
        <TarjetaKpi titulo="Egresos" valor={datos.egresos.total} icono={ArrowDownRight} tono="egreso" sub="Salidas de fondos" />
        <TarjetaKpi
          titulo="Saldo final"
          valor={datos.saldoFinal}
          icono={Landmark}
          tono={datos.saldoFinal < 0 ? "alerta" : "saldo"}
          sub={`Al cierre del ${formatFecha(datos.hasta)}`}
        />
      </motion.div>

      <AnimatePresence mode="wait">
        {control.cuadra ? (
          <motion.div
            key="ok"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={easeSmooth}
            className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-900"
          >
            <CheckCircle2 className="mt-px size-3.5 shrink-0 text-emerald-600" />
            <span>
              Cuadra con los libros: saldo inicial + ingresos − egresos + diferencia de cambio = {formatImporte(control.saldoLibros, "UYU")},
              el saldo contable de {nombreAmbito} al cierre del {formatFecha(datos.hasta)}.
            </span>
          </motion.div>
        ) : (
          <motion.div
            key="mal"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={easeSmooth}
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2.5 text-sm text-rose-900"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-600" />
            <span>
              <span className="font-heading">El flujo no cuadra con los libros.</span> Saldo calculado{" "}
              {formatImporte(control.saldoCalculado, "UYU")}, saldo contable {formatImporte(control.saldoLibros, "UYU")} (diferencia{" "}
              {formatImporte(control.diferencia, "UYU")}). Revisá asientos de disponibilidades con tipos especiales o avisá a sistemas.
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <GraficoFlujoReal
        datos={datos.meses.map((m, i) => ({
          mes: nombreMes(m.clave, { anio: datos.meses.length > 12 || m.mes === 1 }),
          ingresos: datos.ingresos.porMes[i],
          egresos: datos.egresos.porMes[i],
          saldo: datos.saldoFinalMes[i],
        }))}
      />

      <TablaFlujo columnas={columnas} filas={filas} verCuentas={verCuentas} />

      <div className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
        <p>
          Método directo: cada entrada o salida de {nombreAmbito} se muestra por su contrapartida. En los asientos mixtos solo cuenta lo
          que movió fondos (una venta muestra el cobro, no el costo de la mercadería). Sin apertura, cierre ni refundición. Importes en
          pesos{enUsd ? "; la cuenta es en dólares y se muestra convertida al tipo de cambio de cada asiento" : ""}.
        </p>
        {datos.disponibilidad && <p>Los traspasos con otras cajas y bancos aparecen como contrapartida.</p>}
        {datos.agrupacion === "centro" && (
          <p>Por centro de costo: cobros y pagos sin centro (cuotas sociales, proveedores, administración) van en «Sin centro de costo».</p>
        )}
        {control.metodo === "mismo_dia" && (
          <p>El control usa el saldo al cierre del {formatFecha(datos.hasta)} porque todavía no existe el ejercicio siguiente.</p>
        )}
      </div>
    </>
  );
}

function finMesSimple(clave: string): string {
  const [y, m] = clave.split("-").map(Number);
  return String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0");
}

function hojaFlujoReal(d: EstadoFlujo, conCuentas: boolean, ambito: string): HojaExcel {
  const filas: CeldaExcel[][] = [
    ["Saldo inicial", ...d.saldoInicialMes, d.saldoInicial],
    ...filasSeccionExcel("Ingresos de fondos", d.ingresos, conCuentas),
    ...filasSeccionExcel("Egresos de fondos", d.egresos, conCuentas),
    ["Diferencia de cambio (revaluación)", ...d.revaluacion.porMes, d.revaluacion.total],
    ["Variación", ...d.variacionMes, d.variacion],
    ["SALDO FINAL", ...d.saldoFinalMes, d.saldoFinal],
  ];
  return {
    nombre: "Flujo de caja",
    titulo: `Flujo de caja — ${ambito}`,
    subtitulo: `Del ${formatFecha(d.desde)} al ${formatFecha(d.hasta)} · método directo · en pesos`,
    columnas: [
      { titulo: "Concepto", ancho: 48 },
      ...d.meses.map((m) => ({ titulo: nombreMes(m.clave), tipo: "importe" as const })),
      { titulo: "Total", tipo: "importe" as const },
    ],
    filas,
  };
}
