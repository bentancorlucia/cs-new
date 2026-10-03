import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createComunicacionesClient, permisosComunicaciones } from "@/lib/comunicaciones/server";
import { leerConfig } from "@/lib/comunicaciones/consultas";
import { PlantillaEditor } from "@/components/comunicaciones/plantilla-editor";
import type { PlantillaFila } from "@/components/comunicaciones/tipos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Plantilla" };

export default async function PlantillaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await createComunicacionesClient();
  const [permisos, { data }, config] = await Promise.all([
    permisosComunicaciones(),
    db
      .from("plantillas")
      .select("id, clave, nombre, categoria, asunto, cuerpo, sistema, activa, updated_at")
      .eq("id", id)
      .maybeSingle(),
    leerConfig(db),
  ]);
  if (!data) notFound();
  const { data: autos } = await db.from("automatizaciones").select("nombre").eq("plantilla_clave", data.clave);
  return (
    <PlantillaEditor
      plantilla={data as PlantillaFila}
      pie={config?.pie ?? null}
      puedeGestionar={permisos.puedeGestionar}
      usos={(autos ?? []).map((a) => a.nombre)}
    />
  );
}
