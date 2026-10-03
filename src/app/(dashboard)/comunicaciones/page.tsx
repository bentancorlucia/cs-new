import type { Metadata } from "next";
import { createComunicacionesClient, permisosComunicaciones } from "@/lib/comunicaciones/server";
import { smtpConfigurado } from "@/lib/comunicaciones/smtp";
import { inicioMesUy } from "@/lib/comunicaciones/consultas";
import { ResumenComunicaciones } from "@/components/comunicaciones/resumen";
import type { EnvioResumen } from "@/components/comunicaciones/tipos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Comunicaciones" };

const COLUMNAS =
  "id, nombre, asunto, categoria, estado, origen, programado_para, created_at, total, pendientes, enviando, enviados, fallidos, omitidos, cancelados";

export default async function ComunicacionesPage() {
  const db = await createComunicacionesClient();
  const [permisos, enviadosMes, enCola, fallidos, bajas, recientes, borradores] = await Promise.all([
    permisosComunicaciones(),
    db
      .from("mensajes")
      .select("id", { count: "exact", head: true })
      .eq("estado", "enviado")
      .gte("enviado_at", inicioMesUy()),
    db
      .from("mensajes")
      .select("id, envios!inner(estado)", { count: "exact", head: true })
      .in("estado", ["pendiente", "enviando"])
      .eq("envios.estado", "aprobado"),
    db.from("mensajes").select("id", { count: "exact", head: true }).eq("estado", "fallido"),
    db.from("supresiones").select("id", { count: "exact", head: true }).is("revocada_at", null),
    db.from("envios_resumen").select(COLUMNAS).neq("estado", "borrador").order("created_at", { ascending: false }).limit(6),
    db.from("envios_resumen").select(COLUMNAS).eq("estado", "borrador").order("created_at", { ascending: false }).limit(20),
  ]);

  const error = [enviadosMes, enCola, fallidos, bajas, recientes, borradores].find((r) => r.error)?.error?.message ?? null;

  return (
    <ResumenComunicaciones
      smtp={smtpConfigurado()}
      puedeGestionar={permisos.puedeGestionar}
      kpis={{
        enviadosMes: enviadosMes.count ?? 0,
        enCola: enCola.count ?? 0,
        fallidos: fallidos.count ?? 0,
        bajas: bajas.count ?? 0,
      }}
      recientes={(recientes.data ?? []) as EnvioResumen[]}
      borradores={(borradores.data ?? []) as EnvioResumen[]}
      error={error}
    />
  );
}
