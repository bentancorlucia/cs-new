import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { z } from "zod";

const TESORERIA_ROLES = ["super_admin", "tesorero"];

const arqueoSchema = z.object({
  cuenta_id: z.number().positive(),
  saldo_fisico: z.number().min(0),
  notas: z.string().optional().nullable(),
});

// GET — arqueos de caja
export async function GET(request: NextRequest) {
  try {
    await requireRole(TESORERIA_ROLES);
    const supabase = await createServerClient();

    const { searchParams } = new URL(request.url);
    const cuenta_id = searchParams.get("cuenta_id");

    let query = supabase
      .from("arqueos_caja")
      .select(
        `
        *,
        cuentas_financieras(id, nombre),
        perfiles:registrado_por(nombre, apellido)
      `
      )
      .order("fecha", { ascending: false })
      .limit(50);

    if (cuenta_id) {
      query = query.eq("cuenta_id", parseInt(cuenta_id));
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST — realizar arqueo de caja
export async function POST(request: NextRequest) {
  try {
    await requireRole(TESORERIA_ROLES);
    const supabase = await createServerClient();
    const user = await getCurrentUser();
    const body = await request.json();
    const parsed = arqueoSchema.parse(body);

    // Get current system balance
    const { data: cuenta, error: cError } = await supabase
      .from("cuentas_financieras")
      .select("id, saldo_actual, tipo")
      .eq("id", parsed.cuenta_id)
      .single();

    if (cError || !cuenta) {
      return NextResponse.json(
        { error: "Cuenta no encontrada" },
        { status: 404 }
      );
    }

    if (cuenta.tipo !== "caja_chica") {
      return NextResponse.json(
        { error: "Solo se puede arquear cuentas de tipo caja chica" },
        { status: 400 }
      );
    }

    const diferencia = parsed.saldo_fisico - cuenta.saldo_actual;

    const { data: arqueo, error } = await supabase
      .from("arqueos_caja")
      .insert({
        cuenta_id: parsed.cuenta_id,
        fecha: new Date().toISOString().split("T")[0],
        saldo_sistema: cuenta.saldo_actual,
        saldo_fisico: parsed.saldo_fisico,
        diferencia,
        notas: parsed.notas,
        registrado_por: user?.id ?? null,
      } as any)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data: arqueo }, { status: 201 });
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
