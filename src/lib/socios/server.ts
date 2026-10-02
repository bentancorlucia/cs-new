import { createServerClient as createSsrClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/socios";
import { getUserRoles } from "@/lib/supabase/roles";

/**
 * Cliente del schema `socios` (membresías, planes, cuotas, cobranza) con
 * la sesión del usuario. Las funciones de la base vuelven a validar el rol
 * de cada operación (ver docs/socios.md).
 */
export async function createSociosClient() {
  const cookieStore = await cookies();

  return createSsrClient<Database, "socios">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "socios" },
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

export type SociosClient = Awaited<ReturnType<typeof createSociosClient>>;

/** Altas, bajas, inscripciones, medio de cobro y planes. */
export const ROLES_SECRETARIA = ["super_admin", "secretaria"];
/** Emisión de cuotas, notas de crédito, débito, liquidaciones, precios. */
export const ROLES_TESORERIA = ["super_admin", "tesorero"];
/** Registrar cobros. */
export const ROLES_COBRANZA = ["super_admin", "secretaria", "tesorero"];
export const ROLES_LECTURA = [...ROLES_COBRANZA, "comision_fiscal"];

export async function permisosSocios() {
  const roles = await getUserRoles();
  const tiene = (lista: string[]) => roles.some((r) => lista.includes(r));
  return {
    roles,
    puedeVer: tiene(ROLES_LECTURA),
    puedeGestionar: tiene(ROLES_SECRETARIA),
    puedeCobrar: tiene(ROLES_COBRANZA),
    puedeTesoreria: tiene(ROLES_TESORERIA),
  };
}

type Permiso = "puedeGestionar" | "puedeCobrar" | "puedeTesoreria";

/** Para Server Actions: corta antes de llegar a la base. La base vuelve a validar. */
export async function exigirPermisoSocios(permiso: Permiso) {
  const permisos = await permisosSocios();
  if (!permisos[permiso]) {
    throw new Error("No autorizado para esta operación");
  }
}
