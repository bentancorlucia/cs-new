"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { UserCog, UserPlus } from "lucide-react";
import type { MiembroStaff } from "@/lib/socios/staff";
import { Boton, EncabezadoPagina, Kpi, NumeroAnimado, Vacio, claseControl } from "@/components/socios/cuotas/ui";
import { ListaStaff } from "./lista";
import { DialogosStaff, type AccionStaff, type DisciplinaStaff } from "./dialogos";

const TODAS = "todas";
const CLUB = "club";

/** Secretaría: el staff de todo el club, agrupado por disciplina. */
export function PaginaStaff({
  staff,
  disciplinas,
  gestionaClub,
  gestionaDisciplinas,
  hoy,
}: {
  staff: MiembroStaff[];
  disciplinas: DisciplinaStaff[];
  gestionaClub: boolean;
  gestionaDisciplinas: boolean;
  hoy: string;
}) {
  const [accion, setAccion] = useState<AccionStaff | null>(null);
  const [filtro, setFiltro] = useState<string>(TODAS);

  const vigentes = staff.filter((m) => m.estado !== "baja");
  const entrenadores = new Set(vigentes.filter((m) => m.funcion === "entrenador" || m.funcion === "asistente").map((m) => m.persona_id)).size;
  const conStaff = new Set(vigentes.filter((m) => m.disciplina_id !== null).map((m) => m.disciplina_id));
  const sinStaff = disciplinas.filter((d) => !conStaff.has(d.id));
  const personas = new Set(vigentes.map((m) => m.persona_id)).size;

  const visibles = useMemo(
    () =>
      filtro === TODAS
        ? staff
        : staff.filter((m) => (filtro === CLUB ? m.disciplina_id === null : String(m.disciplina_id) === filtro)),
    [staff, filtro]
  );

  const puedeAgregar = gestionaClub || gestionaDisciplinas;
  const puedeEditar = (m: MiembroStaff) => (m.disciplina_id === null ? gestionaClub : gestionaDisciplinas);

  return (
    <div className="min-w-0 space-y-6 pb-8">
      <EncabezadoPagina
        eyebrow="Secretaría"
        titulo="Staff"
        descripcion="Entrenadores, preparadores, delegados, dirigentes y personal del club. Cada disciplina carga y paga a su staff desde su panel."
      >
        {puedeAgregar && (
          <Boton onClick={() => setAccion({ tipo: "alta" })} className="w-full whitespace-nowrap sm:w-auto">
            <UserPlus className="size-4" />
            Agregar al staff
          </Boton>
        )}
      </EncabezadoPagina>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi etiqueta="Personas en el staff" delay={0}>
          <NumeroAnimado valor={personas} />
        </Kpi>
        <Kpi etiqueta="Entrenadores y asistentes" delay={0.05}>
          <NumeroAnimado valor={entrenadores} />
        </Kpi>
        <Kpi etiqueta="Disciplinas con staff" delay={0.1} detalle={`de ${disciplinas.length} activas`}>
          <NumeroAnimado valor={conStaff.size} />
        </Kpi>
        <Kpi
          etiqueta="Disciplinas sin staff"
          delay={0.15}
          tono={sinStaff.length > 0 ? "alerta" : "bueno"}
          detalle={
            sinStaff.length === 0
              ? "Todas tienen a alguien cargado"
              : sinStaff.length <= 4
                ? sinStaff.map((d) => d.nombre).join(", ")
                : `${sinStaff
                    .slice(0, 3)
                    .map((d) => d.nombre)
                    .join(", ")} y ${sinStaff.length - 3} más`
          }
        >
          <NumeroAnimado valor={sinStaff.length} />
        </Kpi>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.35 }} className="max-w-xs">
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Disciplina" className={claseControl}>
          <option value={TODAS}>Todas las disciplinas</option>
          <option value={CLUB}>Personal del club</option>
          {disciplinas.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </select>
      </motion.div>

      <ListaStaff
        miembros={visibles}
        agrupar="disciplina"
        puedeEditar={puedeEditar}
        onAccion={setAccion}
        enlacePanel
        vacio={
          <Vacio
            icono={UserCog}
            titulo={filtro === TODAS ? "Todavía no hay staff cargado" : "Sin staff en esta selección"}
            texto="Los representantes lo cargan desde el panel de su disciplina; también se puede agregar desde acá."
          >
            {puedeAgregar && (
              <Boton onClick={() => setAccion({ tipo: "alta" })}>
                <UserPlus className="size-4" />
                Agregar al staff
              </Boton>
            )}
          </Vacio>
        }
      />

      {puedeAgregar && (
        <DialogosStaff
          accion={accion}
          disciplinas={gestionaDisciplinas ? disciplinas : []}
          permitirClub={gestionaClub}
          conocidas={staff}
          hoy={hoy}
          onClose={() => setAccion(null)}
        />
      )}
    </div>
  );
}
