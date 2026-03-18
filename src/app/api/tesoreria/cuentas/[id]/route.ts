import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";

const TESORERIA_ROLES = ["super_admin", "tesorero"];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TESORERIA_ROLES);
    const supabase = await createServerClient();
    const { id } = await params;

    const { data, error } = await supabase
      .from("cuentas_financieras")
      .select("*")
      .eq("id", parseInt(id))
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Cuenta no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json({ cuenta: data });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
