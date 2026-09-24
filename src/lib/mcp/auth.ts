import type { AuthInfo } from "@modelcontextprotocol/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Roles que habilitan al menos una herramienta del MCP. */
export const ROLES_MCP = ["super_admin", "tienda", "tesorero", "secretaria"] as const;

export type UsuarioMcp = {
  userId: string;
  email: string | null;
  nombre: string | null;
  roles: string[];
};

type RoleJoin = { roles: { nombre: string } | null };

/**
 * Verifica el bearer token (JWT de Supabase, emitido por el servidor OAuth 2.1
 * de Supabase Auth o por un login normal) y carga los roles del usuario.
 *
 * Usamos getUser() en vez de getClaims() para validar contra el servidor de
 * Auth en cada request: si el usuario revoca el acceso desde su cuenta, el
 * token deja de servir al instante en vez de al expirar.
 */
export async function verificarTokenMcp(
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.getUser(bearerToken);
  if (error || !data.user) return undefined;

  const [{ data: rolesData }, { data: perfil }] = await Promise.all([
    admin.from("perfil_roles").select("roles(nombre)").eq("perfil_id", data.user.id),
    admin.from("perfiles").select("nombre, apellido").eq("id", data.user.id).maybeSingle(),
  ]);

  const roles =
    (rolesData as unknown as RoleJoin[] | null)
      ?.map((r) => r.roles?.nombre)
      .filter((n): n is string => !!n) ?? [];

  const claims = decodificarPayload(bearerToken);
  const usuario: UsuarioMcp = {
    userId: data.user.id,
    email: data.user.email ?? null,
    nombre: perfil ? `${perfil.nombre ?? ""} ${perfil.apellido ?? ""}`.trim() || null : null,
    roles,
  };

  return {
    token: bearerToken,
    // Tokens OAuth traen client_id; los de sesión normal (pruebas) no.
    clientId: typeof claims.client_id === "string" ? claims.client_id : "supabase-session",
    scopes: typeof claims.scope === "string" ? claims.scope.split(" ") : [],
    expiresAt: typeof claims.exp === "number" ? claims.exp : undefined,
    extra: { usuario },
  };
}

/** El token ya fue validado por getUser(); solo leemos claims informativos. */
function decodificarPayload(jwt: string): Record<string, unknown> {
  try {
    const payload = jwt.split(".")[1];
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

export function usuarioDe(authInfo: AuthInfo | undefined): UsuarioMcp | null {
  return (authInfo?.extra?.usuario as UsuarioMcp | undefined) ?? null;
}

export function tieneRol(usuario: UsuarioMcp | null, roles: readonly string[]): boolean {
  if (!usuario) return false;
  return (
    usuario.roles.includes("super_admin") ||
    roles.some((r) => usuario.roles.includes(r))
  );
}
