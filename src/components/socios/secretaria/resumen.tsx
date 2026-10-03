"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ChevronRight,
  CreditCard,
  Dumbbell,
  FileSpreadsheet,
  Tags,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha } from "@/lib/contabilidad/formato";
import { NOMBRE_MEDIO } from "@/lib/socios/esquemas";
import type { FilaPadron, Kpis } from "@/lib/socios/padron";
import { BotonLink, EncabezadoPagina, ImporteAnimado, Kpi, NumeroAnimado, Panel } from "./ui";

export function ResumenSecretaria({
  kpis,
  porDisciplina,
  altas,
  bajas,
  medios,
  sinMedio,
  puedeGestionar,
}: {
  kpis: Kpis;
  porDisciplina: { disciplina: string; socios: number }[];
  altas: FilaPadron[];
  bajas: FilaPadron[];
  medios: { medio: string; cantidad: number }[];
  sinMedio: number;
  puedeGestionar: boolean;
}) {
  const maxDisc = Math.max(1, ...porDisciplina.map((d) => d.socios));
  const totalMedios = medios.reduce((s, m) => s + m.cantidad, 0) + sinMedio;

  const accesos = [
    { href: "/secretaria/socios", titulo: "Padrón de socios", texto: `${kpis.vigentes.toLocaleString("es-UY")} vigentes`, icono: Users },
    { href: "/secretaria/socios?situacion=morosos", titulo: "Morosos", texto: `${kpis.morosos} fuera de tolerancia`, icono: AlertTriangle },
    ...(puedeGestionar
      ? [
          { href: "/secretaria/socios/nuevo", titulo: "Nuevo socio", texto: "Alta o reingreso", icono: UserPlus },
          { href: "/secretaria/socios/importar", titulo: "Importar padrón", texto: "Desde una planilla Excel", icono: FileSpreadsheet },
        ]
      : []),
    { href: "/secretaria/planes", titulo: "Planes y cuotas", texto: "Cuota social y categorías", icono: Tags },
    { href: "/secretaria/disciplinas", titulo: "Disciplinas", texto: "Deportes del club", icono: Dumbbell },
  ];

  return (
    <div className="space-y-5 pb-10">
      <EncabezadoPagina eyebrow="Club Seminario" titulo="Secretaría" descripcion="Socios, membresías y disciplinas.">
        {puedeGestionar && (
          <BotonLink href="/secretaria/socios/nuevo">
            <UserPlus className="size-4" />
            Nuevo socio
          </BotonLink>
        )}
      </EncabezadoPagina>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Socios vigentes">
          <NumeroAnimado valor={kpis.vigentes} />
        </Kpi>
        <Kpi etiqueta="Altas del mes" tono={kpis.altasMes > 0 ? "bueno" : "neutro"} delay={0.05}>
          <NumeroAnimado valor={kpis.altasMes} />
        </Kpi>
        <Kpi etiqueta="Bajas del mes" delay={0.1}>
          <NumeroAnimado valor={kpis.bajasMes} />
        </Kpi>
        <Kpi
          etiqueta="Morosos"
          tono={kpis.morosos > 0 ? "alerta" : "neutro"}
          delay={0.15}
          detalle={
            kpis.conDeuda > 0 ? (
              <>
                {kpis.conDeuda} con vencidas · <ImporteAnimado valor={kpis.deudaVencida} moneda="UYU" />
              </>
            ) : (
              "Sin deuda vencida"
            )
          }
        >
          <NumeroAnimado valor={kpis.morosos} />
        </Kpi>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
        <Panel titulo="Socios por disciplina" icono={Dumbbell} delay={0.1} className="lg:col-span-2">
          {porDisciplina.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Todavía no hay inscripciones a disciplinas.</p>
          ) : (
            <ul className="space-y-2.5 p-4">
              {porDisciplina.map((d, i) => (
                <li key={d.disciplina} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
                  <span className="truncate">{d.disciplina}</span>
                  <div className="h-2.5 overflow-hidden rounded-full bg-superficie">
                    <motion.div
                      className="h-full rounded-full bg-bordo-700"
                      initial={{ width: 0 }}
                      animate={{ width: `${(d.socios / maxDisc) * 100}%` }}
                      transition={{ duration: 0.7, delay: 0.2 + i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </div>
                  <span className="w-10 text-right font-medium tabular-nums">
                    <NumeroAnimado valor={d.socios} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel titulo="Accesos" delay={0.15}>
          <ul className="p-2">
            {accesos.map((a, i) => {
              const Icono = a.icono;
              return (
                <motion.li key={a.href} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.04 }}>
                  <Link href={a.href} className="group flex items-center gap-3 rounded-xl p-2.5 transition-colors hover:bg-superficie">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-bordo-50 text-bordo-800">
                      <Icono className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{a.titulo}</span>
                      <span className="block truncate text-xs text-muted-foreground">{a.texto}</span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </motion.li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Movimientos titulo="Últimas altas" icono={UserPlus} filas={altas} campo="alta" vacio="Sin altas en los últimos 60 días." />
        <Movimientos titulo="Últimas bajas" icono={UserMinus} filas={bajas} campo="baja" vacio="Sin bajas en los últimos 60 días." />
        <Panel titulo="Medio de cobro" icono={CreditCard} delay={0.25}>
          {totalMedios === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Sin socios vigentes.</p>
          ) : (
            <ul className="space-y-3 p-4">
              {[...medios.map((m) => ({ etiqueta: NOMBRE_MEDIO[m.medio] ?? m.medio, n: m.cantidad })), { etiqueta: "Sin medio cargado", n: sinMedio }]
                .filter((m) => m.n > 0)
                .map((m, i) => (
                  <li key={m.etiqueta} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>{m.etiqueta}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {m.n} · {Math.round((m.n / totalMedios) * 100)}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-superficie">
                      <motion.div
                        className={cn("h-full rounded-full", m.etiqueta === "Sin medio cargado" ? "bg-dorado-400" : "bg-bordo-700")}
                        initial={{ width: 0 }}
                        animate={{ width: `${(m.n / totalMedios) * 100}%` }}
                        transition={{ duration: 0.7, delay: 0.3 + i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                      />
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Movimientos({
  titulo,
  icono,
  filas,
  campo,
  vacio,
}: {
  titulo: string;
  icono: typeof Users;
  filas: FilaPadron[];
  campo: "alta" | "baja";
  vacio: string;
}) {
  return (
    <Panel titulo={titulo} icono={icono} delay={0.2}>
      {filas.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">{vacio}</p>
      ) : (
        <ul className="divide-y divide-linea">
          {filas.map((f, i) => (
            <motion.li key={f.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 + i * 0.03 }}>
              <Link href={`/secretaria/socios/${f.id}`} className="flex items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-superficie/60">
                <span className="min-w-0 truncate">
                  {f.apellido}, {f.nombre}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatFecha(f[campo])}</span>
              </Link>
            </motion.li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
