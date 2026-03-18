import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/supabase/roles";
import { z } from "zod";

const PADRON_ROLES = ["super_admin", "secretaria"];

// POST /api/padron/[id]/disciplinas — agregar disciplina a socio del padrón
const agregarDisciplinaSchema = z.object({
  disciplina_id: z.number(),
  categoria: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(PADRON_ROLES);
    const { id } = await params;
    const supabase = createAdminClient();
    const padronSocioId = parseInt(id);

    const body = await request.json();
    const parsed = agregarDisciplinaSchema.parse(body);

    // Verificar que el socio existe
    const { data: socioData } = await supabase
      .from("padron_socios")
      .select("id, perfil_id")
      .eq("id", padronSocioId)
      .single();

    const socio = socioData as unknown as { id: number; perfil_id: string | null } | null;

    if (!socio) {
      return NextResponse.json({ error: "Socio no encontrado" }, { status: 404 });
    }

    // Insertar en padron_disciplinas
    const { data, error } = await supabase
      .from("padron_disciplinas")
      .insert({
        padron_socio_id: padronSocioId,
        disciplina_id: parsed.disciplina_id,
        categoria: parsed.categoria || null,
      } as never)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "El socio ya tiene esta disciplina asignada" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Si está vinculado, sincronizar con perfil_disciplinas
    if (socio.perfil_id) {
      await supabase.from("perfil_disciplinas").upsert(
        {
          perfil_id: socio.perfil_id,
          disciplina_id: parsed.disciplina_id,
          categoria: parsed.categoria || null,
        } as never,
        { onConflict: "perfil_id,disciplina_id,categoria" }
      );
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

// DELETE /api/padron/[id]/disciplinas — quitar disciplina de socio del padrón
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(PADRON_ROLES);
    const { id } = await params;
    const supabase = createAdminClient();
    const padronSocioId = parseInt(id);

    const { searchParams } = new URL(request.url);
    const disciplinaId = searchParams.get("disciplina_id");

    if (!disciplinaId) {
      return NextResponse.json(
        { error: "disciplina_id requerido" },
        { status: 400 }
      );
    }

    // Obtener el socio para sincronización
    const { data: socioDelData } = await supabase
      .from("padron_socios")
      .select("perfil_id")
      .eq("id", padronSocioId)
      .single();

    const socioDel = socioDelData as unknown as { perfil_id: string | null } | null;

    // Eliminar de padron_disciplinas
    const { error } = await supabase
      .from("padron_disciplinas")
      .delete()
      .eq("padron_socio_id", padronSocioId)
      .eq("disciplina_id", parseInt(disciplinaId));

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Si está vinculado, sincronizar eliminación en perfil_disciplinas
    if (socioDel?.perfil_id) {
      await supabase
        .from("perfil_disciplinas")
        .delete()
        .eq("perfil_id", socioDel.perfil_id)
        .eq("disciplina_id", parseInt(disciplinaId));
    }

    return NextResponse.json({ ok: true });
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
