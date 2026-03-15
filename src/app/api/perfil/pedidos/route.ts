import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("pedidos")
    .select(
      `
      id, numero_pedido, tipo, estado, subtotal, descuento, total, moneda,
      metodo_pago, notas, created_at, updated_at,
      pedido_items(
        id, cantidad, precio_unitario, subtotal,
        productos(nombre, slug)
      )
    `
    )
    .eq("perfil_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
