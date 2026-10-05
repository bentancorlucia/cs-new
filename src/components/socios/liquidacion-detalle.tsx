"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CreditCard, HandCoins, ReceiptText, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { easeSmooth, staggerContainerFast, fadeInUp } from "@/lib/motion";
import { formatImporte } from "@/lib/contabilidad/formato";
import { Panel, Filtros } from "@/components/compras/ui";
import {
  debitoPorCuota,
  mesLiquidacion,
  resultadoLiquidacion,
  type DetalleLiquidacion,
  type ResumenLiquidacion,
} from "@/lib/socios/liquidacion-resumen";

const $ = (v: number) => formatImporte(Number(v ?? 0), "UYU");
const n = (v: unknown) => Number(v ?? 0);

/**
 * Detalle de una liquidación mensual a una disciplina, con el formato de la
 * planilla de tesorería: cuenta del resultado, débito por importe de cuota y
 * el detalle por socio (cobrados, rebotes, social a cargo de la disciplina).
 * Lo usan tesorería y el panel del representante.
 */
export function LiquidacionDetalle({ resumen, className }: { resumen: ResumenLiquidacion; className?: string }) {
  const r = resumen;
  const res = resultadoLiquidacion(r);
  const porCuota = useMemo(() => debitoPorCuota(r.detalle ?? []), [r.detalle]);
  const socialTotal = n(r.visa_social) + n(r.social_a_cargo);

  const filas: { etiqueta: string; detalle?: string; valor: number; signo: "+" | "−" | "" }[] = [
    { etiqueta: "Cobrado por débito Visa", detalle: "La cuota entera de sus socios (incluye la social)", valor: n(r.visa_cobrado), signo: "" },
    {
      etiqueta: "Cuota social del club",
      detalle: `Cobrada en el débito ${$(r.visa_social)} · a cargo de la disciplina ${$(r.social_a_cargo)} · ${r.socios} socios en el mes, cuota social ${$(r.cuota_social)}`,
      valor: socialTotal,
      signo: "−",
    },
    { etiqueta: "Comisión del débito", valor: n(r.gastos_comision), signo: "−" },
    { etiqueta: "IVA de la comisión", valor: n(r.gastos_iva), signo: "−" },
  ];
  if (n(r.otros_cobrado) > 0) {
    filas.push({ etiqueta: "Cuotas de la disciplina cobradas por otros medios", detalle: "Transferencias al club o a la cuenta de la disciplina", valor: n(r.otros_cobrado), signo: "+" });
  }

  return (
    <div className={cn("space-y-4", className)}>
      <Panel titulo={`Liquidación de ${mesLiquidacion(r.periodo)}`} icono={ReceiptText}>
        <motion.ul variants={staggerContainerFast} initial="hidden" animate="visible" className="divide-y divide-linea">
          {filas.map((f) => (
            <motion.li key={f.etiqueta} variants={fadeInUp} className="flex items-start justify-between gap-4 px-4 py-2.5">
              <div className="min-w-0">
                <div className="text-sm text-foreground">
                  {f.signo && <span className="mr-1 text-muted-foreground">{f.signo}</span>}
                  {f.etiqueta}
                </div>
                {f.detalle && <div className="mt-0.5 text-xs text-muted-foreground">{f.detalle}</div>}
              </div>
              <span className="shrink-0 text-sm tabular-nums">{$(f.valor)}</span>
            </motion.li>
          ))}
          <motion.li
            variants={fadeInUp}
            className={cn(
              "flex items-center justify-between gap-4 px-4 py-3",
              res.signo > 0 ? "bg-amber-50/60" : res.signo < 0 ? "bg-rose-50/60" : "bg-superficie"
            )}
          >
            <span className={cn("font-heading text-sm", res.signo < 0 ? "text-rose-800" : "text-bordo-800")}>{res.texto}</span>
            <span className={cn("font-heading text-lg tabular-nums", res.signo < 0 ? "text-rose-800" : "text-bordo-800")}>
              {$(res.importe)}
            </span>
          </motion.li>
        </motion.ul>
        {r.a_pagar > 0 && (
          <div className="border-t border-linea px-4 py-2 text-xs text-muted-foreground">
            Pagado {$(r.pagado)} · pendiente {$(r.saldo)}
          </div>
        )}
      </Panel>

      {porCuota.length > 0 && (
        <Panel titulo="Débito por importe de cuota" icono={CreditCard} delay={0.05}>
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-linea text-[10px] uppercase tracking-editorial text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">Cuota</th>
                  <th className="px-3 py-2 text-right font-medium">Tarjetas</th>
                  <th className="px-3 py-2 text-right font-medium">Rechazos</th>
                  <th className="px-3 py-2 text-right font-medium">Cobradas</th>
                  <th className="px-4 py-2 text-right font-medium">Importe</th>
                </tr>
              </thead>
              <tbody>
                {porCuota.map((g) => (
                  <tr key={g.cuota} className="border-b border-linea/60 last:border-0">
                    <td className="px-4 py-2 tabular-nums">{$(g.cuota)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{g.tarjetas}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", g.rechazos > 0 && "text-rose-700")}>{g.rechazos}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{g.cobradas}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{$(g.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <DetallePorSocio detalle={r.detalle ?? []} />
    </div>
  );
}

type FiltroSocio = "todos" | "cobrados" | "rebotes" | "a_cargo";

function DetallePorSocio({ detalle }: { detalle: DetalleLiquidacion[] }) {
  const [filtro, setFiltro] = useState<FiltroSocio>("todos");
  const cuenta = {
    cobrados: detalle.filter((d) => n(d.visa_disciplina) + n(d.otros_medios) > 0).length,
    rebotes: detalle.filter((d) => n(d.visa_rechazado) > 0).length,
    a_cargo: detalle.filter((d) => n(d.social_a_cargo) > 0).length,
  };
  const filas = detalle.filter((d) =>
    filtro === "cobrados" ? n(d.visa_disciplina) + n(d.otros_medios) > 0
      : filtro === "rebotes" ? n(d.visa_rechazado) > 0
        : filtro === "a_cargo" ? n(d.social_a_cargo) > 0
          : true
  );
  return (
    <Panel titulo="Socios del mes" icono={Users} delay={0.1}>
      <div className="border-b border-linea px-4 py-2.5">
        <Filtros
          id="liq-socios"
          valor={filtro}
          onChange={setFiltro}
          opciones={[
            { valor: "todos", etiqueta: "Todos", cantidad: detalle.length },
            { valor: "cobrados", etiqueta: "Cobrados", cantidad: cuenta.cobrados },
            { valor: "rebotes", etiqueta: "Rebotes", cantidad: cuenta.rebotes },
            { valor: "a_cargo", etiqueta: "Social a cargo", cantidad: cuenta.a_cargo },
          ]}
        />
      </div>
      {filas.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">Nadie con ese filtro.</div>
      ) : (
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-linea text-[10px] uppercase tracking-editorial text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Socio</th>
                <th className="px-3 py-2 text-left font-medium">Débito</th>
                <th className="px-3 py-2 text-right font-medium">Para la disciplina</th>
                <th className="px-3 py-2 text-right font-medium">Otros medios</th>
                <th className="px-4 py-2 text-right font-medium">Social a cargo</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {filas.map((d) => (
                  <motion.tr
                    key={d.persona_id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={easeSmooth}
                    className="border-b border-linea/60 last:border-0"
                  >
                    <td className="px-4 py-2">
                      <div className="text-foreground">{d.nombre}</div>
                      <div className="text-xs text-muted-foreground">
                        {d.planes || "—"}
                        {d.numero_socio ? ` · Nº ${d.numero_socio}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {n(d.visa_rechazado) > 0 ? (
                        <span className="inline-flex items-center gap-1 text-rose-700">
                          <AlertTriangle className="size-3.5" />
                          Rebotó {$(d.visa_rechazado)}
                          {d.motivo_rechazo && <span className="text-xs text-muted-foreground">· {d.motivo_rechazo}</span>}
                        </span>
                      ) : n(d.visa_debitado) > 0 ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CreditCard className="size-3.5" />
                          {$(d.visa_debitado)}
                          {d.tarjeta && <span className="text-xs text-muted-foreground">****{d.tarjeta}</span>}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Sin débito</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{n(d.visa_disciplina) ? $(d.visa_disciplina) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {n(d.otros_medios) ? (
                        <span className="inline-flex items-center gap-1">
                          <HandCoins className="size-3.5 text-muted-foreground" />
                          {$(d.otros_medios)}
                        </span>
                      ) : "—"}
                    </td>
                    <td className={cn("px-4 py-2 text-right tabular-nums", n(d.social_a_cargo) > 0 && "text-rose-700")}>
                      {n(d.social_a_cargo) ? $(d.social_a_cargo) : "—"}
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
