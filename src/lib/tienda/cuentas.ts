import { SupabaseClient } from "@supabase/supabase-js";

export async function getCuentasTienda(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("cuentas_financieras")
    .select("*")
    .eq("modulo", "tienda")
    .eq("activa", true)
    .order("tipo", { ascending: true });

  if (error || !data || data.length === 0) {
    throw new Error(
      "No se encontraron cuentas de tienda configuradas. Contacte al administrador."
    );
  }

  return data;
}

export function getCuentasTiendaIds(cuentas: { id: number }[]): number[] {
  return cuentas.map((c) => c.id);
}
