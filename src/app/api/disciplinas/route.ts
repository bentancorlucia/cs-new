import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/supabase/roles";

const SOCIOS_ROLES = ["super_admin", "secretaria"];

// GET /api/disciplinas — listar disciplinas con conteo de socios
export async function GET() {
  try {
    await requireRole(SOCIOS_ROLES);
    const supabase = createAdminClient();

    const { data: disciplinas, error } = await supabase
      .from("disciplinas")
      .select(
        `
        *,
        padron_disciplinas (id)
      `
      )
      .order("nombre");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Add socios count
    const typed = disciplinas as unknown as (Record<string, unknown> & { padron_disciplinas?: unknown[] })[];
    const result = typed?.map(({ padron_disciplinas, ...rest }) => ({
      ...rest,
      socios_count: padron_disciplinas?.length || 0,
    }));

    return NextResponse.json({ disciplinas: result });
  } catch (err) {
    if (err instanceof Error && err.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// El alta y la edición de disciplinas son Server Actions de
// /secretaria/disciplinas (actions.ts). Este GET queda para secretaria/staff.
