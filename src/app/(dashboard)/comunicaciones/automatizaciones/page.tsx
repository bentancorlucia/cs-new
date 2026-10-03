import type { Metadata } from "next";
import { createComunicacionesClient, permisosComunicaciones } from "@/lib/comunicaciones/server";
import { Automatizaciones, type AutomatizacionFila, type CorridaFila } from "@/components/comunicaciones/automatizaciones";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Automatizaciones de correo" };

export default async function AutomatizacionesPage() {
  const db = await createComunicacionesClient();
  const [permisos, { data: autos, error }, { data: plantillas }, { data: corridas }] = await Promise.all([
    permisosComunicaciones(),
    db.from("automatizaciones").select("clave, nombre, descripcion, activa, modo, plantilla_clave, parametros, updated_at").order("nombre"),
    db.from("plantillas").select("clave, nombre, activa, categoria").order("nombre"),
    db.from("corridas").select("id, clave, periodo, envio_id, cantidad, created_at").order("created_at", { ascending: false }).limit(60),
  ]);

  const ids = (corridas ?? []).map((c) => c.envio_id).filter((x): x is string => !!x);
  const { data: envios } = ids.length
    ? await db.from("envios_resumen").select("id, estado, total, enviados, pendientes").in("id", ids)
    : { data: [] };
  const porId = new Map((envios ?? []).map((e) => [e.id, e]));

  return (
    <Automatizaciones
      automatizaciones={(autos ?? []) as AutomatizacionFila[]}
      plantillas={plantillas ?? []}
      corridas={(corridas ?? []).map((c) => {
        const e = c.envio_id ? porId.get(c.envio_id) : null;
        return {
          ...c,
          envio_estado: e?.estado ?? null,
          enviados: Number(e?.enviados ?? 0),
          pendientes: Number(e?.pendientes ?? 0),
        } satisfies CorridaFila;
      })}
      puedeGestionar={permisos.puedeGestionar}
      error={error?.message ?? null}
    />
  );
}
