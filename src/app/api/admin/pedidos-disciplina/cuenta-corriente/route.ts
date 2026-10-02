import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createContabilidadAdminClient } from "@/lib/contabilidad/server";
import {
  cuentaDeParametro,
  ejercicioVigente,
  exigir,
  lineasDeCuenta,
  respuestaError,
} from "@/lib/comercial/pedidos";
import type { CuentaCorrienteDisciplinas, MovimientoCuentaCorriente, SaldoDisciplina } from "@/components/pedidos/tipos";

const r2 = (n: number) => Math.round(n * 100) / 100;

// GET /api/admin/pedidos-disciplina/cuenta-corriente[?disciplina_id=]
//
// Cuenta corriente contable de las disciplinas: saldo de "Fondos en poder de
// disciplinas" (parámetro tienda/disciplinas) por auxiliar, en el ejercicio
// vigente (la apertura trae lo anterior). Con disciplina_id, sus movimientos
// con saldo acumulado. Los cobros y compensaciones los asienta tesorería.
export async function GET(request: NextRequest) {
  try {
    const permisos = await exigir((p) => p.puedeOperarComercial);
    const disciplinaId = z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .parse(request.nextUrl.searchParams.get("disciplina_id") || undefined);

    const cdb = createContabilidadAdminClient();
    const db = createAdminClient();

    const respuesta: CuentaCorrienteDisciplinas = {
      cuenta: null,
      ejercicio: null,
      saldos: [],
      total: 0,
      movimientos: [],
      permisos: {
        puedeVerContabilidad: permisos.puedeVerContabilidad,
        puedeEscribirContabilidad: permisos.puedeEscribirContabilidad,
      },
      error: null,
    };

    const [cuenta, ejercicio] = await Promise.all([
      cuentaDeParametro(cdb, "tienda", "disciplinas"),
      ejercicioVigente(cdb),
    ]);
    respuesta.cuenta = cuenta;
    respuesta.ejercicio = ejercicio ? { nombre: ejercicio.nombre, fecha_inicio: ejercicio.fecha_inicio } : null;
    if (!cuenta) {
      respuesta.error = "Falta configurar la cuenta de disciplinas (parámetro tienda / disciplinas)";
      return NextResponse.json(respuesta);
    }
    if (!ejercicio) {
      respuesta.error = "No hay un ejercicio contable para la fecha de hoy";
      return NextResponse.json(respuesta);
    }

    const { filas, error } = await lineasDeCuenta(cdb, cuenta.id, ejercicio.id);
    if (error) respuesta.error = error;

    // Saldos por disciplina (deudor = lo que la disciplina le debe al club)
    const porDisc = new Map<number, { debe: number; haber: number }>();
    for (const l of filas) {
      if (l.disciplina_id == null) continue;
      const acc = porDisc.get(l.disciplina_id) ?? { debe: 0, haber: 0 };
      acc.debe += l.debe;
      acc.haber += l.haber;
      porDisc.set(l.disciplina_id, acc);
    }
    const ids = [...porDisc.keys()];
    if (disciplinaId && !ids.includes(disciplinaId)) ids.push(disciplinaId);
    const { data: discs } = ids.length
      ? await db.from("disciplinas").select("id, nombre").in("id", ids)
      : { data: [] };
    const nombre = new Map((discs ?? []).map((d) => [d.id, d.nombre]));

    respuesta.saldos = [...porDisc.entries()]
      .map(
        ([id, s]): SaldoDisciplina => ({
          disciplina_id: id,
          nombre: nombre.get(id) ?? `Disciplina ${id}`,
          debe: r2(s.debe),
          haber: r2(s.haber),
          saldo: r2(s.debe - s.haber),
        })
      )
      .sort((a, b) => b.saldo - a.saldo || a.nombre.localeCompare(b.nombre));
    respuesta.total = r2(respuesta.saldos.reduce((s, d) => s + d.saldo, 0));

    if (disciplinaId) {
      const propias = filas
        .filter((l) => l.disciplina_id === disciplinaId)
        .sort(
          (a, b) =>
            a.asiento.fecha.localeCompare(b.asiento.fecha) ||
            (a.asiento.numero ?? 0) - (b.asiento.numero ?? 0) ||
            a.id - b.id
        );
      let saldo = 0;
      respuesta.movimientos = propias.map((l): MovimientoCuentaCorriente => {
        saldo = r2(saldo + l.debe - l.haber);
        const esPedido = l.asiento.origen_tipo === "pedido_venta" && l.asiento.origen_id;
        return {
          linea_id: l.id,
          asiento_id: l.asiento.id,
          numero: l.asiento.numero,
          fecha: l.asiento.fecha,
          descripcion: l.descripcion || l.asiento.descripcion,
          debe: l.debe,
          haber: l.haber,
          saldo,
          pedido_id: esPedido ? Number(l.asiento.origen_id) : null,
        };
      });
    }

    return NextResponse.json(respuesta);
  } catch (error) {
    return respuestaError(error);
  }
}
