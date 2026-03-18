import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/supabase/roles";
import { z } from "zod";

const PADRON_ROLES = ["super_admin", "secretaria"];

const bulkDisciplinaSchema = z.object({
  socio_ids: z.array(z.number()).min(1, "Seleccioná al menos un socio"),
  disciplina_id: z.number(),
  categoria: z.string().optional(),
});

// POST /api/padron/bulk/disciplinas — agregar disciplina a múltiples socios
export async function POST(request: NextRequest) {
  try {
    await requireRole(PADRON_ROLES);
    const supabase = createAdminClient();

    const body = await request.json();
    const parsed = bulkDisciplinaSchema.parse(body);

    // Verify all socios exist
    const { data: sociosData } = await supabase
      .from("padron_socios")
      .select("id")
      .in("id", parsed.socio_ids as never);

    const socios = (sociosData as { id: number }[] | null) || [];

    if (socios.length === 0) {
      return NextResponse.json(
        { error: "No se encontraron los socios seleccionados" },
        { status: 404 }
      );
    }

    // Check which socios already have this discipline
    const { data: existingData } = await supabase
      .from("padron_disciplinas")
      .select("padron_socio_id")
      .in("padron_socio_id", socios.map((s) => s.id) as never)
      .eq("disciplina_id", parsed.disciplina_id);

    const alreadyAssigned = new Set(
      ((existingData as { padron_socio_id: number }[] | null) || []).map(
        (e) => e.padron_socio_id
      )
    );

    const toInsert = socios
      .filter((s) => !alreadyAssigned.has(s.id))
      .map((s) => ({
        padron_socio_id: s.id,
        disciplina_id: parsed.disciplina_id,
        categoria: parsed.categoria || null,
      }));

    if (toInsert.length === 0) {
      return NextResponse.json({
        agregados: 0,
        ya_asignados: alreadyAssigned.size,
        message: "Todos los socios seleccionados ya tienen esta disciplina",
      });
    }

    const { error: insertError } = await supabase
      .from("padron_disciplinas")
      .insert(toInsert as never);

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      agregados: toInsert.length,
      ya_asignados: alreadyAssigned.size,
      message: `Disciplina asignada a ${toInsert.length} socios`,
    });
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
