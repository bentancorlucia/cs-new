"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, HandCoins, MessageCircle, Phone } from "lucide-react";
import { formatImporte } from "@/lib/contabilidad/formato";
import { formatCedula } from "@/lib/socios/esquemas";
import { nombreSocio, planesVigentes, type SocioDisciplina } from "@/lib/socios/panel-disciplina";
import { Boton, Explicacion, NumeroAnimado, Panel, Vacio } from "@/components/socios/cuotas/ui";
import { Cifra, ImporteContador } from "@/components/socios/disciplinas/ui";
import type { AccionPanel } from "./dialogos";
import { MedioSocioTexto, SituacionSocio } from "./ui";

/** Teléfono uruguayo para WhatsApp: 09X XXX XXX → 5989XXXXXXX. */
function whatsapp(tel: string | null): string | null {
  const d = (tel ?? "").replace(/\D/g, "");
  if (/^09\d{7}$/.test(d)) return `598${d.slice(1)}`;
  if (/^5989\d{7}$/.test(d)) return d;
  return null;
}

export function MorososPanel({ morosos, puedeEditar, abrir }: { morosos: SocioDisciplina[]; puedeEditar: boolean; abrir: (a: AccionPanel) => void }) {
  const lista = useMemo(
    () => [...morosos].sort((a, b) => b.deuda_vencida + b.vencido_disciplina - (a.deuda_vencida + a.vencido_disciplina)),
    [morosos]
  );
  const total = lista.reduce((s, x) => s + x.deuda_vencida, 0);
  const tarjetas = lista.filter((s) => s.tarjeta_vencida).length;

  if (lista.length === 0) {
    return <Vacio icono={CheckCircle2} titulo="Nadie atrasado" texto="Todos los socios vigentes de la disciplina están al día." />;
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Cifra etiqueta="Socios atrasados" tono="alerta">
          <NumeroAnimado valor={lista.length} />
        </Cifra>
        <Cifra etiqueta="Deuda vencida" tono="alerta" delay={0.04} detalle="Cuota social + disciplina">
          <ImporteContador valor={total} moneda="UYU" />
        </Cifra>
        <div className="col-span-2 lg:col-span-1">
          <Cifra etiqueta="Con tarjeta vencida" delay={0.08} detalle="Pedile la tarjeta nueva y cargala en el panel">
            <NumeroAnimado valor={tarjetas} />
          </Cifra>
        </div>
      </div>

      <Panel titulo="Ordenados por deuda" icono={HandCoins} delay={0.08}>
        <ul className="divide-y divide-linea">
          <AnimatePresence initial={false}>
            {lista.map((s, i) => {
              const wa = whatsapp(s.telefono);
              return (
                <motion.li
                  key={s.persona_id}
                  layout="position"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(i, 15) * 0.025 }}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{nombreSocio(s)}</span>
                      <span className="shrink-0 font-heading text-base tabular-nums text-rose-700 sm:hidden">{formatImporte(s.deuda_vencida)}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      CI {formatCedula(s.cedula)} · {planesVigentes(s).map((p) => p.plan).join(" + ") || "—"}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <SituacionSocio s={s} />
                      <MedioSocioTexto medio={s.medio} vencida={s.tarjeta_vencida} className="text-muted-foreground" />
                    </div>
                    {s.vencido_disciplina > 0 && (
                      <div className="text-[11px] text-muted-foreground">De la disciplina: {formatImporte(s.vencido_disciplina)} vencido</div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="hidden text-right font-heading text-lg tabular-nums text-rose-700 sm:block">{formatImporte(s.deuda_vencida)}</span>
                    {s.telefono && (
                      <a
                        href={wa ? `https://wa.me/${wa}` : `tel:${s.telefono.replace(/\s/g, "")}`}
                        target={wa ? "_blank" : undefined}
                        rel="noreferrer"
                        aria-label={wa ? "Escribir por WhatsApp" : "Llamar"}
                        className="flex size-10 items-center justify-center rounded-lg border border-linea bg-white text-muted-foreground transition-colors hover:border-bordo-200 hover:text-bordo-800"
                      >
                        {wa ? <MessageCircle className="size-4" /> : <Phone className="size-4" />}
                      </a>
                    )}
                    {puedeEditar && (
                      <Boton variante="secundario" className="flex-1 sm:flex-none" onClick={() => abrir({ tipo: "cobro", socio: s })}>
                        <HandCoins className="size-4" />
                        Registrar cobro
                      </Boton>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
        <div className="border-t border-linea px-4 py-2">
          <Explicacion>
            Moroso: tiene cuotas vencidas sin pagar (de la cuota social o de la disciplina). Si te pagó a vos, registrá el cobro: se aplica a sus cuotas
            y se descuenta en la próxima liquidación.
          </Explicacion>
        </div>
      </Panel>
    </>
  );
}
