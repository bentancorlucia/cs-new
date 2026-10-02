"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, ChevronRight, PackageMinus, User } from "lucide-react";
import { formatFecha, formatImporte } from "@/lib/contabilidad/formato";
import { NOMBRE_TIPO_BAJA, type TipoBaja } from "@/lib/comercial/stock";
import { easeSmooth, fadeInUp, springSmooth, staggerContainer, staggerContainerFast } from "@/lib/motion";
import { ImporteAnimado } from "@/components/contabilidad/reportes/importe-animado";
import { TituloReporte } from "@/components/contabilidad/reportes/titulo-reporte";
import { fechaHora } from "./recuentos-lista";

const nombreTipo = (t: string) => NOMBRE_TIPO_BAJA[t as TipoBaja] ?? t;

export interface BajaResumen {
  id: number;
  numero: string;
  fecha: string;
  tipo: string;
  descripcion: string;
  creadoPor: string | null;
  unidades: number;
  valor: number | null;
}

function Volver({ href, texto }: { href: string; texto: string }) {
  return (
    <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={easeSmooth}>
      <Link href={href} className="group inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
        {texto}
      </Link>
    </motion.div>
  );
}

export function BajasLista({ bajas, error }: { bajas: BajaResumen[]; error: string | null }) {
  return (
    <div className="space-y-6">
      <Volver href="/admin/stock" texto="Stock" />
      <TituloReporte etiqueta="Stock" titulo="Bajas" descripcion="Mercadería dada de baja, con su tipo, responsable y asiento." />
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}
      {bajas.length === 0 ? (
        <div className="rounded-2xl border border-linea bg-white py-16 text-center text-muted-foreground">
          <PackageMinus className="mx-auto mb-3 size-12 opacity-20" />
          <p className="text-sm">Todavía no hay bajas</p>
        </div>
      ) : (
        <motion.ul variants={staggerContainer} initial="hidden" animate="visible" className="space-y-2">
          {bajas.map((b) => (
            <motion.li key={b.id} variants={fadeInUp} transition={springSmooth}>
              <Link
                href={`/admin/stock/bajas/${b.id}`}
                className="group flex items-center gap-3 rounded-2xl border border-linea bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-bordo-200 hover:shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-heading text-sm">{b.numero}</span>
                    <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700">
                      {nombreTipo(b.tipo)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm">{b.descripcion}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFecha(b.fecha)} · {b.unidades} u.{b.valor !== null && ` · $ ${formatImporte(b.valor)}`}
                    {b.creadoPor && ` · ${b.creadoPor}`}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </div>
  );
}

export function BajaDetalle({
  baja,
  filas,
}: {
  baja: {
    id: number;
    numero: string;
    fecha: string;
    tipo: string;
    descripcion: string;
    creado: string;
    creadoPor: string | null;
    centro: string | null;
    asientoId: string | null;
  };
  filas: {
    id: number;
    productoId: number | null;
    varianteId: number | null;
    producto: string;
    variante: string | null;
    sku: string | null;
    cantidad: number;
    valor: number | null;
  }[];
}) {
  const verCostos = filas.some((f) => f.valor !== null);
  const total = filas.reduce((s, f) => s + (f.valor ?? 0), 0);
  return (
    <div className="space-y-6">
      <Volver href="/admin/stock/bajas" texto="Bajas" />
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={easeSmooth} className="space-y-2">
        <div className="text-[11px] uppercase tracking-editorial text-bordo-700 font-heading">Baja de mercadería</div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl uppercase tracking-tightest sm:text-3xl">{baja.numero}</h1>
          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
            {nombreTipo(baja.tipo)}
          </span>
        </div>
        <p className="text-sm">{baja.descripcion}</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>Fecha {formatFecha(baja.fecha)}</span>
          <span className="flex items-center gap-1">
            <User className="size-3" />
            {baja.creadoPor ?? "—"} · {fechaHora(baja.creado)}
          </span>
          {baja.centro && <span>Centro de costo: {baja.centro}</span>}
        </p>
      </motion.div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {verCostos && (
          <div className="rounded-2xl border border-linea bg-white px-4 py-3 shadow-sm">
            <p className="text-[11px] text-muted-foreground">Valor dado de baja</p>
            <p className="font-display text-xl tracking-tightest text-red-600">
              <ImporteAnimado valor={total} moneda="UYU" />
            </p>
          </div>
        )}
        {baja.asientoId && (
          <Link
            href={`/contabilidad/asientos/${baja.asientoId}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-linea px-3 py-1.5 text-xs font-medium text-bordo-800 hover:border-bordo-300"
          >
            <BookOpen className="size-3.5" />
            Ver asiento
          </Link>
        )}
      </div>

      <motion.ul
        variants={staggerContainerFast}
        initial="hidden"
        animate="visible"
        className="divide-y divide-linea/70 overflow-hidden rounded-2xl border border-linea bg-white"
      >
        {filas.map((f) => (
          <motion.li key={f.id} variants={fadeInUp} transition={springSmooth} className="flex items-center gap-3 px-4 py-3 text-sm">
            <div className="min-w-0 flex-1">
              {f.productoId ? (
                <Link
                  href={`/admin/stock/kardex/${f.productoId}${f.varianteId ? `?variante=${f.varianteId}` : ""}`}
                  className="block truncate hover:text-bordo-700"
                >
                  {f.producto}
                  {f.variante && <span className="text-muted-foreground"> — {f.variante}</span>}
                </Link>
              ) : (
                <span className="block truncate">{f.producto}</span>
              )}
              {f.sku && <span className="font-mono text-[11px] text-muted-foreground">{f.sku}</span>}
            </div>
            <span className="font-heading tabular-nums text-red-600">−{f.cantidad}</span>
            {f.valor !== null && <span className="w-28 text-right tabular-nums">$ {formatImporte(f.valor)}</span>}
          </motion.li>
        ))}
      </motion.ul>
    </div>
  );
}
