import { createServerClient } from "@/lib/supabase/server";

type RoleJoin = { roles: { nombre: string } | null };

export async function getUserRoles(): Promise<string[]> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("perfil_roles")
    .select("roles(nombre)")
    .eq("perfil_id", user.id);

  return (
    (data as unknown as RoleJoin[])
      ?.map((r) => r.roles?.nombre)
      .filter((n): n is string => !!n) || []
  );
}

export async function requireRole(roles: string[]): Promise<string[]> {
  const userRoles = await getUserRoles();
  const hasAccess =
    userRoles.includes("super_admin") ||
    roles.some((r) => userRoles.includes(r));

  if (!hasAccess) {
    throw new Error("No autorizado");
  }

  return userRoles;
}

export async function getCurrentUser() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
