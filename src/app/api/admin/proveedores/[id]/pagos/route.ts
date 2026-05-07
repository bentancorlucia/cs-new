import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { z } from "zod";

const TIENDA_ROLES = ["super_admin", "tienda"];

const pagoSchema = z.object({
  monto: z.number().positive("Monto debe ser mayor a 0"),
  metodo_pago: z.enum(["efectivo", "transferencia", "cheque", "otro"]),
  referencia: z.string().optional().nullable(),
  compra_id: z.number().optional().nullable(),
  notas: z.string().optional().nullable(),
});

// GET /api/admin/proveedores/[id]/pagos — historial de pagos
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("pagos_proveedor")
      .select("*, compras_proveedor(numero_compra)")
      .eq("proveedor_id", parseInt(id))
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/admin/proveedores/[id]/pagos — registrar pago
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const user = await getCurrentUser();
    const supabase = await createServerClient();
    const body = await request.json();
    const parsed = pagoSchema.parse(body);

    const db = supabase as any;
    const { data, error } = await db
      .from("pagos_proveedor")
      .insert({
        proveedor_id: parseInt(id),
        monto: parsed.monto,
        metodo_pago: parsed.metodo_pago,
        referencia: parsed.referencia || null,
        compra_id: parsed.compra_id || null,
        notas: parsed.notas || null,
        registrado_por: user?.id,
      })
      .select()
      .single();

    if (error) throw error;

    // El trigger en DB actualiza saldo_cuenta_corriente automáticamente

    try {
      const { data: proveedor } = await db
        .from("proveedores")
        .select("nombre")
        .eq("id", parseInt(id))
        .maybeSingle();

      let compraNumero: string | null = null;
      if (parsed.compra_id) {
        const { data: compra } = await db
          .from("compras_proveedor")
          .select("numero_compra")
          .eq("id", parsed.compra_id)
          .maybeSingle();
        compraNumero = compra?.numero_compra ?? null;
      }

      const { registrarMovimientoPagoProveedor } = await import(
        "@/lib/tienda/registrar-movimiento"
      );
      await registrarMovimientoPagoProveedor(db, {
        pagoId: data.id,
        proveedorNombre: proveedor?.nombre || `Proveedor #${id}`,
        monto: parsed.monto,
        metodoPago: parsed.metodo_pago,
        referencia: parsed.referencia || null,
        compraNumero,
        registradoPor: user?.id ?? null,
      });
    } catch (movError) {
      console.error("Error al registrar movimiento financiero:", movError);
    }

    return NextResponse.json({ data }, { status: 201 });
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
