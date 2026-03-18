import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import { z } from "zod";

const TIENDA_ROLES = ["super_admin", "tienda"];

const listaSchema = z.object({
  nombre: z.string().min(1, "Nombre requerido").max(200),
  descripcion: z.string().optional().nullable(),
  activa: z.boolean().default(true),
});

// GET /api/admin/listas-precio
export async function GET() {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("listas_precio")
      .select(`
        *,
        lista_precio_disciplinas(id, disciplina_id, disciplinas(id, nombre)),
        lista_precio_items(count)
      `)
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

// POST /api/admin/listas-precio
export async function POST(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = await createServerClient();
    const body = await request.json();
    const parsed = listaSchema.parse(body);

    const { data, error } = await supabase
      .from("listas_precio")
      .insert(parsed as any)
      .select()
      .single();

    if (error) throw error;
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
