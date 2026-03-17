import { createServerClient } from "@/lib/supabase/server";

export interface MovimientoAutoParams {
  cuenta_id: number;
  tipo: "ingreso" | "egreso";
  categoria_slug: string;
  monto: number;
  moneda?: "UYU" | "USD";
  descripcion: string;
  origen_tipo?: string;
  origen_id?: number;
  referencia?: string;
}

/**
 * Registra un movimiento financiero automático desde otros módulos
 * (tienda, eventos, socios, proveedores).
 *
 * El trigger `actualizar_saldo_cuenta` en la DB se encarga de
 * actualizar el saldo de la cuenta automáticamente.
 */
export async function registrarMovimientoAutomatico({
  cuenta_id,
  tipo,
  categoria_slug,
  monto,
  moneda = "UYU",
  descripcion,
  origen_tipo,
  origen_id,
  referencia,
}: MovimientoAutoParams) {
  const supabase = await createServerClient();

  // Buscar categoría por slug
  const { data: categoria, error: catError } = await supabase
    .from("categorias_financieras")
    .select("id")
    .eq("slug", categoria_slug)
    .single();

  if (catError || !categoria) {
    console.error(
      `[Tesorería] Categoría no encontrada: ${categoria_slug}`,
      catError
    );
    return null;
  }

  // Crear movimiento — el trigger on_movimiento_financiero actualiza el saldo
  const { data: movimiento, error } = await supabase
    .from("movimientos_financieros")
    .insert({
      cuenta_id,
      tipo,
      categoria_id: categoria.id,
      monto,
      moneda,
      fecha: new Date().toISOString().split("T")[0],
      descripcion,
      origen_tipo: origen_tipo ?? "manual",
      origen_id,
      referencia,
      conciliado: origen_tipo?.includes("mercadopago") ?? false,
      registrado_por: null, // automático
    })
    .select()
    .single();

  if (error) {
    console.error("[Tesorería] Error al crear movimiento automático:", error);
    return null;
  }

  return movimiento;
}
