import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSociosClient } from "@/lib/socios/server";
import { createServerClient } from "@/lib/supabase/server";
import { permisosCuotas } from "@/lib/socios/cuotas-permisos";
import { listarCreditos } from "@/lib/socios/cuotas";
import { NotasCreditoLista } from "@/components/socios/cuotas/notas-credito";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notas de crédito" };

export default async function NotasCreditoPage() {
  const permisos = await permisosCuotas();
  if (!permisos.verTesoreria) redirect("/cuotas");
  const [db, padron] = await Promise.all([createSociosClient(), createServerClient()]);
  const creditos = await listarCreditos(db, padron);
  return <NotasCreditoLista creditos={creditos} puedeOperar={permisos.puedeTesoreria} />;
}
