import { createServerClient as createSsrClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/comunicaciones";
import { getUserRoles } from "@/lib/supabase/roles";

/**
 * Cliente del schema `comunicaciones` con la sesión del usuario: plantillas,
 * envíos, historial y bajas. La base vuelve a validar el rol.
 */
export async function createComunicacionesClient() {
  const cookieStore = await cookies();

  return createSsrClient<Database, "comunicaciones">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "comunicaciones" },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Llamado desde un Server Component: el proxy refresca la sesión.
          }
        },
      },
    }
  );
}

/** Service role: solo para el worker, los crons, la baja y los mails transaccionales. */
export function createComunicacionesAdminClient() {
  return createClient<Database, "comunicaciones">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      db: { schema: "comunicaciones" },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

export type ComunicacionesClient = Awaited<ReturnType<typeof createComunicacionesClient>>;
export type ComunicacionesAdminClient = ReturnType<typeof createComunicacionesAdminClient>;

export const ROLES_GESTION = ["super_admin", "secretaria"];
export const ROLES_LECTURA = [...ROLES_GESTION, "tesorero", "tienda"];

export async function permisosComunicaciones() {
  const roles = await getUserRoles();
  return {
    roles,
    puedeVer: roles.some((r) => ROLES_LECTURA.includes(r)),
    puedeGestionar: roles.some((r) => ROLES_GESTION.includes(r)),
  };
}

/** Para Server Actions: corta antes de llegar a la base. */
export async function exigirGestionComunicaciones() {
  const { puedeGestionar } = await permisosComunicaciones();
  if (!puedeGestionar) {
    throw new Error("No autorizado: requiere rol secretaría");
  }
}
