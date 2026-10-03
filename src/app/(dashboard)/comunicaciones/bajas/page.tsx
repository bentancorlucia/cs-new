import type { Metadata } from "next";
import { createComunicacionesClient, permisosComunicaciones } from "@/lib/comunicaciones/server";
import { Bajas, type SupresionFila } from "@/components/comunicaciones/bajas";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bajas de correo" };

export default async function BajasPage() {
  const db = await createComunicacionesClient();
  const [permisos, { data, error }] = await Promise.all([
    permisosComunicaciones(),
    db
      .from("supresiones")
      .select("id, email, alcance, motivo, origen, notas, created_at, revocada_at, mensaje_id")
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);
  return (
    <Bajas
      supresiones={(data ?? []) as SupresionFila[]}
      puedeGestionar={permisos.puedeGestionar}
      error={error?.message ?? null}
    />
  );
}
