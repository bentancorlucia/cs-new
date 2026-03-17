import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { z } from "zod";

const TESORERIA_ROLES = ["super_admin", "tesorero"];

const transferenciaSchema = z.object({
  cuenta_origen_id: z.number().positive(),
  cuenta_destino_id: z.number().positive(),
  monto: z.number().positive("Monto debe ser mayor a 0"),
  tipo_cambio: z.number().positive().optional().nullable(),
  fecha: z.string().min(1),
  descripcion: z.string().min(1).max(500),
  comprobante_url: z.string().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    await requireRole(TESORERIA_ROLES);
    const supabase = await createServerClient();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "25");
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabase
      .from("transferencias_internas")
      .select(
        `
        *,
        cuenta_origen:cuentas_financieras!transferencias_internas_cuenta_origen_id_fkey(id, nombre, moneda, color),
        cuenta_destino:cuentas_financieras!transferencias_internas_cuenta_destino_id_fkey(id, nombre, moneda, color)
      `,
        { count: "exact" }
      )
      .order("fecha", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(TESORERIA_ROLES);
    const supabase = await createServerClient();
    const user = await getCurrentUser();
    const body = await request.json();
    const parsed = transferenciaSchema.parse(body);

    // Get account info for currencies
    const { data: cuentaOrigen } = await supabase
      .from("cuentas_financieras")
      .select("id, nombre, moneda, saldo_actual")
      .eq("id", parsed.cuenta_origen_id)
      .single();

    const { data: cuentaDestino } = await supabase
      .from("cuentas_financieras")
      .select("id, nombre, moneda")
      .eq("id", parsed.cuenta_destino_id)
      .single();

    if (!cuentaOrigen || !cuentaDestino) {
      return NextResponse.json(
        { error: "Cuenta no encontrada" },
        { status: 404 }
      );
    }

    if (cuentaOrigen.saldo_actual < parsed.monto) {
      return NextResponse.json(
        { error: "Saldo insuficiente en cuenta origen" },
        { status: 400 }
      );
    }

    // Calculate destination amount
    const monedaOrigen = cuentaOrigen.moneda;
    const monedaDestino = cuentaDestino.moneda;
    const tipoCambio = parsed.tipo_cambio || 1;
    const montoDestino =
      monedaOrigen === monedaDestino
        ? parsed.monto
        : Math.round(parsed.monto * tipoCambio * 100) / 100;

    // Get transfer category slugs
    const { data: catEgreso } = await supabase
      .from("categorias_financieras")
      .select("id")
      .eq("slug", "transferencia-interna-egreso")
      .single();

    const { data: catIngreso } = await supabase
      .from("categorias_financieras")
      .select("id")
      .eq("slug", "transferencia-interna-ingreso")
      .single();

    if (!catEgreso || !catIngreso) {
      return NextResponse.json(
        { error: "Categorías de transferencia no configuradas" },
        { status: 500 }
      );
    }

    // Create transfer record first (without movement IDs)
    const { data: transferencia, error: tError } = await supabase
      .from("transferencias_internas")
      .insert({
        cuenta_origen_id: parsed.cuenta_origen_id,
        cuenta_destino_id: parsed.cuenta_destino_id,
        monto: parsed.monto,
        moneda_origen: monedaOrigen,
        moneda_destino: monedaDestino,
        tipo_cambio: monedaOrigen !== monedaDestino ? tipoCambio : null,
        monto_destino: montoDestino,
        fecha: parsed.fecha,
        descripcion: parsed.descripcion,
        comprobante_url: parsed.comprobante_url,
        registrado_por: user?.id ?? null,
      } as any)
      .select()
      .single();

    if (tError) throw tError;

    // Create egreso movement (origin)
    const { data: movEgreso, error: eError } = await supabase
      .from("movimientos_financieros")
      .insert({
        cuenta_id: parsed.cuenta_origen_id,
        tipo: "egreso",
        categoria_id: catEgreso.id,
        monto: parsed.monto,
        moneda: monedaOrigen,
        fecha: parsed.fecha,
        descripcion: `Transferencia a ${cuentaDestino.nombre}: ${parsed.descripcion}`,
        origen_tipo: "transferencia",
        transferencia_id: transferencia.id,
        registrado_por: user?.id ?? null,
      } as any)
      .select()
      .single();

    if (eError) throw eError;

    // Create ingreso movement (destination)
    const { data: movIngreso, error: iError } = await supabase
      .from("movimientos_financieros")
      .insert({
        cuenta_id: parsed.cuenta_destino_id,
        tipo: "ingreso",
        categoria_id: catIngreso.id,
        monto: montoDestino,
        moneda: monedaDestino,
        fecha: parsed.fecha,
        descripcion: `Transferencia desde ${cuentaOrigen.nombre}: ${parsed.descripcion}`,
        origen_tipo: "transferencia",
        transferencia_id: transferencia.id,
        registrado_por: user?.id ?? null,
      } as any)
      .select()
      .single();

    if (iError) throw iError;

    // Link movements to transfer
    await supabase
      .from("transferencias_internas")
      .update({
        movimiento_egreso_id: movEgreso.id,
        movimiento_ingreso_id: movIngreso.id,
      })
      .eq("id", transferencia.id);

    return NextResponse.json({ data: transferencia }, { status: 201 });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
