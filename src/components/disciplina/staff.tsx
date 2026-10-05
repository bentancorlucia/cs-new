"use client";

import { useMemo, useState } from "react";
import { UserCog, UserPlus } from "lucide-react";
import type { SocioDisciplina } from "@/lib/socios/panel-disciplina";
import type { MiembroStaff } from "@/lib/socios/staff";
import { Boton, Explicacion, Vacio } from "@/components/socios/cuotas/ui";
import { ListaStaff } from "@/components/socios/staff/lista";
import { DialogosStaff, type AccionStaff, type PersonaConocida } from "@/components/socios/staff/dialogos";

/** Pestaña Staff del panel: el representante da de alta, de baja y edita a su gente. */
export function StaffPanel({
  staff,
  socios,
  disciplina,
  puedeEditar,
  hoy,
}: {
  staff: MiembroStaff[];
  socios: SocioDisciplina[];
  disciplina: { id: number; nombre: string };
  puedeEditar: boolean;
  hoy: string;
}) {
  const [accion, setAccion] = useState<AccionStaff | null>(null);

  // Al tipear la cédula, se completan los datos de quien ya conocemos (staff o socios de la disciplina).
  const conocidas = useMemo<PersonaConocida[]>(() => {
    const mapa = new Map<string, PersonaConocida>();
    for (const s of socios) mapa.set(s.cedula, s);
    for (const m of staff) mapa.set(m.cedula, m);
    return [...mapa.values()];
  }, [socios, staff]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Explicacion className="max-w-xl">
          Entrenadores, preparadores, delegados y dirigentes de {disciplina.nombre}. No hace falta que sean socios. Los paga la disciplina.
        </Explicacion>
        {puedeEditar && (
          <Boton onClick={() => setAccion({ tipo: "alta" })} className="w-full sm:w-auto">
            <UserPlus className="size-4" />
            Agregar al staff
          </Boton>
        )}
      </div>

      <ListaStaff
        miembros={staff}
        agrupar="funcion"
        puedeEditar={() => puedeEditar}
        onAccion={setAccion}
        vacio={
          <Vacio icono={UserCog} titulo="Todavía no hay staff cargado" texto="Cargá a entrenadores, preparadores y delegados de la disciplina.">
            {puedeEditar && (
              <Boton onClick={() => setAccion({ tipo: "alta" })}>
                <UserPlus className="size-4" />
                Agregar al staff
              </Boton>
            )}
          </Vacio>
        }
      />

      {puedeEditar && (
        <DialogosStaff accion={accion} disciplina={disciplina} conocidas={conocidas} hoy={hoy} onClose={() => setAccion(null)} />
      )}
    </div>
  );
}
