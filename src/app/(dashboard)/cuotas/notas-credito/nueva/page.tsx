import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSociosClient } from "@/lib/socios/server";
import { createServerClient } from "@/lib/supabase/server";
import { permisosCuotas } from "@/lib/socios/cuotas-permisos";
import { cuentaPersona } from "@/lib/socios/cuotas";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import { NotaCreditoForm } from "@/components/socios/cuotas/notas-credito";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nueva nota de crédito" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NuevaNotaCreditoPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const permisos = await permisosCuotas();
  if (!permisos.puedeTesoreria) redirect("/cuotas/notas-credito");
  const hoy = hoyUruguay();
  const personaId = Number(typeof sp.persona === "string" ? sp.persona : "") || null;
  const [db, padron] = await Promise.all([createSociosClient(), createServerClient()]);
  const inicial = personaId ? await cuentaPersona(db, padron, personaId, hoy).catch(() => null) : null;
  return <NotaCreditoForm hoy={hoy} inicial={inicial} />;
}
