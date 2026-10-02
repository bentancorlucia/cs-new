"use client";

import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Equal, Plus } from "lucide-react";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import type { BloqueEstado, EstadoSituacion as Estado } from "@/lib/contabilidad/reportes";
import { easeSmooth, fadeInUp, staggerContainer } from "@/lib/motion";
import { ImporteAnimado } from "./importe-animado";
import { ArbolFilas, filasPlanas, formatContable, sangria } from "./arbol-filas";
import type { HojaExcel } from "./acciones-reporte";

export type Detalle = "rubros" | "cuentas";

export function hojaEstadoSituacion(
  data: Estado,
  detalle: Detalle,
  hasta: string,
  ejercicioNombre: string
): HojaExcel {
  const filas: HojaExcel["filas"] = [];
  const bloque = (b: BloqueEstado, detalleBloque: boolean) => {
    filas.push([b.titulo.toUpperCase(), null]);
    for (const s of b.secciones) {
      if (b.secciones.length > 1) filas.push([`${sangria(1)}${s.titulo}`, null]);
      for (const { nodo, profundidad } of filasPlanas(s.nodos, detalleBloque)) {
        filas.push([`${sangria(profundidad + 2)}${nodo.nombre}`, nodo.saldoFinal]);
      }
      if (b.secciones.length > 1) filas.push([`${sangria(1)}Total ${s.titulo.toLowerCase()}`, s.total]);
    }
    filas.push([`TOTAL ${b.titulo.toUpperCase()}`, b.total]);
    filas.push([]);
  };
  bloque(data.activo, detalle === "cuentas");
  bloque(data.pasivo, detalle === "cuentas");
  bloque(data.patrimonio, true);
  filas.push(["TOTAL PASIVO Y PATRIMONIO", data.pasivoMasPatrimonio]);
  filas.push([]);
  filas.push(["Control: Activo − (Pasivo + Patrimonio)", data.diferencia]);
  return {
    nombre: "Situación patrimonial",
    titulo: `Estado de situación patrimonial al ${formatFecha(hasta)}`,
    subtitulo: `Ejercicio ${ejercicioNombre} · Incluye el superávit (déficit) del ejercicio a la fecha`,
    columnas: [
      { titulo: "Concepto", ancho: 56 },
      { titulo: "Importe ($)", tipo: "importe", ancho: 18 },
    ],
    filas,
  };
}

export function EstadoSituacion({
  data,
  hasta,
  detalle,
  destacados,
}: {
  data: Estado;
  hasta: string;
  detalle: Detalle;
  destacados: Set<string>;
}) {
  return (
    <div className="space-y-4">
      {/* Ecuación patrimonial */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr]"
      >
        <Total titulo="Activo" valor={data.activo.total} acento />
        <Operador icono={Equal} />
        <Total titulo="Pasivo" valor={data.pasivo.total} />
        <Operador icono={Plus} />
        <Total titulo="Patrimonio" valor={data.patrimonio.total} sub={`incluye ${data.resultadoEjercicio < 0 ? "déficit" : "superávit"} del ejercicio ${formatContable(data.resultadoEjercicio)}`} />
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloque bloque={data.activo} detalle={detalle} destacados={destacados} delay={0.05} />
        <div className="space-y-4">
          <Bloque bloque={data.pasivo} detalle={detalle} destacados={destacados} delay={0.12} />
          <Bloque bloque={data.patrimonio} detalle="cuentas" destacados={destacados} delay={0.18} />
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...easeSmooth, delay: 0.25 }}
        className={`reporte-tarjeta flex flex-col gap-2 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
          data.cuadra ? "border-emerald-200 bg-emerald-50/50" : "border-rose-200 bg-rose-50/60"
        }`}
      >
        <div className="flex items-center gap-2 text-sm">
          {data.cuadra ? (
            <CheckCircle2 className="size-4 text-emerald-600" />
          ) : (
            <AlertTriangle className="size-4 text-rose-600" />
          )}
          <span className="font-heading">
            {data.cuadra ? "Activo = Pasivo + Patrimonio" : "El estado no cuadra"}
          </span>
        </div>
        <div className="text-xs tabular-nums text-muted-foreground">
          {formatImporte(data.activo.total)} = {formatImporte(data.pasivo.total)} + {formatImporte(data.patrimonio.total)}
          {!data.cuadra && (
            <span className="ml-2 text-rose-700">Diferencia {formatImporte(data.diferencia)}</span>
          )}
        </div>
      </motion.div>
      <p className="text-[11px] text-muted-foreground">
        Saldos al {formatFecha(hasta)} sin los asientos de cierre y refundición. El superávit (déficit) del ejercicio es
        recursos − gastos desde el inicio del ejercicio hasta esa fecha.
      </p>
    </div>
  );
}

function Total({ titulo, valor, sub, acento }: { titulo: string; valor: number; sub?: string; acento?: boolean }) {
  return (
    <motion.div
      variants={fadeInUp}
      transition={easeSmooth}
      className={`reporte-tarjeta rounded-2xl border p-4 ${acento ? "col-span-2 lg:col-span-1 border-bordo-200 bg-bordo-50/40" : "border-linea bg-white"}`}
    >
      <div className="text-[11px] uppercase tracking-editorial text-muted-foreground font-heading">{titulo}</div>
      <div className={`mt-1 font-heading text-lg sm:text-xl ${acento ? "text-bordo-900" : "text-foreground"}`}>
        <ImporteAnimado valor={valor} />
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </motion.div>
  );
}

function Operador({ icono: Icono }: { icono: typeof Equal }) {
  return (
    <motion.div variants={fadeInUp} className="hidden items-center justify-center lg:flex">
      <span className="flex size-8 items-center justify-center rounded-full bg-superficie text-bordo-700">
        <Icono className="size-4" />
      </span>
    </motion.div>
  );
}

function Bloque({
  bloque,
  detalle,
  destacados,
  delay,
}: {
  bloque: BloqueEstado;
  detalle: Detalle;
  destacados: Set<string>;
  delay: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...easeSmooth, delay }}
      className="reporte-tarjeta rounded-2xl border border-linea bg-white p-4 sm:p-5 shadow-card"
    >
      <div className="flex items-baseline justify-between border-b border-bordo-800/15 pb-2">
        <h3 className="font-display text-lg uppercase tracking-tightest text-bordo-900">{bloque.titulo}</h3>
      </div>
      {bloque.secciones.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">Sin saldos.</p>
      )}
      {bloque.secciones.map((s) => (
        <div key={s.titulo} className="mt-3">
          {bloque.secciones.length > 1 && (
            <div className="mb-1 text-[11px] uppercase tracking-editorial text-muted-foreground font-heading">{s.titulo}</div>
          )}
          <ArbolFilas key={detalle} nodos={s.nodos} expandirTodo={detalle === "cuentas"} destacados={destacados} />
          {bloque.secciones.length > 1 && (
            <div className="mt-1 flex items-center justify-between border-t border-dashed border-linea pt-2 text-sm">
              <span className="text-muted-foreground">Total {s.titulo.toLowerCase()}</span>
              <span className="font-heading tabular-nums">{formatContable(s.total)}</span>
            </div>
          )}
        </div>
      ))}
      <div className="mt-3 flex items-center justify-between rounded-xl bg-superficie px-3 py-2.5">
        <span className="font-heading text-sm uppercase tracking-editorial">Total {bloque.titulo.toLowerCase()}</span>
        <span className={`font-heading tabular-nums ${bloque.total < 0 ? "text-rose-700" : "text-bordo-900"}`}>
          {formatContable(bloque.total)}
        </span>
      </div>
    </motion.section>
  );
}
