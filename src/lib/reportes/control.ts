import type { ControlContable, FilaControlCuenta, RangoFechas } from "@/types/reportes";
import { casiCero, leerPorIds, leerTodo, r2, type ClientesReportes, type CuentasTienda } from "./ventas";

/**
 * Control del reporte contra el mayor: suma (haber − debe, o debe − haber)
 * de las líneas de asientos confirmados del rango en las cuentas indicadas
 * y separa lo que el reporte no cuenta a propósito:
 *   - anulaciones cruzadas: venta anulada cuyo asiento original y su
 *     reversión caen en períodos distintos (si caen en el mismo, se netean);
 *   - otros asientos: los que no genera la tienda (manuales, transferencias
 *     a la Olla, diferencias de precio de compras…).
 * Lo que queda tiene que ser exactamente el número del reporte.
 */

type LineaControl = {
  id: number;
  debe: number;
  haber: number;
  cuenta_id: string;
  asientos: {
    id: string;
    tipo: string;
    origen_tipo: string | null;
    asiento_revertido_id: string | null;
    revertido_por_id: string | null;
  };
};

export interface OpcionesControl {
  concepto: string;
  /** Rol de la cuenta (parametros_cuentas) → importe según el reporte. */
  reportePorRol: Record<string, number>;
  /** "acreedor": haber − debe (ingresos, pasivos). "deudor": debe − haber (costos). */
  signo: "acreedor" | "deudor";
  /** origen_tipo de los asientos que genera la operación controlada. */
  origenes: string[];
  /** Solo líneas de estos centros de costo (null: todas). */
  centros: string[] | null;
}

export async function controlContable(
  cl: ClientesReportes,
  cuentas: CuentasTienda,
  rango: RangoFechas,
  op: OpcionesControl
): Promise<ControlContable> {
  const roles = Object.keys(op.reportePorRol);
  const cuentaDeRol = new Map(roles.map((r) => [r, cuentas.porRol.get(r)!]));
  const idsCuenta = [...new Set([...cuentaDeRol.values()].map((c) => c.id))];

  const lineas = await leerTodo<LineaControl>((a, b) => {
    let q = cl.conta
      .from("lineas")
      .select("id, debe, haber, cuenta_id, asientos!inner(id, tipo, origen_tipo, asiento_revertido_id, revertido_por_id)")
      .in("cuenta_id", idsCuenta)
      .eq("asientos.estado", "confirmado")
      .gte("asientos.fecha", rango.desde)
      .lte("asientos.fecha", rango.hasta)
      .not("asientos.tipo", "in", "(cierre,refundicion)");
    if (op.centros) q = q.in("centro_costo_id", op.centros);
    return q.order("id").range(a, b) as unknown as PromiseLike<{
      data: LineaControl[] | null;
      error: { message: string } | null;
    }>;
  });

  // Origen de los asientos revertidos (la reversión no tiene origen propio)
  const revertidos = await leerPorIds<string, { id: string; origen_tipo: string | null }>(
    lineas.filter((l) => l.asientos.tipo === "reversion" && l.asientos.asiento_revertido_id).map((l) => l.asientos.asiento_revertido_id!),
    (lote, a, b) => cl.conta.from("asientos").select("id, origen_tipo").in("id", lote).order("id").range(a, b)
  );
  const origenDe = new Map(revertidos.map((r) => [r.id, r.origen_tipo]));

  const propio = new Map<string, number>(); // por cuenta
  let saldo = 0;
  let anulaciones = 0;
  let otros = 0;
  for (const l of lineas) {
    const imp = op.signo === "acreedor" ? Number(l.haber) - Number(l.debe) : Number(l.debe) - Number(l.haber);
    saldo += imp;
    const a = l.asientos;
    if (a.tipo === "reversion") {
      const o = a.asiento_revertido_id ? origenDe.get(a.asiento_revertido_id) : null;
      if (o && op.origenes.includes(o)) anulaciones += imp;
      else otros += imp;
    } else if (a.origen_tipo && op.origenes.includes(a.origen_tipo)) {
      if (a.revertido_por_id) anulaciones += imp;
      else propio.set(l.cuenta_id, (propio.get(l.cuenta_id) ?? 0) + imp);
    } else {
      otros += imp;
    }
  }

  // Una fila por cuenta (dos roles podrían compartir cuenta)
  const filas = new Map<string, FilaControlCuenta>();
  for (const rol of roles) {
    const c = cuentaDeRol.get(rol)!;
    const f = filas.get(c.id);
    if (f) {
      f.reporte = r2(f.reporte + op.reportePorRol[rol]);
      f.rol += `, ${rol}`;
    } else {
      filas.set(c.id, {
        rol,
        codigo: c.codigo,
        nombre: c.nombre,
        reporte: r2(op.reportePorRol[rol]),
        contabilidad: r2(propio.get(c.id) ?? 0),
      });
    }
  }
  const porCuenta = [...filas.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
  const reporte = r2(roles.reduce((s, r) => s + op.reportePorRol[r], 0));
  const diferencia = r2(saldo - anulaciones - otros - reporte);

  return {
    concepto: op.concepto,
    reporte,
    saldoCuentas: r2(saldo),
    anulacionesCruzadas: r2(anulaciones),
    otrosAsientos: r2(otros),
    diferencia,
    cuadra: casiCero(diferencia) && porCuenta.every((f) => casiCero(f.reporte - f.contabilidad)),
    porCuenta,
  };
}

/** Orígenes de asientos que mueven ventas y costo de la tienda. */
export const ORIGENES_VENTA = ["pedido_venta", "pedido_entrega", "devolucion_venta"];
