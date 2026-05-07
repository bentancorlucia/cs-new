import type { SupabaseClient } from "@supabase/supabase-js";

export type CuentaTesoreria = {
  id: number;
  nombre: string;
  tipo: "bancaria" | "mercadopago" | "caja_chica" | "virtual";
  moneda: "UYU" | "USD";
  banco: string | null;
  numero_cuenta: string | null;
  titular: string | null;
  saldo_actual: number;
  saldo_inicial: number;
  descripcion: string | null;
  color: string | null;
  modulo: string | null;
  activa: boolean;
  incluir_en_tesoreria: boolean;
};

/**
 * Cuentas visibles en tesorería: todas las activas con `incluir_en_tesoreria=true`.
 */
export async function getCuentasTesoreria(
  supabase: SupabaseClient
): Promise<CuentaTesoreria[]> {
  const { data, error } = await supabase
    .from("cuentas_financieras")
    .select(
      "id, nombre, tipo, moneda, banco, numero_cuenta, titular, saldo_actual, saldo_inicial, descripcion, color, modulo, activa, incluir_en_tesoreria"
    )
    .eq("activa", true)
    .eq("incluir_en_tesoreria", true)
    .order("tipo", { ascending: true })
    .order("nombre", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((c) => ({
    ...c,
    saldo_actual: Number(c.saldo_actual),
    saldo_inicial: Number(c.saldo_inicial),
  })) as CuentaTesoreria[];
}
