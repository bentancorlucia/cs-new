import type { Metadata } from "next";
import { createComunicacionesClient, permisosComunicaciones } from "@/lib/comunicaciones/server";
import { PlantillasLista } from "@/components/comunicaciones/plantillas-lista";
import type { PlantillaFila } from "@/components/comunicaciones/tipos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Plantillas de correo" };

export default async function PlantillasPage() {
  const db = await createComunicacionesClient();
  const [permisos, { data, error }, { data: autos }] = await Promise.all([
    permisosComunicaciones(),
    db
      .from("plantillas")
      .select("id, clave, nombre, categoria, asunto, cuerpo, sistema, activa, updated_at")
      .order("sistema", { ascending: false })
      .order("nombre"),
    db.from("automatizaciones").select("nombre, plantilla_clave"),
  ]);
  const usos: Record<string, string[]> = {};
  for (const a of autos ?? []) (usos[a.plantilla_clave] ??= []).push(a.nombre);
  return (
    <PlantillasLista
      plantillas={(data ?? []) as PlantillaFila[]}
      usos={usos}
      puedeGestionar={permisos.puedeGestionar}
      error={error?.message ?? null}
    />
  );
}
