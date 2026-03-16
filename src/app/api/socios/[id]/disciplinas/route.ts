import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/supabase/roles";
import { z } from "zod";

const SOCIOS_ROLES = ["super_admin", "secretaria"];

const asignarDisciplinaSchema = z.object({
  disciplina_id: z.number(),
  categoria: z.string().optional(),
});

// POST /api/socios/[id]/disciplinas — asignar disciplina
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(SOCIOS_ROLES);
    const supabase = createAdminClient();
    const { id } = await params;

    const body = await request.json();
    const parsed = asignarDisciplinaSchema.parse(body);

    const insertPayload = {
      perfil_id: id,
      disciplina_id: parsed.disciplina_id,
      categoria: parsed.categoria || null,
    };
    const { data, error } = await supabase
      .from("perfil_disciplinas")
      .insert(insertPayload as never)
      .select("*, disciplinas(id, nombre, slug)")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "El socio ya está asignado a esta disciplina con esa categoría" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ disciplina: data }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: err.issues },
        { status: 400 }
      );
    }
    if (err instanceof Error && err.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// DELETE /api/socios/[id]/disciplinas — quitar disciplina
const quitarDisciplinaSchema = z.object({
  perfil_disciplina_id: z.number(),
});

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(SOCIOS_ROLES);
    const supabase = createAdminClient();
    await params; // validate params exist

    const body = await request.json();
    const parsed = quitarDisciplinaSchema.parse(body);

    const { error } = await supabase
      .from("perfil_disciplinas")
      .delete()
      .eq("id", parsed.perfil_disciplina_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", details: err.issues },
        { status: 400 }
      );
    }
    if (err instanceof Error && err.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
