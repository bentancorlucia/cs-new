import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import { z } from "zod/v4";

const quitarRolSchema = z.object({
  perfil_id: z.string().uuid(),
  rol_nombre: z.string(),
});

export async function POST(request: Request) {
  try {
    await requireRole(["super_admin"]);

    const body = await request.json();
    const parsed = quitarRolSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { perfil_id, rol_nombre } = parsed.data;

    const supabase = await createServerClient();

    // Find role ID
    const { data: rolData, error: rolError } = await supabase
      .from("roles")
      .select("*")
      .eq("nombre", rol_nombre)
      .single();

    if (rolError || !rolData) {
      return NextResponse.json(
        { error: `Rol "${rol_nombre}" no encontrado` },
        { status: 404 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("perfil_roles") as any)
      .delete()
      .eq("perfil_id", perfil_id)
      .eq("rol_id", rolData.id);

    if (error) {
      return NextResponse.json(
        { error: "Error al quitar rol" },
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
