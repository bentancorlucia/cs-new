"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, BarChart3, Download, History, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatFecha, NOMBRE_MES } from "@/lib/contabilidad/formato";
import { NOMBRE_MEDIO } from "@/lib/socios/cuotas";
import type { SociosDeDisciplina } from "@/lib/socios/disciplinas";
import { BadgeAlDia, BadgeMedio, Boton, Filtros, Panel, Pastilla, Vacio, claseControl } from "@/components/socios/cuotas/ui";
import type { DatosDisciplina } from "./form-disciplina";
import { exportarExcel } from "./ui";

type Vista = "vigentes" | "historico";

const sinTildes = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const NOMBRE_ESTADO_INSCRIPCION = { vigente: "Vigente", programada: "Programada", finalizada: "Finalizada" } as const;

export function SociosVista({ disciplina, datos }: { disciplina: DatosDisciplina; datos: SociosDeDisciplina }) {
  const [vista, setVista] = useState<Vista>("vigentes");
  const [texto, setTexto] = useState("");
  const [categoria, setCategoria] = useState<number | "">("");
  const [limite, setLimite] = useState(50);

  const q = sinTildes(texto.trim());
  const coincide = (persona: string, cedula: string, numero: number | null) =>
    !q || sinTildes(persona).includes(q) || cedula.includes(q.replace(/\D/g, "") || "§") || (numero != null && String(numero) === q);

  const vigentes = datos.vigentes.filter((s) => coincide(s.persona, s.cedula, s.numero_socio) && (!categoria || s.plan_ids.includes(categoria)));
  const historico = datos.inscripciones.filter((s) => coincide(s.persona, s.cedula, s.numero_socio) && (!categoria || s.plan_id === categoria));
  const total = vista === "vigentes" ? vigentes.length : historico.length;

  const medio = (m: string | null, d: string | null) => (m === "transferencia_disciplina" && d ? `Cuenta de ${d}` : m ? (NOMBRE_MEDIO[m] ?? m) : "");

  async function exportar() {
    try {
      if (vista === "vigentes") {
        await exportarExcel(
          `socios-${disciplina.slug}.xlsx`,
          "Socios vigentes",
          ["Número", "Socio", "Cédula", "Categoría", "Desde", "Medio de cobro", "Situación", "Cuotas vencidas", "Deuda vencida"],
          vigentes.map((s) => [
            s.numero_socio ?? "",
            s.persona,
            s.cedula,
            s.planes.join("; "),
            formatFecha(s.desde),
            medio(s.medio, s.medioDisciplina),
            s.alDia === null ? "" : s.cuotasVencidas === 0 ? "Al día" : s.alDia ? "Al día (con vencidas)" : "Moroso",
            s.cuotasVencidas,
            s.deudaVencida,
          ]),
          [9, 30, 12, 22, 11, 26, 18, 10, 12]
        );
      } else {
        await exportarExcel(
          `inscripciones-${disciplina.slug}.xlsx`,
          "Histórico",
          ["Número", "Socio", "Cédula", "Categoría", "Periodicidad", "Desde", "Hasta", "Estado", "Motivo de fin"],
          historico.map((s) => [
            s.numero_socio ?? "",
            s.persona,
            s.cedula,
            s.plan,
            s.periodicidad === "anual" ? "Anual" : "Mensual",
            formatFecha(s.desde),
            s.hasta ? formatFecha(s.hasta) : "",
            NOMBRE_ESTADO_INSCRIPCION[s.estado],
            s.motivo_fin ?? "",
          ]),
          [9, 30, 12, 22, 12, 11, 11, 12, 30]
        );
      }
    } catch {
      toast.error("No se pudo armar el Excel");
    }
  }

  const maxMes = Math.max(1, ...datos.porMes.map((m) => Math.max(m.altas, m.bajas)));

  return (
    <>
      <Panel
        titulo="Socios de la disciplina"
        icono={Users}
        accion={
          <Boton variante="secundario" className="h-9 px-3 text-xs" onClick={exportar} disabled={total === 0}>
            <Download className="size-3.5" />
            Excel
          </Boton>
        }
      >
        <div className="space-y-3 border-b border-linea p-4">
          <Filtros<Vista>
            id="vista-socios"
            valor={vista}
            onChange={(v) => {
              setVista(v);
              setLimite(50);
            }}
            opciones={[
              { valor: "vigentes", etiqueta: "Vigentes", cantidad: datos.vigentes.length },
              { valor: "historico", etiqueta: "Histórico", cantidad: datos.inscripciones.length },
            ]}
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_14rem]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={texto}
                onChange={(e) => {
                  setTexto(e.target.value);
                  setLimite(50);
                }}
                placeholder="Nombre, cédula o número de socio…"
                className={cn(claseControl, "pl-9")}
              />
            </div>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value ? Number(e.target.value) : "")} className={claseControl} aria-label="Categoría">
              <option value="">Todas las categorías</option>
              {datos.categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {c.activo ? "" : " (inactiva)"}
                </option>
              ))}
            </select>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={vista} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {total === 0 ? (
              <div className="p-4">
                <Vacio
                  icono={vista === "vigentes" ? Users : History}
                  titulo={q || categoria ? "Nadie coincide con la búsqueda" : vista === "vigentes" ? "La disciplina no tiene socios vigentes" : "Sin inscripciones"}
                  texto={datos.categorias.length === 0 ? "La disciplina no tiene planes (categorías): se cargan en Planes y cuotas." : undefined}
                />
              </div>
            ) : vista === "vigentes" ? (
              <ul className="divide-y divide-linea">
                <AnimatePresence initial={false}>
                  {vigentes.slice(0, limite).map((s, i) => (
                    <motion.li
                      key={s.persona_id}
                      layout="position"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25, delay: Math.min(i, 15) * 0.015 }}
                    >
                      <Link
                        href={`/secretaria/socios/${s.persona_id}`}
                        className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-2.5 text-sm transition-colors hover:bg-superficie/50 md:grid-cols-[minmax(0,1fr)_10rem_7.5rem_13rem_9rem]"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 truncate font-medium group-hover:text-bordo-800">
                            <span className="truncate">{s.persona}</span>
                            <ArrowUpRight className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                          </div>
                          <div className="text-[11px] tabular-nums text-muted-foreground">
                            {s.numero_socio ? `Nº ${s.numero_socio} · ` : ""}CI {s.cedula}
                          </div>
                        </div>
                        <div className="text-right md:hidden">
                          {s.alDia !== null && <BadgeAlDia alDia={s.alDia} vencidas={s.cuotasVencidas} />}
                        </div>
                        <div className="col-span-2 flex flex-wrap gap-1 md:col-span-1">
                          {s.planes.map((p) => (
                            <Pastilla key={p} tono="info">
                              {p}
                            </Pastilla>
                          ))}
                        </div>
                        <div className="hidden text-xs tabular-nums text-muted-foreground md:block">desde {formatFecha(s.desde)}</div>
                        <div className="col-span-2 flex items-center justify-between gap-2 md:col-span-1 md:block">
                          <BadgeMedio medio={s.medio} detalle={s.medio === "transferencia_disciplina" ? s.medioDisciplina : null} />
                          <span className="text-[11px] tabular-nums text-muted-foreground md:hidden">desde {formatFecha(s.desde)}</span>
                        </div>
                        <div className="hidden text-right md:block">{s.alDia !== null && <BadgeAlDia alDia={s.alDia} vencidas={s.cuotasVencidas} />}</div>
                      </Link>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            ) : (
              <ul className="divide-y divide-linea">
                <AnimatePresence initial={false}>
                  {historico.slice(0, limite).map((s, i) => (
                    <motion.li
                      key={s.id}
                      layout="position"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25, delay: Math.min(i, 15) * 0.015 }}
                    >
                      <Link
                        href={`/secretaria/socios/${s.persona_id}`}
                        className={cn(
                          "group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm transition-colors hover:bg-superficie/50 md:grid-cols-[minmax(0,1fr)_10rem_12rem_minmax(0,12rem)]",
                          s.estado === "finalizada" && "text-muted-foreground"
                        )}
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground group-hover:text-bordo-800">{s.persona}</div>
                          <div className="text-[11px] tabular-nums text-muted-foreground">
                            {s.numero_socio ? `Nº ${s.numero_socio} · ` : ""}CI {s.cedula}
                          </div>
                        </div>
                        <div className="text-right md:order-last md:text-left">
                          <Pastilla tono={s.estado === "vigente" ? "bueno" : s.estado === "programada" ? "info" : "neutro"}>{NOMBRE_ESTADO_INSCRIPCION[s.estado]}</Pastilla>
                          {s.motivo_fin && <div className="mt-0.5 hidden truncate text-[11px] md:block">{s.motivo_fin}</div>}
                        </div>
                        <div className="truncate text-xs">
                          {s.plan}
                          {s.periodicidad === "anual" ? " · anual" : ""}
                        </div>
                        <div className="text-right text-xs tabular-nums md:text-left">
                          {formatFecha(s.desde)} → {s.hasta ? formatFecha(s.hasta) : "hoy"}
                        </div>
                        {s.motivo_fin && <div className="col-span-2 truncate text-[11px] md:hidden">{s.motivo_fin}</div>}
                      </Link>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
            {total > limite && (
              <div className="border-t border-linea p-3 text-center">
                <button type="button" onClick={() => setLimite((l) => l + 100)} className="text-xs font-medium text-bordo-800 hover:underline">
                  Ver {Math.min(100, total - limite)} más de {total}
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </Panel>

      <Panel titulo="Altas y bajas por mes" icono={BarChart3} delay={0.08}>
        <div className="p-4">
          <div className="flex items-end gap-1.5 overflow-x-auto pb-1 sm:gap-2" role="img" aria-label="Altas y bajas de los últimos 12 meses">
            {datos.porMes.map((m, i) => (
              <div key={m.mes} className="flex min-w-[1.75rem] flex-1 flex-col items-center gap-1">
                <div className="flex h-28 w-full items-end justify-center gap-0.5">
                  <Columna valor={m.altas} max={maxMes} clase="bg-emerald-500" delay={i * 0.03} titulo={`${m.altas} altas`} />
                  <Columna valor={m.bajas} max={maxMes} clase="bg-rose-400" delay={i * 0.03 + 0.05} titulo={`${m.bajas} bajas`} />
                </div>
                <span className="text-[10px] text-muted-foreground">{NOMBRE_MES[Number(m.mes.slice(5, 7)) - 1].slice(0, 3)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-emerald-500" />
              Altas {datos.porMes.reduce((s, m) => s + m.altas, 0)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-rose-400" />
              Bajas {datos.porMes.reduce((s, m) => s + m.bajas, 0)}
            </span>
            <span>Últimos 12 meses. Un cambio de categoría no cuenta como alta ni baja.</span>
          </div>
        </div>
      </Panel>
    </>
  );
}

function Columna({ valor, max, clase, delay, titulo }: { valor: number; max: number; clase: string; delay: number; titulo: string }) {
  return (
    <div className="flex h-full w-2.5 flex-col justify-end sm:w-3" title={titulo}>
      {valor > 0 && <span className="mb-0.5 text-center text-[9px] tabular-nums text-muted-foreground">{valor}</span>}
      <motion.div
        className={cn("w-full rounded-t-sm", clase)}
        initial={{ height: 0 }}
        animate={{ height: `${(valor / max) * 85}%` }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay }}
        style={{ minHeight: valor > 0 ? 3 : 0 }}
      />
    </div>
  );
}
