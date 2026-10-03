import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createComunicacionesClient, permisosComunicaciones } from "@/lib/comunicaciones/server";
import { leerConfig } from "@/lib/comunicaciones/consultas";
import { PlantillaEditor } from "@/components/comunicaciones/plantilla-editor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nueva plantilla" };

export default async function NuevaPlantillaPage() {
  const { puedeGestionar } = await permisosComunicaciones();
  if (!puedeGestionar) redirect("/comunicaciones/plantillas");
  const config = await leerConfig(await createComunicacionesClient());
  return <PlantillaEditor plantilla={null} pie={config?.pie ?? null}
      moldeHtml={config?.molde_html ?? null} puedeGestionar usos={[]} />;
}
