import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { z } from "zod";

const SOCIOS_ROLES = ["super_admin", "secretaria"];

// GET /api/socios — listar socios con filtros y paginación
export async function GET(request: NextRequest) {
  try {
    await requireRole(SOCIOS_ROLES);
    const supabase = createAdminClient();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const estado = searchParams.get("estado") || "";
    const disciplina = searchParams.get("disciplina") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const ALLOWED_SORT_COLUMNS = ["apellido", "nombre", "cedula", "created_at"];
    const rawSortBy = searchParams.get("sortBy") || "apellido";
    const sortBy = ALLOWED_SORT_COLUMNS.includes(rawSortBy) ? rawSortBy : "apellido";
    const sortOrder = searchParams.get("sortOrder") || "asc";
    const offset = (page - 1) * limit;

    let query = supabase
      .from("perfiles")
      .select(
        `
        *,
        perfil_disciplinas (
          id,
          disciplina_id,
          categoria,
          activa,
          disciplinas (id, nombre, slug)
        )
      `,
        { count: "exact" }
      )
      .eq("es_socio", true);

    // Search by name or cedula
    if (search) {
      const s = search.replace(/%/g, "\\%").replace(/_/g, "\\_");
      query = query.or(
        `nombre.ilike.%${s}%,apellido.ilike.%${s}%,cedula.ilike.%${s}%`
      );
    }

    // Filter by estado — no longer on perfiles (moved to padron_socios)
    // Kept as no-op for backwards compatibility until fully replaced by /api/padron

    // Filter by disciplina
    if (disciplina) {
      query = query.filter(
        "perfil_disciplinas.disciplina_id",
        "eq",
        disciplina
      );
    }

    // Sorting
    const ascending = sortOrder === "asc";
    query = query.order(sortBy, { ascending });

    // Pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      socios: data,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
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

// POST /api/socios — crear nuevo socio
const crearSocioSchema = z.object({
  nombre: z.string().min(1, "Nombre requerido").max(100),
  apellido: z.string().min(1, "Apellido requerido").max(100),
  cedula: z.string().min(1, "Cédula requerida").max(20),
  telefono: z.string().max(20).optional(),
  fecha_nacimiento: z.string().optional(),
  disciplinas: z
    .array(
      z.object({
        disciplina_id: z.number(),
        categoria: z.string().optional(),
      })
    )
    .min(1, "Al menos una disciplina"),
  perfil_id: z.string().uuid().optional(), // If linking to existing user
});

export async function POST(request: NextRequest) {
  try {
    await requireRole(SOCIOS_ROLES);
    const currentUser = await getCurrentUser();
    const supabase = createAdminClient();

    const body = await request.json();
    const parsed = crearSocioSchema.parse(body);

    if (parsed.perfil_id) {
      // Update existing profile to be socio
      const { error: updateError } = await supabase
        .from("perfiles")
        .update({
          nombre: parsed.nombre,
          apellido: parsed.apellido,
          cedula: parsed.cedula,
          telefono: parsed.telefono || null,
          fecha_nacimiento: parsed.fecha_nacimiento || null,
          es_socio: true,
        } as never)
        .eq("id", parsed.perfil_id);

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message },
          { status: 500 }
        );
      }

      // Assign socio role
      const { data: rolSocioData } = await supabase
        .from("roles")
        .select("id")
        .eq("nombre", "socio")
        .single();
      const rolSocio = rolSocioData as unknown as { id: number } | null;

      if (rolSocio) {
        await supabase.from("perfil_roles").upsert(
          {
            perfil_id: parsed.perfil_id,
            rol_id: rolSocio.id,
            asignado_por: currentUser?.id || null,
          } as never,
          { onConflict: "perfil_id,rol_id" }
        );
      }

      // Assign disciplinas
      const disciplinasData = parsed.disciplinas.map((d) => ({
        perfil_id: parsed.perfil_id!,
        disciplina_id: d.disciplina_id,
        categoria: d.categoria || null,
      }));

      await supabase.from("perfil_disciplinas").insert(disciplinasData as never);

      return NextResponse.json({
        socio_id: parsed.perfil_id,
      });
    } else {
      // Create new profile via Supabase Auth invite or manual insert
      // For manual creation (without auth account), we create a placeholder profile
      const newId = crypto.randomUUID();

      const { error: insertError } = await supabase.from("perfiles").insert({
        id: newId,
        nombre: parsed.nombre,
        apellido: parsed.apellido,
        cedula: parsed.cedula,
        telefono: parsed.telefono || null,
        fecha_nacimiento: parsed.fecha_nacimiento || null,
        es_socio: true,
      } as never);

      if (insertError) {
        return NextResponse.json(
          { error: insertError.message },
          { status: 500 }
        );
      }

      // Assign disciplinas
      const disciplinasData2 = parsed.disciplinas.map((d) => ({
        perfil_id: newId,
        disciplina_id: d.disciplina_id,
        categoria: d.categoria || null,
      }));

      await supabase.from("perfil_disciplinas").insert(disciplinasData2 as never);

      return NextResponse.json(
        { socio_id: newId },
        { status: 201 }
      );
    }
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
