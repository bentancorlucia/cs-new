import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import { z } from "zod";

const TIENDA_ROLES = ["super_admin", "tienda"];

const pinSchema = z.object({
  pin: z.string().min(4).max(6),
});

// POST /api/admin/pos/verificar-pin — validar PIN de supervisor
export async function POST(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = await createServerClient();
    const body = await request.json();
    const { pin } = pinSchema.parse(body);

    // Find user with matching PIN who has super_admin or tienda role
    const { data, error } = await (supabase as any)
      .from("perfiles")
      .select("id, nombre_completo, perfil_roles(rol)")
      .eq("pin_autorizacion", pin)
      .limit(1)
      .maybeSingle() as { data: any; error: any };

    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        { valid: false, error: "PIN inválido" },
        { status: 401 }
      );
    }

    // Verify the user has an admin role
    const roles = (data.perfil_roles as any[])?.map((r: any) => r.rol) || [];
    const hasAdminRole = roles.some((r) =>
      ["super_admin", "tienda"].includes(r)
    );

    if (!hasAdminRole) {
      return NextResponse.json(
        { valid: false, error: "PIN no autorizado para descuentos" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      valid: true,
      perfil_id: data.id,
      nombre: data.nombre_completo,
    });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "PIN inválido" }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
