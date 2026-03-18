import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import { z } from "zod";

const TIENDA_ROLES = ["super_admin", "tienda"];

const bulkSchema = z.object({
  disciplina_ids: z.array(z.number().positive()),
});

// PUT /api/admin/listas-precio/[id]/disciplinas — sync disciplinas
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const listaId = parseInt(id);
    const supabase = await createServerClient();

    const body = await request.json();
    const { disciplina_ids } = bulkSchema.parse(body);

    // Delete existing
    await supabase
      .from("lista_precio_disciplinas")
      .delete()
      .eq("lista_precio_id", listaId);

    // Insert new
    if (disciplina_ids.length > 0) {
      const rows = disciplina_ids.map((disciplina_id) => ({
        lista_precio_id: listaId,
        disciplina_id,
      }));

      const { error } = await supabase
        .from("lista_precio_disciplinas")
        .insert(rows as any);

      if (error) throw error;
    }

    // Fetch updated
    const { data, error } = await supabase
      .from("lista_precio_disciplinas")
      .select("id, disciplina_id, disciplinas(id, nombre)")
      .eq("lista_precio_id", listaId);

    if (error) throw error;

    return NextResponse.json({ data });
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
