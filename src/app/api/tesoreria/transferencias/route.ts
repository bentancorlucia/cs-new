import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";

const ROLES = ["super_admin", "tesorero"];

const schema = z.object({
  cuenta_origen_id: z.number().positive(),
  cuenta_destino_id: z.number().positive(),
  fecha: z.string().min(1),
  monto_origen: z.number().positive(),
  monto_destino: z.number().positive(),
  descripcion: z.string().max(500).nullable().optional(),
});

export async function GET() {
  try {
    await requireRole(ROLES);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("transferencias_internas")
    .select(
      `*,
       cuenta_origen:cuentas_financieras!transferencias_internas_cuenta_origen_id_fkey(id, nombre, moneda, color),
       cuenta_destino:cuentas_financieras!transferencias_internas_cuenta_destino_id_fkey(id, nombre, moneda, color)`
    )
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ transferencias: data ?? [] });
}

export async function POST(req: NextRequest) {
  try {
    await requireRole(ROLES);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  if (parsed.data.cuenta_origen_id === parsed.data.cuenta_destino_id) {
    return NextResponse.json(
      { error: "La cuenta origen y destino deben ser distintas" },
      { status: 400 }
    );
  }

  const supabase = await createServerClient();
  const user = await getCurrentUser();

  // Cargar ambas cuentas para validar moneda + saldo
  const { data: cuentas } = await supabase
    .from("cuentas_financieras")
    .select("id, nombre, moneda, saldo_actual")
    .in("id", [parsed.data.cuenta_origen_id, parsed.data.cuenta_destino_id]);

  if (!cuentas || cuentas.length !== 2) {
    return NextResponse.json({ error: "Cuentas no encontradas" }, { status: 404 });
  }

  const origen = cuentas.find((c) => c.id === parsed.data.cuenta_origen_id)!;
  const destino = cuentas.find((c) => c.id === parsed.data.cuenta_destino_id)!;

  const tipoCambio =
    origen.moneda !== destino.moneda
      ? Number((parsed.data.monto_destino / parsed.data.monto_origen).toFixed(4))
      : null;

  // Buscar categoría "Transferencia interna" — usar slugs sembrados
  const { data: catEgreso } = await supabase
    .from("categorias_financieras")
    .select("id")
    .eq("slug", "transferencia-interna-egreso")
    .maybeSingle();
  const { data: catIngreso } = await supabase
    .from("categorias_financieras")
    .select("id")
    .eq("slug", "transferencia-interna-ingreso")
    .maybeSingle();

  // Crear transferencia
  const { data: transf, error: errTransf } = await supabase
    .from("transferencias_internas")
    .insert({
      cuenta_origen_id: parsed.data.cuenta_origen_id,
      cuenta_destino_id: parsed.data.cuenta_destino_id,
      fecha: parsed.data.fecha,
      monto_origen: parsed.data.monto_origen,
      moneda_origen: origen.moneda,
      monto_destino: parsed.data.monto_destino,
      moneda_destino: destino.moneda,
      tipo_cambio: tipoCambio,
      descripcion: parsed.data.descripcion ?? null,
      registrado_por: user?.id ?? null,
    })
    .select()
    .single();

  if (errTransf || !transf) {
    return NextResponse.json(
      { error: errTransf?.message ?? "Error al crear transferencia" },
      { status: 500 }
    );
  }

  const desc =
    parsed.data.descripcion?.trim() ||
    `Transferencia ${origen.nombre} → ${destino.nombre}`;

  // Crear los dos movimientos ligados
  const { data: movs, error: errMov } = await supabase
    .from("movimientos_financieros")
    .insert([
      {
        cuenta_id: parsed.data.cuenta_origen_id,
        tipo: "egreso",
        categoria_id: catEgreso?.id ?? null,
        monto: parsed.data.monto_origen,
        moneda: origen.moneda,
        fecha: parsed.data.fecha,
        descripcion: desc,
        origen_tipo: "transferencia",
        origen_id: transf.id,
        clasificado: catEgreso?.id ? true : false,
        registrado_por: user?.id ?? null,
      },
      {
        cuenta_id: parsed.data.cuenta_destino_id,
        tipo: "ingreso",
        categoria_id: catIngreso?.id ?? null,
        monto: parsed.data.monto_destino,
        moneda: destino.moneda,
        fecha: parsed.data.fecha,
        descripcion: desc,
        origen_tipo: "transferencia",
        origen_id: transf.id,
        clasificado: catIngreso?.id ? true : false,
        registrado_por: user?.id ?? null,
      },
    ])
    .select();

  if (errMov || !movs || movs.length !== 2) {
    // Rollback parcial — borrar transferencia
    await supabase.from("transferencias_internas").delete().eq("id", transf.id);
    return NextResponse.json(
      { error: errMov?.message ?? "Error al crear movimientos" },
      { status: 500 }
    );
  }

  // Linkear movimientos a la transferencia
  const egreso = movs.find((m) => m.tipo === "egreso");
  const ingreso = movs.find((m) => m.tipo === "ingreso");
  await supabase
    .from("transferencias_internas")
    .update({
      movimiento_egreso_id: egreso?.id ?? null,
      movimiento_ingreso_id: ingreso?.id ?? null,
    })
    .eq("id", transf.id);

  return NextResponse.json({ transferencia: transf });
}
