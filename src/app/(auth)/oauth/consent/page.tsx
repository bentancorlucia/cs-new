import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { getUserRoles } from "@/lib/supabase/roles";
import { ROLES_MCP } from "@/lib/mcp/auth";
import { ConsentCard } from "./consent-card";

export const metadata: Metadata = { title: "Autorizar acceso" };

// Pantalla de consentimiento del servidor OAuth 2.1 de Supabase Auth.
// Supabase redirige acá (Authorization Path configurado en el dashboard)
// cuando Claude / ChatGPT piden acceso al MCP en nombre del usuario.
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string; error?: string }>;
}) {
  const { authorization_id, error: errorParam } = await searchParams;

  if (!authorization_id) {
    return <ConsentCard estado="invalido" />;
  }

  const supabase = await createServerClient();
  const { data, error } =
    await supabase.auth.oauth.getAuthorizationDetails(authorization_id);

  if (error || !data) {
    return <ConsentCard estado="invalido" />;
  }

  // Consentimiento ya otorgado antes: Supabase devuelve directo la URL de vuelta.
  if (!("authorization_id" in data)) {
    redirect(data.redirect_url);
  }

  const roles = await getUserRoles();
  const rolesMcp = roles.filter((r) =>
    (ROLES_MCP as readonly string[]).includes(r)
  );

  return (
    <ConsentCard
      estado={rolesMcp.length > 0 ? "pendiente" : "sin_permiso"}
      authorizationId={data.authorization_id}
      cliente={data.client.name || "Aplicación externa"}
      email={data.user.email}
      roles={rolesMcp}
      errorAprobar={errorParam === "aprobar"}
    />
  );
}
