"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, Info, TrendingDown, Wallet } from "lucide-react";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { nombreMes, type HorizonteProyeccion, type ProyeccionFlujo } from "@/lib/contabilidad/flujo";
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
import { GraficoProyeccion } from "./graficos-flujo";
import { Segmentos, TarjetaKpi } from "./ui-flujo";
import { filasSeccionExcel } from "./vista-real";

function rangoMeses(desde: string, hasta: string): string {
  const d = nombreMes(desde.slice(0, 7), { largo: true }).toLowerCase();
  const h = nombreMes(hasta.slice(0, 7), { largo: true }).toLowerCase();
  return d === h ? d : `${d} a ${h}`;
}

export function VistaProyeccion({
  datos,
  horizonte,
  navegar,
}: {
  datos: ProyeccionFlujo | null;
  horizonte: HorizonteProyeccion;
  navegar: (cambios: Record<string, string | null>) => void;
}) {
  const [verCuentas, setVerCuentas] = useState(false);
  const horizonteReal = datos?.horizonte ?? horizonte;
  return (
    <div className="space-y-4">
      {datos && <EncabezadoImpresion reporte="Proyección del flujo de caja" detalle={`desde el ${formatFecha(datos.hoy)}`} />}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={easeSmooth}
        className="reporte-tarjeta flex flex-col gap-3 rounded-2xl border border-linea bg-white p-3 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-4 print:hidden"
      >
        <Segmentos
          id="horizonte"
          ariaLabel="Horizonte"
          valor={horizonteReal}
          onChange={(v) => navegar({ horizonte: v === "ejercicio" ? null : v })}
          opciones={[
            { valor: "ejercicio", etiqueta: "Hasta fin del ejercicio" },
            { valor: "12", etiqueta: "12 meses" },
          ]}
        />
        <div className="flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={verCuentas} onCheckedChange={(v) => setVerCuentas(!!v)} />
            Ver cuentas
          </label>
          <AccionesReporte
            deshabilitado={!datos}
            onExcel={async () => {
              if (datos) await exportarExcel(`Proyeccion flujo de caja ${datos.hoy}`, [hojaProyeccion(datos, verCuentas)]);
            }}
          />
        </div>
      </motion.div>
      {datos && <ContenidoProyeccion datos={datos} verCuentas={verCuentas} />}
    </div>
  );
}

