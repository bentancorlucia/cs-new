import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createContabilidadAdminClient } from "@/lib/contabilidad/server";
import { leerPaginado } from "@/lib/contabilidad/reportes";
import {
  cuentaDeParametro,
  ejercicioVigente,
  exigir,
  lineasDeCuenta,
  respuestaError,
} from "@/lib/comercial/pedidos";

const r2 = (n: number) => Math.round(n * 100) / 100;

const uno = <T,>(v: T | T[] | null | undefined): T | null =>
  v == null ? null : Array.isArray(v) ? v[0] ?? null : v;

// GET /api/admin/donaciones — configuración, KPIs, pendientes, historial y
// control contra el saldo de "Donaciones Olla del Hogar a transferir".
export async function GET() {
  try {
    const permisos = await exigir((p) => p.puedeVer);
    const db = createAdminClient();
    const cdb = createContabilidadAdminClient();

    const [{ data: config, error: configError }, pendientes, transferencias, cobradas, cuenta, ejercicio] =
      await Promise.all([
        db.from("donaciones_config").select("*").eq("id", 1).maybeSingle(),
        leerPaginado((a, b) =>
          db
            .from("donaciones")
            .select(
              "id, monto, cobrada_at, created_at, pedidos!pedido_id(id, numero_pedido, nombre_cliente, perfiles!perfil_id(nombre, apellido))"
            )
            .eq("estado", "cobrada")
            .is("transferencia_id", null)
            .order("cobrada_at", { ascending: false })
            .order("id")
            .range(a, b)
        ),
        leerPaginado((a, b) =>
          db
            .from("donaciones_transferencias")
            .select("id, fecha_transferencia, monto_total, cantidad_donaciones, comprobante_url, notas, created_at")
            .order("fecha_transferencia", { ascending: false })
            .order("id", { ascending: false })
            .range(a, b)
        ),
        leerPaginado((a, b) =>
          db.from("donaciones").select("monto").in("estado", ["cobrada", "transferida"]).order("id").range(a, b)
        ),
        cuentaDeParametro(cdb, "tienda", "donaciones"),
        ejercicioVigente(cdb),
      ]);
    if (configError) throw configError;
    const errorLectura = pendientes.error ?? transferencias.error ?? cobradas.error;
    if (errorLectura) throw new Error(errorLectura);

    const totalPendiente = r2(pendientes.filas.reduce((s, d) => s + Number(d.monto), 0));
    const totalTransferido = r2(transferencias.filas.reduce((s, t) => s + Number(t.monto_total), 0));
    const totalRecaudado = r2(cobradas.filas.reduce((s, d) => s + Number(d.monto), 0));

    // Saldo contable (pasivo: haber − debe) en el ejercicio vigente
    let contable: {
      cuenta: { id: string; codigo: string; nombre: string } | null;
      saldo: number | null;
      diferencia: number | null;
      error: string | null;
    } = { cuenta, saldo: null, diferencia: null, error: null };
    if (!cuenta) {
      contable.error = "Falta configurar la cuenta de donaciones (parámetro tienda / donaciones)";
    } else if (!ejercicio) {
      contable.error = "No hay un ejercicio contable para la fecha de hoy";
    } else {
      const { filas, error } = await lineasDeCuenta(cdb, cuenta.id, ejercicio.id);
      const saldo = r2(filas.reduce((s, l) => s + l.haber - l.debe, 0));
      contable = { cuenta, saldo, diferencia: r2(saldo - totalPendiente), error };
    }

    // Asiento de cada transferencia
    const asientos = new Map<string, { id: string; numero: number | null }>();
    if (transferencias.filas.length > 0) {
      const ids = transferencias.filas.map((t) => String(t.id));
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await cdb
          .from("asientos")
          .select("id, numero, origen_id")
          .eq("origen_tipo", "donaciones_transferencia")
          .in("origen_id", ids.slice(i, i + 200));
        for (const a of data ?? []) if (a.origen_id) asientos.set(a.origen_id, { id: a.id, numero: a.numero });
      }
    }

    return NextResponse.json({
      config,
      kpis: {
        totalPendiente,
        cantidadPendiente: pendientes.filas.length,
        totalTransferido,
        totalRecaudado,
      },
      contable,
      pendientes: pendientes.filas.map((d) => {
        const ped = uno(d.pedidos);
        const perfil = uno(ped?.perfiles);
        return {
          id: d.id,
          monto: Number(d.monto),
          cobrada_at: d.cobrada_at,
          created_at: d.created_at,
          pedido: {
            id: ped?.id ?? null,
            numero_pedido: ped?.numero_pedido ?? "—",
            cliente: perfil ? `${perfil.nombre} ${perfil.apellido}` : ped?.nombre_cliente || "—",
          },
        };
      }),
      transferencias: transferencias.filas.map((t) => ({
        ...t,
        monto_total: Number(t.monto_total),
        asiento: asientos.get(String(t.id)) ?? null,
      })),
      permisos: {
        puedeConfigurar: permisos.puedeOperar,
        puedeTransferir: permisos.puedeOperarComercial,
        puedeVerContabilidad: permisos.puedeVerContabilidad,
      },
    });
  } catch (error) {
    return respuestaError(error);
  }
}
