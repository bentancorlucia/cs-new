import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSociosClient } from "@/lib/socios/server";
import { getUserRoles } from "@/lib/supabase/roles";
import { leerResumen, misDisciplinas, type ResumenDisciplina } from "@/lib/socios/panel-disciplina";
import { SelectorDisciplinas } from "@/components/disciplina/selector";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Panel de la disciplina" };

const ROLES = ["super_admin", "representante_disciplina", "secretaria", "tesorero", "comision_fiscal"];

export default async function DisciplinasPanelPage() {
  const roles = await getUserRoles();
  if (!roles.some((r) => ROLES.includes(r))) redirect("/mi-cuenta");

  const db = await createSociosClient();
  let error: string | null = null;
  let disciplinas: Awaited<ReturnType<typeof misDisciplinas>> = [];
  try {
    disciplinas = await misDisciplinas(db);
  } catch (e) {
    error = e instanceof Error ? e.message : "Error inesperado";
  }

  // El representante de una sola disciplina va directo a su panel.
  const propias = disciplinas.filter((d) => d.representante);
  const staff = roles.some((r) => r !== "representante_disciplina" && ROLES.includes(r));
  if (!error && disciplinas.length === 1) redirect(`/disciplina/${disciplinas[0].disciplina_id}`);
  if (!error && !staff && propias.length === 1) redirect(`/disciplina/${propias[0].disciplina_id}`);

  // Las cifras de cada tarjeta (una lectura por disciplina): solo si son pocas.
  const conCifras = disciplinas.length <= 12 ? disciplinas : disciplinas.filter((d) => d.representante);
  const resumenes = await Promise.allSettled(conCifras.map((d) => leerResumen(db, d.disciplina_id)));
  const porId = new Map<number, ResumenDisciplina>();
  resumenes.forEach((r, i) => {
    if (r.status === "fulfilled") porId.set(conCifras[i].disciplina_id, r.value);
  });

  return (
    <SelectorDisciplinas
      error={error}
      disciplinas={disciplinas.map((d) => {
        const r = porId.get(d.disciplina_id);
        return {
          ...d,
          activa: r?.disciplina.activa ?? true,
          socios: r?.socios ?? null,
          morosos: r?.morosos ?? null,
          pendientes: r?.cambios_pendientes ?? null,
          saldo: r?.cuenta?.saldo ?? null,
        };
      })}
    />
  );
}
