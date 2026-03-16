import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/supabase/roles";
import { z } from "zod";

const SOCIOS_ROLES = ["super_admin", "secretaria"];

// GET /api/socios/[id] — ficha del socio
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(SOCIOS_ROLES);
    const supabase = createAdminClient();
    const { id } = await params;

    const { data, error } = await supabase
      .from("perfiles")
      .select(
        `
        *,
        perfil_disciplinas (
          id,
          disciplina_id,
          categoria,
          activa,
          fecha_ingreso,
          disciplinas (id, nombre, slug)
        ),
        pagos_socios!perfil_id (
          id,
          monto,
          moneda,
          periodo_mes,
          periodo_anio,
          metodo_pago,
          referencia_pago,
          notas,
          created_at
        ),
        perfil_roles!perfil_id (
          id,
          rol_id,
          roles (id, nombre, descripcion)
        )
      `
      )
      .eq("id", id)
      .single();

    if (error) {
      console.error("[GET /api/socios/[id]] Supabase error:", error.message, error.code, "id:", id);
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json({ socio: data });
  } catch (err) {
    console.error("[GET /api/socios/[id]] Unexpected error:", err);
    if (err instanceof Error && err.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// PUT /api/socios/[id] — actualizar socio
const updateSocioSchema = z.object({
  nombre: z.string().min(1).max(100).optional(),
  apellido: z.string().min(1).max(100).optional(),
  cedula: z.string().max(20).optional(),
  telefono: z.string().max(20).nullable().optional(),
  fecha_nacimiento: z.string().nullable().optional(),
  estado_socio: z
    .enum(["activo", "inactivo", "moroso", "suspendido"])
    .optional(),
  notas: z.string().nullable().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(SOCIOS_ROLES);
    const supabase = createAdminClient();
    const { id } = await params;

    const body = await request.json();
    const parsed = updateSocioSchema.parse(body);

    // Handle state change side effects
    if (parsed.estado_socio === "inactivo") {
      // Remove socio role
      const { data: rolSocioData } = await supabase
        .from("roles")
        .select("id")
        .eq("nombre", "socio")
        .single();
      const rolSocio = rolSocioData as unknown as { id: number } | null;

      if (rolSocio) {
        await supabase
          .from("perfil_roles")
          .delete()
          .eq("perfil_id", id)
          .eq("rol_id", rolSocio.id);
      }

      parsed.estado_socio = "inactivo";
    } else if (
      parsed.estado_socio === "activo" ||
      parsed.estado_socio === "moroso"
    ) {
      // Ensure socio role exists
      const { data: rolSocioData2 } = await supabase
        .from("roles")
        .select("id")
        .eq("nombre", "socio")
        .single();
      const rolSocio2 = rolSocioData2 as unknown as { id: number } | null;

      if (rolSocio2) {
        await supabase.from("perfil_roles").upsert(
          {
            perfil_id: id,
            rol_id: rolSocio2.id,
          } as never,
          { onConflict: "perfil_id,rol_id" }
        );
      }
    }

    const updateData: Record<string, unknown> = { ...parsed };
    if (parsed.estado_socio === "inactivo") {
      updateData.es_socio = false;
    } else if (parsed.estado_socio === "activo") {
      updateData.es_socio = true;
    }

    const { data, error } = await supabase
      .from("perfiles")
      .update(updateData as never)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
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

// DELETE /api/socios/[id] — dar de baja (soft delete)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(SOCIOS_ROLES);
    const supabase = createAdminClient();
    const { id } = await params;

    // Remove socio role
    const { data: rolSocioDelData } = await supabase
      .from("roles")
      .select("id")
      .eq("nombre", "socio")
      .single();
    const rolSocioDel = rolSocioDelData as unknown as { id: number } | null;

    if (rolSocioDel) {
      await supabase
        .from("perfil_roles")
        .delete()
        .eq("perfil_id", id)
        .eq("rol_id", rolSocioDel.id);
    }

    // Mark as inactive
    const { error } = await supabase
      .from("perfiles")
      .update({
        es_socio: false,
        estado_socio: "inactivo" as const,
      } as never)
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
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
