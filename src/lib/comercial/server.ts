import { createServerClient as createSsrClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/comercial";
import { getUserRoles } from "@/lib/supabase/roles";

/**
 * Cliente del schema `comercial` (stock valorizado, compras, proveedores,
 * caja) con la sesión del usuario. Las funciones de escritura exigen rol
 * tienda, tesorero o super_admin; la base vuelve a validar todo.
 */
export async function createComercialClient() {
  const cookieStore = await cookies();

  return createSsrClient<Database, "comercial">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "comercial" },
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

export type ComercialClient = Awaited<ReturnType<typeof createComercialClient>>;

export const ROLES_OPERADOR = ["super_admin", "tienda", "tesorero"];
export const ROLES_CONSULTA = [...ROLES_OPERADOR, "comision_fiscal"];

export async function permisosComercial() {
  const roles = await getUserRoles();
  return {
    roles,
    puedeVer: roles.some((r) => ROLES_CONSULTA.includes(r)),
    puedeOperar: roles.some((r) => ROLES_OPERADOR.includes(r)),
  };
}

/** Para Server Actions y route handlers: corta antes de llegar a la base. */
export async function exigirOperador() {
  const { puedeOperar } = await permisosComercial();
  if (!puedeOperar) {
    throw new Error("No autorizado: requiere rol tienda o tesorero");
  }
}
