import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import { getCuentasTienda, getCuentasTiendaIds } from "@/lib/tienda/cuentas";
import { z } from "zod";

const TIENDA_ROLES = ["super_admin", "tienda"];

const updateSchema = z.object({
  cuenta_id: z.number().positive().optional(),
  tipo: z.enum(["ingreso", "egreso"]).optional(),
  categoria_id: z.number().positive().optional(),
  subcategoria_id: z.number().positive().optional().nullable(),
  monto: z.number().positive("Monto debe ser mayor a 0").optional(),
  moneda: z.enum(["UYU", "USD"]).optional(),
  fecha: z.string().min(1).optional(),
  descripcion: z.string().min(1).max(500).optional(),
  referencia: z.string().max(100).optional().nullable(),
  notas: z.string().optional().nullable(),
});

async function getMovimientoTienda(supabase: any, id: number, cuentaIds: number[]) {
  const { data, error } = await supabase
    .from("movimientos_financieros")
    .select("*")
    .eq("id", id)
    .in("cuenta_id", cuentaIds)
    .single();

  if (error || !data) {
    return null;
  }
  return data;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = await createServerClient();
    const { id } = await params;
    const movId = parseInt(id);

    const cuentas = await getCuentasTienda(supabase);
    const cuentaIds = getCuentasTiendaIds(cuentas);

    const existing = await getMovimientoTienda(supabase, movId, cuentaIds);
    if (!existing) {
      return NextResponse.json(
        { error: "Movimiento no encontrado" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = updateSchema.parse(body);

    if (parsed.cuenta_id && !cuentaIds.includes(parsed.cuenta_id)) {
      return NextResponse.json(
        { error: "Cuenta no pertenece a tienda" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("movimientos_financieros")
      .update(parsed as any)
      .eq("id", movId)
      .select(
        `
        *,
        cuentas_financieras(id, nombre, tipo, moneda, color),
        categorias_financieras!movimientos_financieros_categoria_id_fkey(id, nombre, slug, color, icono)
      `
      )
      .single();

    if (error) {
      if (error.message?.includes("período cerrado")) {
        return NextResponse.json(
          { error: "No se pueden modificar movimientos de un período cerrado" },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ data });
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = await createServerClient();
    const { id } = await params;
    const movId = parseInt(id);

    const cuentas = await getCuentasTienda(supabase);
    const cuentaIds = getCuentasTiendaIds(cuentas);

    const existing = await getMovimientoTienda(supabase, movId, cuentaIds);
    if (!existing) {
      return NextResponse.json(
        { error: "Movimiento no encontrado" },
        { status: 404 }
      );
    }

    const { error } = await supabase
      .from("movimientos_financieros")
      .delete()
      .eq("id", movId);

    if (error) {
      if (error.message?.includes("período cerrado")) {
        return NextResponse.json(
          { error: "No se pueden eliminar movimientos de un período cerrado" },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
