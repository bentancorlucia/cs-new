import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";

const TIENDA_ROLES = ["super_admin", "tienda"];

// GET /api/admin/compras/[id] — detalle de compra
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("compras_proveedor")
      .select(
        `
        *,
        proveedores(id, nombre, rut, razon_social),
        compra_items(
          id, producto_id, variante_id, cantidad, costo_unitario, subtotal, cantidad_recibida,
          productos(id, nombre, sku),
          producto_variantes(id, nombre)
        )
      `
      )
      .eq("id", parseInt(id))
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Compra no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT /api/admin/compras/[id] — actualizar estado
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const supabase = await createServerClient();
    const body = await request.json();
    const db = supabase as any;

    const { data: compra } = await db
      .from("compras_proveedor")
      .select("*")
      .eq("id", parseInt(id))
      .single();

    if (!compra) {
      return NextResponse.json(
        { error: "Compra no encontrada" },
        { status: 404 }
      );
    }

    const { estado } = body;

    // Validar transiciones de estado
    const transicionesValidas: Record<string, string[]> = {
      borrador: ["confirmada", "cancelada"],
      confirmada: ["recibida", "cancelada"],
    };

    const permitidas = transicionesValidas[compra.estado];
    if (!permitidas || !permitidas.includes(estado)) {
      return NextResponse.json(
        {
          error: `No se puede cambiar de "${compra.estado}" a "${estado}"`,
        },
        { status: 400 }
      );
    }

    // Cancelar: revertir deuda si estaba confirmada
    if (estado === "cancelada" && compra.estado === "confirmada") {
      await db
        .from("proveedores")
        .update({
          saldo_cuenta_corriente:
            (compra.total || 0) * -1 +
            (
              await db
                .from("proveedores")
                .select("saldo_cuenta_corriente")
                .eq("id", compra.proveedor_id)
                .single()
            ).data.saldo_cuenta_corriente,
          updated_at: new Date().toISOString(),
        })
        .eq("id", compra.proveedor_id);
    }

    const updateData: any = {
      estado,
      updated_at: new Date().toISOString(),
    };

    if (estado === "recibida") {
      updateData.fecha_recepcion = new Date().toISOString().split("T")[0];
    }

    const { data, error } = await db
      .from("compras_proveedor")
      .update(updateData)
      .eq("id", parseInt(id))
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
