import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/supabase/roles";
import { normalizeCedula } from "@/lib/utils";
import { z } from "zod";
import { SupabaseClient } from "@supabase/supabase-js";

const PADRON_ROLES = ["super_admin", "secretaria"];

// ── Helpers de vinculación ──────────────────────────────

/** Desvincula un perfil de su estado de socio: flags, rol, disciplinas */
async function desvincularPerfil(
  supabase: SupabaseClient,
  perfilId: string
) {
  // Flags
  await supabase
    .from("perfiles")
    .update({
      es_socio: false,
      socio_verificado: false,
      padron_socio_id: null,
    } as never)
    .eq("id", perfilId);

  // Remover rol socio
  const { data: rolSocio } = await supabase
    .from("roles")
    .select("id")
    .eq("nombre", "socio")
    .single();

  if (rolSocio) {
    await supabase
      .from("perfil_roles")
      .delete()
      .eq("perfil_id", perfilId)
      .eq("rol_id", rolSocio.id);
  }

  // Reasignar rol no_socio
  const { data: rolNoSocio } = await supabase
    .from("roles")
    .select("id")
    .eq("nombre", "no_socio")
    .single();

  if (rolNoSocio) {
    await supabase.from("perfil_roles").upsert(
      { perfil_id: perfilId, rol_id: rolNoSocio.id } as never,
      { onConflict: "perfil_id,rol_id" }
    );
  }

  // Limpiar vínculo en padron_socios
  await supabase
    .from("padron_socios")
    .update({ perfil_id: null, vinculado_at: null } as never)
    .eq("perfil_id", perfilId);
}

/** Re-vincula un perfil como socio activo: flags, rol, disciplinas */
async function revincularPerfil(
  supabase: SupabaseClient,
  perfilId: string,
  padronSocioId: number
) {
  // Flags
  await supabase
    .from("perfiles")
    .update({
      es_socio: true,
      socio_verificado: true,
      padron_socio_id: padronSocioId,
    } as never)
    .eq("id", perfilId);

  // Asignar rol socio
  const { data: rolSocio } = await supabase
    .from("roles")
    .select("id")
    .eq("nombre", "socio")
    .single();

  if (rolSocio) {
    await supabase.from("perfil_roles").upsert(
      { perfil_id: perfilId, rol_id: rolSocio.id } as never,
      { onConflict: "perfil_id,rol_id" }
    );
  }

  // Remover rol no_socio
  const { data: rolNoSocio } = await supabase
    .from("roles")
    .select("id")
    .eq("nombre", "no_socio")
    .single();

  if (rolNoSocio) {
    await supabase
      .from("perfil_roles")
      .delete()
      .eq("perfil_id", perfilId)
      .eq("rol_id", rolNoSocio.id);
  }

  // Las disciplinas ya viven en padron_disciplinas, no hace falta sincronizar
}

// ── GET /api/padron/[id] ────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(PADRON_ROLES);
    const { id } = await params;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("padron_socios")
      .select(
        `
        *,
        padron_disciplinas (
          id,
          disciplina_id,
          categoria,
          activa,
          fecha_ingreso,
          disciplinas (id, nombre, slug)
        ),
        perfiles:perfil_id (id, nombre, apellido, avatar_url, cedula, telefono)
      `
      )
      .eq("id", parseInt(id))
      .single();

    if (error) {
      return NextResponse.json({ error: "Socio no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ socio: data });
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

// ── PUT /api/padron/[id] ────────────────────────────────

const actualizarPadronSchema = z.object({
  nombre: z.string().min(1).max(100).optional(),
  apellido: z.string().min(1).max(100).optional(),
  cedula: z.string().min(1).max(20).optional(),
  fecha_nacimiento: z.string().nullable().optional(),
  telefono: z.string().max(20).nullable().optional(),
  notas: z.string().nullable().optional(),
  activo: z.boolean().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(PADRON_ROLES);
    const { id } = await params;
    const padronId = parseInt(id);
    const supabase = createAdminClient();

    const body = await request.json();
    const parsed = actualizarPadronSchema.parse(body);

    // Normalizar cédula si se envía
    const updateData: Record<string, unknown> = { ...parsed };
    if (parsed.cedula) {
      updateData.cedula = normalizeCedula(parsed.cedula);
    }

    // Obtener el registro actual para saber si está vinculado
    const { data: actualData } = await supabase
      .from("padron_socios")
      .select("perfil_id, activo")
      .eq("id", padronId)
      .single();

    const actual = actualData as unknown as { perfil_id: string | null; activo: boolean } | null;

    if (!actual) {
      return NextResponse.json({ error: "Socio no encontrado" }, { status: 404 });
    }

    // Actualizar padrón
    const { data, error } = await supabase
      .from("padron_socios")
      .update(updateData as never)
      .eq("id", padronId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Sincronizar con perfiles si está vinculado
    if (actual.perfil_id) {
      if (parsed.activo === false && actual.activo === true) {
        await desvincularPerfil(supabase, actual.perfil_id);
      }

      if (parsed.activo === true && actual.activo === false) {
        await revincularPerfil(supabase, actual.perfil_id, padronId);
      }
    }

    return NextResponse.json({ socio: data });
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

// ── DELETE /api/padron/[id] — desactivar socio (soft delete) ──

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(PADRON_ROLES);
    const { id } = await params;
    const supabase = createAdminClient();

    const { data: actualDelData } = await supabase
      .from("padron_socios")
      .select("perfil_id")
      .eq("id", parseInt(id))
      .single();

    const actualDel = actualDelData as unknown as { perfil_id: string | null } | null;

    if (!actualDel) {
      return NextResponse.json({ error: "Socio no encontrado" }, { status: 404 });
    }

    // Soft delete: desactivar
    await supabase
      .from("padron_socios")
      .update({ activo: false } as never)
      .eq("id", parseInt(id));

    // Si está vinculado, desvincular completamente
    if (actualDel.perfil_id) {
      await desvincularPerfil(supabase, actualDel.perfil_id);
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
