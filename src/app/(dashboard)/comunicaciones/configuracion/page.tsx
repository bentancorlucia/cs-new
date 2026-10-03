import type { Metadata } from "next";
import { createComunicacionesClient, permisosComunicaciones } from "@/lib/comunicaciones/server";
import { leerConfig } from "@/lib/comunicaciones/consultas";
import { smtpConfigurado } from "@/lib/comunicaciones/smtp";
import { Configuracion } from "@/components/comunicaciones/configuracion";
import type { ConfigComunicaciones } from "@/components/comunicaciones/tipos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Configuración de comunicaciones" };

export default async function ConfiguracionPage() {
  const [permisos, config] = await Promise.all([permisosComunicaciones(), createComunicacionesClient().then(leerConfig)]);
  return (
    <Configuracion
      config={(config ?? null) as ConfigComunicaciones | null}
      puedeGestionar={permisos.puedeGestionar}
      puedeWhatsApp={permisos.puedeGestionar || permisos.roles.includes("tienda")}
      smtp={smtpConfigurado()}
    />
  );
}
