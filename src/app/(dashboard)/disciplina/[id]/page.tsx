import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createSociosClient } from "@/lib/socios/server";
import { getUserRoles } from "@/lib/supabase/roles";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { PESTANAS_PANEL, leerLiquidacion, leerPanel, misDisciplinas, type DatosPanel, type PestanaPanel } from "@/lib/socios/panel-disciplina";
import type { ResumenLiquidacion } from "@/lib/socios/liquidacion-mail";
import { PanelDisciplina } from "@/components/disciplina/panel";
import { SinAcceso } from "@/components/disciplina/selector";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ROLES = ["super_admin", "representante_disciplina", "secretaria", "tesorero", "comision_fiscal"];
/** Roles del club que también cambian datos desde el panel (la Comisión Fiscal solo lee). */
const ROLES_ESCRITURA_CLUB = ["super_admin", "secretaria", "tesorero"];

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return { title: "Panel de la disciplina" };
  const mias = await createSociosClient()
    .then((db) => misDisciplinas(db))
    .catch(() => []);
  const nombre = mias.find((d) => d.disciplina_id === n)?.nombre;
  return { title: nombre ? `${nombre} · Panel` : "Panel de la disciplina" };
}

export default async function PanelDisciplinaPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const roles = await getUserRoles();
  if (!roles.some((r) => ROLES.includes(r))) redirect("/mi-cuenta");

  const { id } = await params;
  const disciplinaId = Number(id);
  if (!Number.isInteger(disciplinaId) || disciplinaId <= 0) notFound();
  const sp = await searchParams;

  const db = await createSociosClient();
  const [datos, mias] = await Promise.all([
    leerPanel(db, disciplinaId).catch((e: unknown) => (e instanceof Error ? e : new Error("Error inesperado"))),
    misDisciplinas(db).catch(() => []),
  ]);
  if (datos instanceof Error) {
    if (/no existe/i.test(datos.message)) notFound();
    return <SinAcceso mensaje={datos.message} />;
  }
  const panel: DatosPanel = datos;
  if (!panel.resumen.disciplina) notFound();

  const representante = mias.some((d) => d.disciplina_id === disciplinaId && d.representante);
  const puedeEditar = representante || roles.some((r) => ROLES_ESCRITURA_CLUB.includes(r));

  const tab = typeof sp.tab === "string" ? sp.tab : "";
  const liqId = typeof sp.liquidacion === "string" ? Number(sp.liquidacion) : NaN;
  let pestana: PestanaPanel = (PESTANAS_PANEL as readonly string[]).includes(tab) ? (tab as PestanaPanel) : "resumen";
  let liquidacion: ResumenLiquidacion | null = null;
  if (Number.isInteger(liqId) && liqId > 0) {
    pestana = "liquidaciones";
    liquidacion = await leerLiquidacion(db, liqId).catch(() => null);
    if (liquidacion && liquidacion.disciplina_id !== disciplinaId) liquidacion = null;
  }

  return (
    <PanelDisciplina
      key={disciplinaId}
      datos={panel}
      pestanaInicial={pestana}
      liquidacionInicial={liquidacion}
      puedeEditar={puedeEditar}
      hoy={hoyUruguay()}
      variasDisciplinas={mias.length > 1}
    />
  );
}
