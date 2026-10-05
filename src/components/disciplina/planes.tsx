"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, CreditCard, Layers, Plus, Tag, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatImporte } from "@/lib/contabilidad/formato";
import { inicioMes, nombrePeriodo, r2 } from "@/lib/socios/cuotas";
import { nombreSocio, type PlanDisciplina, type PlanesDisciplina, type SocioDisciplina } from "@/lib/socios/panel-disciplina";
import { Boton, Explicacion, Panel, Pastilla, Vacio } from "@/components/socios/cuotas/ui";
import type { AccionPanel } from "./dialogos";
import { MedioSocioTexto } from "./ui";

export function PlanesPanel({
  planes,
  socios,
  puedeEditar,
  abrir,
  hoy,
}: {
  planes: PlanesDisciplina;
  socios: SocioDisciplina[];
  puedeEditar: boolean;
  abrir: (a: AccionPanel) => void;
  hoy: string;
}) {
  const [abierto, setAbierto] = useState<number | null>(null);
  const mes = inicioMes(hoy);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 rounded-2xl border border-dorado-300 bg-dorado-100/40 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="text-sm">
          <div className="font-heading">Cómo se arma la cuota</div>
          <p className="text-xs text-muted-foreground">
            Cada socio paga la cuota social del club ({formatImporte(planes.cuota_social, "UYU")}) más el plan de la disciplina. Lo de la disciplina
            vuelve en la liquidación mensual.
          </p>
        </div>
        {puedeEditar && (
          <Boton onClick={() => abrir({ tipo: "nuevo_plan" })} className="w-full shrink-0 sm:w-auto">
            <Plus className="size-4" />
            Nuevo plan
          </Boton>
        )}
      </motion.div>

      {planes.planes.length === 0 ? (
        <Vacio icono={Layers} titulo="La disciplina no tiene planes" texto="Creá el primero para poder dar de alta socios." />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {planes.planes.map((p, i) => (
            <TarjetaPlan
              key={p.plan_id}
              p={p}
              i={i}
              social={planes.cuota_social}
              mes={mes}
              socios={socios.filter((s) => s.inscripciones.some((x) => x.vigente && x.plan_id === p.plan_id))}
              abierto={abierto === p.plan_id}
              alternar={() => setAbierto(abierto === p.plan_id ? null : p.plan_id)}
              puedeEditar={puedeEditar}
              abrir={abrir}
            />
          ))}
        </div>
      )}
    </>
  );
}

function TarjetaPlan({
  p,
  i,
  social,
  mes,
  socios,
  abierto,
  alternar,
  puedeEditar,
  abrir,
}: {
  p: PlanDisciplina;
  i: number;
  social: number;
  mes: string;
  socios: SocioDisciplina[];
  abierto: boolean;
  alternar: () => void;
  puedeEditar: boolean;
  abrir: (a: AccionPanel) => void;
}) {
  const proximos = p.precios.filter((x) => x.vigente_desde > mes);
  const historia = p.precios.filter((x) => x.vigente_desde <= mes);
  return (
    <Panel
      delay={0.04 * i}
      titulo={
        <span className="flex items-center gap-2">
          {p.nombre}
          {!p.activo && <Pastilla>Desactivado</Pastilla>}
        </span>
      }
      icono={Layers}
      accion={
        puedeEditar && p.activo ? (
          <Boton variante="secundario" className="h-8 px-3 text-xs" onClick={() => abrir({ tipo: "precio", plan: p })}>
            <Tag className="size-3.5" />
            Nuevo precio
          </Boton>
        ) : undefined
      }
      className={cn(!p.activo && "opacity-75")}
    >
      <div className="grid grid-cols-3 divide-x divide-linea border-b border-linea text-center">
        <div className="px-2 py-3">
          <div className="text-[10px] uppercase tracking-editorial text-muted-foreground">Disciplina</div>
          <div className="font-heading text-base tabular-nums">{p.precio_vigente === null ? "—" : formatImporte(p.precio_vigente)}</div>
        </div>
        <div className="px-2 py-3">
          <div className="text-[10px] uppercase tracking-editorial text-muted-foreground">Paga el socio</div>
          <div className="font-heading text-base tabular-nums text-bordo-800">
            {p.precio_vigente === null ? "—" : formatImporte(r2(social + p.precio_vigente))}
          </div>
        </div>
        <div className="px-2 py-3">
          <div className="text-[10px] uppercase tracking-editorial text-muted-foreground">Inscriptos</div>
          <div className="font-heading text-base tabular-nums">{p.inscriptos}</div>
          <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
            <CreditCard className="size-3" />
            {p.con_debito} con débito
          </div>
        </div>
      </div>

      {proximos.length > 0 && (
        <div className="space-y-1 border-b border-linea bg-sky-50/50 px-4 py-2">
          {proximos.map((x) => (
            <div key={x.vigente_desde} className="text-xs text-sky-900">
              Desde {nombrePeriodo(x.vigente_desde).toLowerCase()}: {formatImporte(x.importe_mensual)} (el socio paga{" "}
              {formatImporte(r2(social + x.importe_mensual))})
            </div>
          ))}
        </div>
      )}

      {historia.length > 1 && (
        <div className="border-b border-linea px-4 py-2">
          <div className="mb-1 text-[10px] uppercase tracking-editorial text-muted-foreground">Precios anteriores</div>
          <div className="flex flex-wrap gap-1.5">
            {historia.slice(1, 7).map((x) => (
              <span key={x.vigente_desde} className="rounded-full bg-superficie px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                {nombrePeriodo(x.vigente_desde)}: {formatImporte(x.importe_mensual)}
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-superficie/50"
      >
        <span className="flex items-center gap-2 text-muted-foreground">
          <Users className="size-4" />
          {socios.length ? `Ver quiénes están (${socios.length})` : "Nadie en este plan"}
        </span>
        <motion.span animate={{ rotate: abierto ? 180 : 0 }}>
          <ChevronDown className="size-4 text-muted-foreground" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {abierto && socios.length > 0 && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="divide-y divide-linea overflow-hidden border-t border-linea"
          >
            {socios.map((s) => (
              <li key={s.persona_id} className="flex flex-col gap-0.5 px-4 py-2 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <span className="truncate">{nombreSocio(s)}</span>
                <MedioSocioTexto medio={s.medio} vencida={s.tarjeta_vencida} className="text-xs text-muted-foreground" />
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
      {p.con_debito > 0 && puedeEditar && p.activo && (
        <div className="border-t border-linea px-4 py-2">
          <Explicacion>Si cambiás el precio, tesorería ajusta el importe de los {p.con_debito} débitos en Visa.</Explicacion>
        </div>
      )}
    </Panel>
  );
}
