import type { Metadata } from "next";
import { createComunicacionesClient, permisosComunicaciones } from "@/lib/comunicaciones/server";
import { EnviosLista } from "@/components/comunicaciones/envios-lista";
import type { EnvioResumen } from "@/components/comunicaciones/tipos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Envíos" };

export default async function EnviosPage() {
  const db = await createComunicacionesClient();
  const [permisos, { data, error }] = await Promise.all([
    permisosComunicaciones(),
    db
      .from("envios_resumen")
      .select(
        "id, nombre, asunto, categoria, estado, origen, programado_para, created_at, total, pendientes, enviando, enviados, fallidos, omitidos, cancelados"
      )
      .order("created_at", { ascending: false })
      .limit(300),
  ]);
  return (
    <EnviosLista
      envios={(data ?? []) as EnvioResumen[]}
      puedeGestionar={permisos.puedeGestionar}
      error={error?.message ?? null}
    />
  );
}
