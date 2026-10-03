import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createComunicacionesClient, permisosComunicaciones } from "@/lib/comunicaciones/server";
import { leerConfig } from "@/lib/comunicaciones/consultas";
import { smtpConfigurado } from "@/lib/comunicaciones/smtp";
import { EnvioDetalle, type EnvioCompleto } from "@/components/comunicaciones/envio-detalle";
import type { MensajeFila } from "@/components/comunicaciones/tipos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Envío" };

const LIMITE = 1000;

export default async function EnvioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await createComunicacionesClient();
  const [permisos, { data: envio }, { data: mensajes }, config, { data: corrida }] = await Promise.all([
    permisosComunicaciones(),
    db.from("envios_resumen").select("*").eq("id", id).maybeSingle(),
    db
      .from("mensajes")
      .select("id, email, nombre, estado, motivo_omision, error, intentos, enviado_at, proximo_intento, created_at, persona_id, variables, html")
      .eq("envio_id", id)
      .order("created_at")
      .order("email")
      .limit(LIMITE),
    leerConfig(db),
    db.from("corridas").select("clave, periodo").eq("envio_id", id).maybeSingle(),
  ]);
  if (!envio?.id) notFound();

  const { data: plantilla } = envio.plantilla_id
    ? await db.from("plantillas").select("id, nombre").eq("id", envio.plantilla_id).maybeSingle()
    : { data: null };

  const filas: MensajeFila[] = (mensajes ?? []).map(({ html, ...m }) => ({
    ...m,
    tiene_html: !!html,
    variables: (m.variables ?? {}) as MensajeFila["variables"],
  }));

  return (
    <EnvioDetalle
      envio={envio as EnvioCompleto}
      mensajes={filas}
      limite={LIMITE}
      pie={config?.pie ?? null}
      moldeHtml={config?.molde_html ?? null}
      plantilla={plantilla}
      corrida={corrida}
      puedeGestionar={permisos.puedeGestionar}
      smtp={smtpConfigurado()}
    />
  );
}
