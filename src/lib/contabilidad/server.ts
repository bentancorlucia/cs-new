import { createServerClient as createSsrClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/contabilidad";

/**
 * Cliente del schema `contabilidad` con la sesión del usuario.
 * La base aplica RLS (lectura: super_admin, tesorero, comision_fiscal)
 * y las funciones de escritura exigen tesorero.
 */
export async function createContabilidadClient() {
  const cookieStore = await cookies();

  return createSsrClient<Database, "contabilidad">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "contabilidad" },
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

/** Cliente con service role para procesos sin usuario (cron de cotizaciones). */
export function createContabilidadAdminClient() {
  return createClient<Database, "contabilidad">(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      db: { schema: "contabilidad" },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

export type ContabilidadClient = Awaited<ReturnType<typeof createContabilidadClient>>;
