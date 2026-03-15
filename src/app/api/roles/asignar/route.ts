import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { z } from "zod/v4";
import type { Database } from "@/types/database";

type RolRow = Database["public"]["Tables"]["roles"]["Row"];
type PerfilRolRow = Database["public"]["Tables"]["perfil_roles"]["Row"];

const asignarRolSchema = z.object({
  perfil_id: z.string().uuid(),
  rol_nombre: z.string(),
});

export async function POST(request: Request) {
  try {
    // Verify caller is admin or secretaria
    await requireRole(["super_admin", "secretaria"]);

    const body = await request.json();
    const parsed = asignarRolSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { perfil_id, rol_nombre } = parsed.data;

    // Only super_admin can assign super_admin
    if (rol_nombre === "super_admin") {
      await requireRole(["super_admin"]);
    }

    const user = await getCurrentUser();
    const supabase = await createServerClient();

    // Find role ID
    const { data: rolData, error: rolError } = (await supabase
      .from("roles")
      .select("*")
      .eq("nombre", rol_nombre)
      .single()) as { data: RolRow | null; error: unknown };

    if (rolError || !rolData) {
      return NextResponse.json(
        { error: `Rol "${rol_nombre}" no encontrado` },
        { status: 404 }
      );
    }

    const rolId = rolData.id;

    // Check if already assigned
    const { data: existing } = (await supabase
      .from("perfil_roles")
      .select("*")
      .eq("perfil_id", perfil_id)
      .eq("rol_id", rolId)
      .maybeSingle()) as { data: PerfilRolRow | null; error: unknown };

    if (existing) {
      return NextResponse.json(
        { error: "El usuario ya tiene este rol" },
        { status: 409 }
      );
    }

    // Assign role
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("perfil_roles") as any).insert({
      perfil_id,
      rol_id: rolId,
      asignado_por: user?.id ?? null,
    });

    if (error) {
      return NextResponse.json(
        { error: "Error al asignar rol" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
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