function ContenidoProyeccion({ datos, verCuentas }: { datos: ProyeccionFlujo; verCuentas: boolean }) {
  const ultimo = datos.meses[datos.meses.length - 1];
  const soloPresupuesto = datos.meses.every((m) => m.fuente === "presupuesto");
  const soloPromedio = datos.meses.every((m) => m.fuente === "promedio");
  const mixto = !soloPresupuesto && !soloPromedio;

  const columnas: ColumnaTabla[] = datos.meses.map((m) => ({
    clave: m.clave,
    titulo: m.parcial ? `Resto ${nombreMes(m.clave, { anio: false }).toLowerCase()}` : nombreMes(m.clave),
    sub: [m.parcial ? "desde hoy" : null, mixto || soloPromedio ? (m.fuente === "presupuesto" ? "presupuesto" : "promedio") : null]
      .filter(Boolean)
      .join(" · ") || undefined,
    destacada: m.parcial,
  }));
  const v = datos.vencimientos;
  const totalIngresos = datos.ingresos.total;
  const totalEgresos = datos.egresos.total;
  const filas: FilaTabla[] = [
    {
      tipo: "valor",
      id: "si",
      titulo: "Saldo inicial",
      valores: datos.meses.map((m) => m.saldoInicial),
      total: datos.saldoInicial,
      estilo: "saldo",
    },
    {
      tipo: "seccion",
      id: "ing",
      titulo: "Ingresos previstos",
      seccion: datos.ingresos,
      tono: "ingreso",
      vacio: "Sin ingresos previstos.",
    },
    {
      tipo: "seccion",
      id: "egr",
      titulo: "Egresos previstos",
      seccion: datos.egresos,
      tono: "egreso",
      vacio: "Sin egresos previstos.",
    },
    { tipo: "valor", id: "neto", titulo: "Resultado de caja del mes", valores: datos.meses.map((m) => m.neto), total: totalIngresos - totalEgresos, estilo: "total" },
    {
      tipo: "valor",
      id: "sf",
      titulo: "Saldo proyectado",
      valores: datos.meses.map((m) => m.saldoFinal),
      total: ultimo?.saldoFinal ?? datos.saldoInicial,
      estilo: "saldo",
      alertaNegativo: true,
    },
    { tipo: "separador", id: "sep" },
    {
      tipo: "valor",
      id: "venc",
      titulo: "Vencimientos de proveedores",
      ayuda: "Informativo: no se resta del saldo",
      valores: datos.meses.map((m) => m.vencimientos),
      total: datos.meses.reduce((a, m) => a + m.vencimientos, 0),
      estilo: "informativo",
    },
  ];

  const datosGrafico: { mes: string; real: number | null; proyectado: number | null }[] = [
    ...datos.real.map((r) => ({ mes: nombreMes(r.clave), real: r.saldo, proyectado: null as number | null })),
  ];
  // El mes en curso une las dos líneas: real hasta hoy, proyectado a fin de mes.
  const actual = datos.meses[0];
  if (datosGrafico.length > 0 && actual) {
    const ultimoReal = datosGrafico[datosGrafico.length - 1];
    if (datos.real[datos.real.length - 1]?.clave === actual.clave) {
      ultimoReal.mes = "Hoy";
      ultimoReal.real = datos.saldoInicial;
      ultimoReal.proyectado = datos.saldoInicial;
    }
  }
  for (const m of datos.meses) datosGrafico.push({ mes: nombreMes(m.clave), real: null, proyectado: m.saldoFinal });

  return (
    <>
      {/* De dónde salen los números */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...easeSmooth, delay: 0.05 }}
        className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${
          soloPresupuesto ? "border-bordo-200 bg-bordo-50/50 text-bordo-950" : "border-amber-300 bg-amber-50 text-amber-950"
        }`}
      >
        <Info className={`mt-0.5 size-4 shrink-0 ${soloPresupuesto ? "text-bordo-700" : "text-amber-600"}`} />
        <div className="space-y-1">
          {datos.presupuestos.length > 0 && (
            <p>
              Ingresos y egresos según el presupuesto aprobado{" "}
              {datos.presupuestos.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && " y "}
                  <span className="font-heading">«{p.nombre}»</span> (versión {p.version})
                </span>
              ))}
              , solo cuentas que mueven fondos{mixto ? ", en los meses marcados «presupuesto»" : ""}.
            </p>
          )}
          {datos.promedio && (
            <p>
              <span className="font-heading">
                {datos.presupuestos.length === 0 ? "No hay presupuesto aprobado" : "Para los meses sin presupuesto aprobado"}:
              </span>{" "}
              {datos.promedio.sinDatos
                ? `no hay recursos ni gastos confirmados en ${rangoMeses(datos.promedio.desde, datos.promedio.hasta)}, así que la proyección no suma movimientos.`
                : `se proyecta con el promedio mensual real de ${rangoMeses(datos.promedio.desde, datos.promedio.hasta)} (${
                    datos.promedio.meses === 1 ? "1 mes con movimientos" : `${datos.promedio.meses} meses`
                  }) de los recursos y gastos que mueven fondos.`}{" "}
              <Link href="/contabilidad/presupuesto" className="underline underline-offset-2 hover:text-bordo-800">
                Cargar presupuesto
              </Link>
            </p>
          )}
          <p className="text-xs opacity-80">
            El mes en curso proyecta solo lo que falta: lo previsto del mes menos lo ya registrado, cuenta por cuenta. Amortizaciones,
            revaluaciones, mermas e incobrables no se proyectan (se marcan en el plan de cuentas como «no mueve fondos»).
          </p>
        </div>
      </motion.div>

      {datos.primerNegativo && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...easeSmooth, delay: 0.1 }}
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-3 text-sm text-rose-900"
        >
          <motion.span animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 1.2 }}>
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-600" />
          </motion.span>
          <span>
            <span className="font-heading">Saldo negativo en {nombreMes(datos.primerNegativo, { largo: true }).toLowerCase()}.</span>{" "}
            Con estos supuestos las disponibilidades no alcanzan
            {datos.minimo ? `: el punto más bajo es ${formatImporte(datos.minimo.saldo, "UYU")} en ${nombreMes(datos.minimo.clave, { largo: true }).toLowerCase()}` : ""}.
          </span>
        </motion.div>
      )}

      <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <TarjetaKpi titulo="Saldo hoy" valor={datos.saldoInicial} icono={Wallet} sub={`Cajas y bancos al ${formatFecha(datos.hoy)}`} />
        <TarjetaKpi titulo="Ingresos previstos" valor={totalIngresos} icono={ArrowUpRight} tono="ingreso" sub="En todo el horizonte" />
        <TarjetaKpi titulo="Egresos previstos" valor={totalEgresos} icono={ArrowDownRight} tono="egreso" sub="En todo el horizonte" />
        <TarjetaKpi
          titulo={ultimo ? `Saldo a ${nombreMes(ultimo.clave).toLowerCase()}` : "Saldo proyectado"}
          valor={ultimo?.saldoFinal ?? datos.saldoInicial}
          icono={datos.primerNegativo ? TrendingDown : CalendarClock}
          tono={datos.primerNegativo ? "alerta" : "saldo"}
          sub={
            datos.minimo && datos.minimo.clave !== ultimo?.clave
              ? `Mínimo ${formatImporte(datos.minimo.saldo)} en ${nombreMes(datos.minimo.clave).toLowerCase()}`
              : "Al cierre del último mes"
          }
        />
      </motion.div>

      <GraficoProyeccion datos={datosGrafico} />

      <TablaFlujo columnas={columnas} filas={filas} verCuentas={verCuentas} />

      <div className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
        {v.error ? (
          <p>No se pudieron leer los vencimientos de proveedores ({v.error}).</p>
        ) : (
          <>
            <p>
              Vencimientos de proveedores: facturas y notas de débito con saldo, por mes de vencimiento. Van aparte y no se restan del saldo
              porque esos gastos ya están en los egresos previstos; sirven para ver si los pagos comprometidos caen en meses con poca caja.
            </p>
            {(v.vencido > 0 || v.posterior > 0 || v.extranjera.length > 0) && (
              <p>
                {v.vencido > 0 && <>La primera columna incluye {formatImporte(v.vencido, "UYU")} ya vencidos sin pagar. </>}
                {v.posterior > 0 && <>Vencen después del horizonte: {formatImporte(v.posterior, "UYU")}. </>}
                {v.extranjera.map((e) => (
                  <span key={e.moneda}>
                    Incluye {formatImporte(e.importe, e.moneda)} convertidos {e.tc ? `a ${formatImporte(e.tc)}` : "al tipo de cambio de cada factura"}.{" "}
                  </span>
                ))}
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}

function hojaProyeccion(d: ProyeccionFlujo, conCuentas: boolean): HojaExcel {
  const filas: CeldaExcel[][] = [
    ["Saldo inicial", ...d.meses.map((m) => m.saldoInicial), d.saldoInicial],
    ...filasSeccionExcel("Ingresos previstos", d.ingresos, conCuentas),
    ...filasSeccionExcel("Egresos previstos", d.egresos, conCuentas),
    ["Resultado de caja", ...d.meses.map((m) => m.neto), d.ingresos.total - d.egresos.total],
    ["SALDO PROYECTADO", ...d.meses.map((m) => m.saldoFinal), d.meses[d.meses.length - 1]?.saldoFinal ?? d.saldoInicial],
    [],
    ["Vencimientos de proveedores (informativo)", ...d.meses.map((m) => m.vencimientos), d.meses.reduce((a, m) => a + m.vencimientos, 0)],
    ["Base", ...d.meses.map((m) => (m.fuente === "presupuesto" ? "Presupuesto" : "Promedio real")), null],
  ];
  return {
    nombre: "Proyección",
    titulo: "Proyección del flujo de caja",
    subtitulo: `Desde el ${formatFecha(d.hoy)} · en pesos`,
    columnas: [
      { titulo: "Concepto", ancho: 48 },
      ...d.meses.map((m) => ({ titulo: m.parcial ? `Resto ${nombreMes(m.clave)}` : nombreMes(m.clave), tipo: "importe" as const })),
      { titulo: "Total", tipo: "importe" as const },
    ],
    filas,
  };
}
