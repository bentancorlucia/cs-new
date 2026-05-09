import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/supabase/roles";

const TIENDA_ROLES = ["super_admin", "tienda"];

// GET /api/admin/donaciones — config + KPIs + listas
export async function GET() {
  try {
    await requireRole(TIENDA_ROLES);
    const db = createAdminClient() as any;

    const [{ data: config }, { data: pendientes }, { data: transferidas }] =
      await Promise.all([
        db.from("donaciones_config").select("*").eq("id", 1).single(),
        db
          .from("donaciones")
          .select(
            `
              id, monto, estado, cobrada_at, created_at,
              pedidos!pedido_id(id, numero_pedido, nombre_cliente, perfil_id, perfiles!perfil_id(nombre, apellido))
            `
          )
          .eq("estado", "cobrada")
          .is("transferencia_id", null)
          .order("cobrada_at", { ascending: false }),
        db
          .from("donaciones_transferencias")
          .select("*")
          .order("fecha_transferencia", { ascending: false }),
      ]);

    const pendientesArr = (pendientes || []) as any[];
    const totalPendiente = pendientesArr.reduce(
      (sum, d) => sum + Number(d.monto),
      0
    );
    const cantidadPendiente = pendientesArr.length;

    const transferidasArr = (transferidas || []) as any[];
    const totalTransferido = transferidasArr.reduce(
      (sum, t) => sum + Number(t.monto_total),
      0
    );

    // Total histórico cobrado (incluye transferidas + pendientes, excluye canceladas)
    const { data: histCobradas } = await db
      .from("donaciones")
      .select("monto")
      .in("estado", ["cobrada", "transferida"]);
    const totalRecaudado = ((histCobradas || []) as any[]).reduce(
      (sum, d) => sum + Number(d.monto),
      0
    );

    return NextResponse.json({
      config,
      kpis: {
        totalPendiente,
        cantidadPendiente,
        totalTransferido,
        totalRecaudado,
      },
      pendientes: pendientesArr.map((d) => ({
        id: d.id,
        monto: Number(d.monto),
        cobrada_at: d.cobrada_at,
        created_at: d.created_at,
        pedido: {
          id: d.pedidos?.id,
          numero_pedido: d.pedidos?.numero_pedido,
          cliente:
            d.pedidos?.perfiles
              ? `${d.pedidos.perfiles.nombre} ${d.pedidos.perfiles.apellido}`
              : d.pedidos?.nombre_cliente || "—",
        },
      })),
      transferencias: transferidasArr,
    });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
