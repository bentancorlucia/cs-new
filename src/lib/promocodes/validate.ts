import { createAdminClient } from "@/lib/supabase/admin";
import type { Promocode } from "./schemas";

export type ValidacionPromocode =
  | { ok: true; promo: Promocode }
  | { ok: false; error: string };

export async function buscarPromocodeVigente(
  codigo: string
): Promise<ValidacionPromocode> {
  const codigoNorm = codigo.trim().toUpperCase();
  if (!codigoNorm) {
    return { ok: false, error: "Código vacío" };
  }

  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("promocodes")
    .select("*")
    .eq("codigo", codigoNorm)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "Código no encontrado" };
  }

  const promo = data as Promocode;

  if (!promo.activo) {
    return { ok: false, error: "Código no disponible" };
  }

  const now = new Date();
  const inicio = new Date(promo.fecha_inicio);
  const fin = new Date(promo.fecha_fin);

  if (now < inicio) {
    return { ok: false, error: "Código aún no vigente" };
  }
  if (now > fin) {
    return { ok: false, error: "Código vencido" };
  }

  if (promo.usos_max != null && promo.usos_actuales >= promo.usos_max) {
    return { ok: false, error: "Código agotado" };
  }

  return { ok: true, promo };
}

export function validarMontoMinimo(
  promo: Promocode,
  subtotal: number
): { ok: true } | { ok: false; error: string } {
  if (promo.monto_minimo != null && subtotal < Number(promo.monto_minimo)) {
    return {
      ok: false,
      error: `Compra mínima requerida: $${Number(
        promo.monto_minimo
      ).toLocaleString("es-UY")}`,
    };
  }
  return { ok: true };
}
