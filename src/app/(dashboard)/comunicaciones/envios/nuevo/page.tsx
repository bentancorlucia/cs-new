import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createComunicacionesClient, permisosComunicaciones } from "@/lib/comunicaciones/server";
import { createServerClient } from "@/lib/supabase/server";
import { leerConfig } from "@/lib/comunicaciones/consultas";
import { EnvioNuevo } from "@/components/comunicaciones/envio-nuevo";
import type { PlantillaFila } from "@/components/comunicaciones/tipos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nuevo envío" };

export default async function NuevoEnvioPage({ searchParams }: { searchParams: Promise<{ plantilla?: string }> }) {
  const { puedeGestionar } = await permisosComunicaciones();
  if (!puedeGestionar) redirect("/comunicaciones/envios");
  const db = await createComunicacionesClient();
  const publico = await createServerClient();
  const [{ plantilla }, { data: plantillas }, { data: disciplinas }, config] = await Promise.all([
    searchParams,
    db
      .from("plantillas")
      .select("id, clave, nombre, categoria, asunto, cuerpo, sistema, activa, updated_at, formato, usa_molde, transaccional, asunto_original, cuerpo_original, encabezado, encabezado_original")
      .eq("activa", true)
      .eq("transaccional", false)
      .order("nombre"),
    publico.from("disciplinas").select("id, nombre").eq("activa", true).order("nombre"),
    leerConfig(db),
  ]);
  return (
    <EnvioNuevo
      plantillas={(plantillas ?? []) as PlantillaFila[]}
      disciplinas={disciplinas ?? []}
      pie={config?.pie ?? null}
      moldeHtml={config?.molde_html ?? null}
      plantillaInicial={plantilla ?? null}
    />
  );
}
