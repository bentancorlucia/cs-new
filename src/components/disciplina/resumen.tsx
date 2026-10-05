"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  CreditCard,
  HandCoins,
  Mail,
  Receipt,
  UserPlus,
  UserRound,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFecha } from "@/lib/contabilidad/formato";
import { mesLiquidacion, montoLiquidacion, resultadoLiquidacion } from "@/lib/socios/liquidacion-resumen";
import type { CambioDisciplina, PestanaPanel, ResumenDisciplina } from "@/lib/socios/panel-disciplina";
import { Explicacion, NumeroAnimado, Panel, Pastilla } from "@/components/socios/cuotas/ui";
import { Cifra, ImporteContador, SaldoNeto } from "@/components/socios/disciplinas/ui";
import type { AccionPanel } from "./dialogos";
import { BadgeTipoCambio } from "./ui";

export function ResumenPanel({
  resumen,
  cambios,
  puedeEditar,
  abrir,
  irA,
  verLiquidacion,
}: {
  resumen: ResumenDisciplina;
  cambios: CambioDisciplina[];
  puedeEditar: boolean;
  abrir: (a: AccionPanel) => void;
  irA: (p: PestanaPanel) => void;
  verLiquidacion: (id: number | null) => void;
}) {
  const saldo = resumen.cuenta?.saldo ?? 0;
  const liq = resumen.ultima_liquidacion;
  const res = liq ? resultadoLiquidacion(liq) : null;
  const pendientes = cambios.filter((c) => c.estado_debito === "pendiente");

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra
          etiqueta="Socios"
          icono={Users}
          detalle={`${resumen.altas_mes} alta${resumen.altas_mes === 1 ? "" : "s"} y ${resumen.bajas_mes} baja${resumen.bajas_mes === 1 ? "" : "s"} este mes`}
        >
          <NumeroAnimado valor={resumen.socios} />
        </Cifra>
        <Cifra etiqueta="Con débito" icono={CreditCard} delay={0.04} detalle={resumen.socios ? `${Math.round((resumen.con_debito / resumen.socios) * 100)}% paga con Visa` : undefined}>
          <NumeroAnimado valor={resumen.con_debito} />
        </Cifra>
        <Cifra
          etiqueta="Morosos"
          icono={AlertTriangle}
          tono={resumen.morosos > 0 ? "alerta" : "bueno"}
          delay={0.08}
          detalle={resumen.deuda_socios > 0 ? <>Deben <ImporteContador valor={resumen.deuda_socios} /> de la disciplina</> : "Todos al día"}
        >
          <NumeroAnimado valor={resumen.morosos} />
        </Cifra>
        <Cifra etiqueta="Con el club" icono={BookOpen} delay={0.12} tono={saldo > 0.004 ? "alerta" : saldo < -0.004 ? "dorado" : "neutro"} detalle="Saldo neto de la cuenta corriente">
          <span className="text-base sm:text-lg">
            <SaldoNeto neto={saldo} corto />
          </span>
        </Cifra>
      </div>

      {puedeEditar && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="grid grid-cols-2 gap-3"
        >
          {[
            { t: "Alta de socio", d: "Sumá a alguien a la disciplina", i: UserPlus, a: { tipo: "alta" } as AccionPanel },
            { t: "Registrar cobro", d: "Un pago que recibió la disciplina", i: HandCoins, a: { tipo: "cobro", socio: null } as AccionPanel },
          ].map((x) => (
            <motion.button
              key={x.t}
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => abrir(x.a)}
              className="group flex items-center gap-3 rounded-2xl border border-linea bg-white p-3 text-left transition-shadow hover:shadow-card-hover sm:p-4"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-dorado-300 text-bordo-950 transition-transform group-hover:scale-105">
                <x.i className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{x.t}</span>
                <span className="hidden text-xs text-muted-foreground sm:block">{x.d}</span>
              </span>
            </motion.button>
          ))}
        </motion.div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel
          titulo="Última liquidación"
          icono={Receipt}
          delay={0.1}
          accion={
            <button type="button" onClick={() => irA("liquidaciones")} className="text-xs font-medium text-bordo-800 hover:underline">
              Ver todas
            </button>
          }
        >
          {liq && res ? (
            <div className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-heading text-base capitalize">{mesLiquidacion(liq.periodo)}</div>
                  <div className="text-xs text-muted-foreground">
                    {liq.socios} socios · cobrado {montoLiquidacion(liq.cobrado)}
                  </div>
                </div>
                {res.signo > 0 ? (
                  <Pastilla tono={liq.saldo > 0.004 ? "alerta" : "bueno"}>{liq.saldo > 0.004 ? "Pendiente de pago" : "Pagada"}</Pastilla>
                ) : res.signo < 0 ? (
                  <Pastilla tono="alerta">A depositar</Pastilla>
                ) : (
                  <Pastilla>Sin saldo</Pastilla>
                )}
              </div>
              <div
                className={cn(
                  "flex items-center justify-between gap-3 rounded-xl px-3 py-3",
                  res.signo > 0 ? "bg-amber-50/70" : res.signo < 0 ? "bg-rose-50/70" : "bg-superficie"
                )}
              >
                <span className={cn("text-sm", res.signo < 0 ? "text-rose-800" : "text-bordo-800")}>{res.texto}</span>
                <span className={cn("font-heading text-xl tabular-nums", res.signo < 0 ? "text-rose-800" : "text-bordo-800")}>
                  <ImporteContador valor={res.importe} moneda="UYU" />
                </span>
              </div>
              {res.signo > 0 && liq.pagado > 0 && liq.saldo > 0.004 && (
                <Explicacion>
                  Pagado {montoLiquidacion(liq.pagado)} · falta {montoLiquidacion(liq.saldo)}
                </Explicacion>
              )}
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => verLiquidacion(liq.id)}
                className="group inline-flex items-center gap-1 text-sm font-medium text-bordo-800"
              >
                Ver el detalle
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </motion.button>
            </div>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">Todavía no hay liquidaciones de la disciplina.</p>
          )}
        </Panel>

        <Panel
          titulo="Pendiente en tesorería"
          icono={Clock}
          delay={0.14}
          accion={
            <button type="button" onClick={() => irA("cambios")} className="text-xs font-medium text-bordo-800 hover:underline">
              Ver cambios
            </button>
          }
        >
          {pendientes.length === 0 ? (
            <div className="flex items-center gap-2 p-4 text-sm text-emerald-700">
              <CheckCircle2 className="size-4" />
              Tesorería ya cargó en Visa todos los cambios.
            </div>
          ) : (
            <>
              <p className="border-b border-linea px-4 py-2 text-xs text-muted-foreground">
                {pendientes.length} cambio{pendientes.length === 1 ? "" : "s"} que tesorería todavía tiene que cargar en el débito Visa.
              </p>
              <ul className="divide-y divide-linea">
                {pendientes.slice(0, 5).map((c, i) => (
                  <motion.li
                    key={c.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.18 + i * 0.04 }}
                    className="space-y-1 px-4 py-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <BadgeTipoCambio tipo={c.tipo} />
                      <span className="text-[11px] text-muted-foreground">{formatFecha(c.created_at.slice(0, 10))}</span>
                    </div>
                    <div className="text-sm">{c.descripcion}</div>
                  </motion.li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      </div>

      <Panel titulo="Representantes" icono={UserRound} delay={0.18}>
        {resumen.representantes.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">La disciplina no tiene representantes cargados. Pedíselo a secretaría.</p>
        ) : (
          <ul className="grid grid-cols-1 divide-y divide-linea sm:grid-cols-2 sm:divide-y-0">
            {resumen.representantes.map((r, i) => (
              <motion.li
                key={r.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.04 }}
                className="flex items-start gap-3 px-4 py-3"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bordo-50 font-heading text-sm text-bordo-800">
                  {r.nombre.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="truncate text-sm font-medium">
                    {r.nombre}
                    {r.cargo && <span className="font-normal text-muted-foreground"> · {r.cargo}</span>}
                  </div>
                  {r.email && (
                    <a href={`mailto:${r.email}`} className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-bordo-800">
                      <Mail className="size-3 shrink-0" />
                      <span className="truncate">{r.email}</span>
                    </a>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {r.recibe_liquidacion && <Pastilla tono="info">Recibe la liquidación</Pastilla>}
                    {r.acceso_panel && <Pastilla tono={r.con_cuenta ? "bueno" : "neutro"}>{r.con_cuenta ? "Entra al panel" : "Sin cuenta todavía"}</Pastilla>}
                  </div>
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
