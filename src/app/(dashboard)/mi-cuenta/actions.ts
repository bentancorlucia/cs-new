"use server";

import { createServerClient } from "@/lib/supabase/server";
import { createSociosClient } from "@/lib/socios/server";
import { hoyUruguay } from "@/lib/contabilidad/formato";
import type { CuotaPendiente, MovimientoCuenta } from "@/lib/socios/padron";

export interface MisCuotas {
  numeroSocio: number | null;
  movimientos: MovimientoCuenta[];
  pendientes: CuotaPendiente[];
  deudaVencida: number;
  deudaTotal: number;
  saldoAFavor: number;
}

/**
 * Estado de cuenta del usuario, si su cuenta está vinculada a una persona
 * del padrón (null si no). La base solo le deja ver lo suyo:
 * socios.estado_cuenta valida que la persona sea la del usuario y las
 * cuotas/cobros tienen RLS por persona vinculada.
 */
export async function leerMisCuotas(): Promise<{ ok: true; data: MisCuotas | null } | { ok: false; error: string }> {
  try {
    const db = await createServerClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) return { ok: false, error: "Sesión vencida" };

    const { data: persona, error: e0 } = await db
      .from("padron_socios")
      .select("id, numero_socio")
      .eq("perfil_id", user.id)
      .maybeSingle();
    if (e0) return { ok: false, error: e0.message };
    if (!persona) return { ok: true, data: null };
    const { id, numero_socio } = persona as unknown as { id: number; numero_socio: number | null };

    const hoy = hoyUruguay();
    const so = await createSociosClient();
    const [cuenta, pendientes, cobros] = await Promise.all([
      so.rpc("estado_cuenta", { p_persona: id }),
      so
        .from("cuotas_saldo")
        .select("id, concepto, fecha_vencimiento, importe, saldo")
        .eq("persona_id", id)
        .eq("estado", "emitida")
        .gt("saldo", 0)
        .order("fecha_vencimiento"),
      so.from("cobros_saldo").select("saldo_a_favor").eq("persona_id", id).eq("estado", "vigente").gt("saldo_a_favor", 0),
    ]);
    for (const r of [cuenta, pendientes, cobros]) {
      if (r.error) return { ok: false, error: r.error.message };
    }

    const lista: CuotaPendiente[] = (pendientes.data ?? []).map((c) => ({
      id: c.id as number,
      concepto: c.concepto as string,
      fecha_vencimiento: c.fecha_vencimiento as string,
      importe: Number(c.importe),
      saldo: Number(c.saldo),
      vencida: (c.fecha_vencimiento as string) < hoy,
    }));
    return {
      ok: true,
      data: {
        numeroSocio: numero_socio,
        movimientos: (cuenta.data ?? []).map((m) => ({
          ...m,
          cargo: Number(m.cargo),
          abono: Number(m.abono),
          saldo: Number(m.saldo),
        })),
        pendientes: lista,
        deudaVencida: lista.filter((c) => c.vencida).reduce((s, c) => s + c.saldo, 0),
        deudaTotal: lista.reduce((s, c) => s + c.saldo, 0),
        saldoAFavor: (cobros.data ?? []).reduce((s, c) => s + Number(c.saldo_a_favor), 0),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error inesperado" };
  }
}
