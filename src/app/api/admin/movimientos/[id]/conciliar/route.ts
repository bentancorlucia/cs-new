import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import { getCuentasTienda, getCuentasTiendaIds } from "@/lib/tienda/cuentas";

const TIENDA_ROLES = ["super_admin", "tienda"];

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

    // Verificar que el movimiento pertenece a una cuenta de tienda
    const { data: mov, error: movError } = await supabase
      .from("movimientos_financieros")
      .select("id, conciliado, conciliacion_id, cuenta_id")
      .eq("id", movId)
      .in("cuenta_id", cuentaIds)
      .single();

    if (movError || !mov) {
      return NextResponse.json(
        { error: "Movimiento no encontrado" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { conciliado } = body;

    if (typeof conciliado !== "boolean") {
      return NextResponse.json(
        { error: "Se requiere campo 'conciliado' (boolean)" },
        { status: 400 }
      );
    }

    const updateData: any = { conciliado };

    // Si se des-concilia y tenía conciliacion_id, limpiar ambos
    if (!conciliado && mov.conciliacion_id) {
      updateData.conciliacion_id = null;
    }

    const { error } = await supabase
      .from("movimientos_financieros")
      .update(updateData)
      .eq("id", movId);

    if (error) throw error;

    return NextResponse.json({ success: true, conciliado });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
