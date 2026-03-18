import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { normalizeCedula } from "@/lib/utils";
import { z } from "zod";

const PADRON_ROLES = ["super_admin", "secretaria"];

// GET /api/padron — listar socios del padrón con filtros y paginación
export async function GET(request: NextRequest) {
  try {
    await requireRole(PADRON_ROLES);
    const supabase = createAdminClient();

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const activo = searchParams.get("activo");
    const disciplina = searchParams.get("disciplina") || "";
    const vinculado = searchParams.get("vinculado");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const ALLOWED_SORT_COLUMNS = ["apellido", "nombre", "cedula", "created_at", "activo"];
    const rawSortBy = searchParams.get("sortBy") || "apellido";
    const sortBy = ALLOWED_SORT_COLUMNS.includes(rawSortBy) ? rawSortBy : "apellido";
    const sortOrder = searchParams.get("sortOrder") || "asc";
    const offset = (page - 1) * limit;

    let query = supabase
      .from("padron_socios")
      .select(
        `
        *,
        padron_disciplinas (
          id,
          disciplina_id,
          categoria,
          activa,
          disciplinas (id, nombre, slug)
        ),
        perfiles:perfil_id (id, nombre, apellido, avatar_url)
      `,
        { count: "exact" }
      );

    if (search) {
      // Escape special ILIKE characters
      const s = search.replace(/%/g, "\\%").replace(/_/g, "\\_");
      query = query.or(
        `nombre.ilike.%${s}%,apellido.ilike.%${s}%,cedula.ilike.%${s}%`
      );
    }

    if (activo !== null && activo !== undefined && activo !== "") {
      query = query.eq("activo", activo === "true");
    }

    if (disciplina) {
      query = query.filter(
        "padron_disciplinas.disciplina_id",
        "eq",
        disciplina
      );
    }

    if (vinculado === "true") {
      query = query.not("perfil_id", "is", null);
    } else if (vinculado === "false") {
      query = query.is("perfil_id", null);
    }

    const ascending = sortOrder === "asc";
    query = query.order(sortBy, { ascending });
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

// POST /api/padron — crear nueva entrada en el padrón
const crearPadronSchema = z.object({
  nombre: z.string().min(1, "Nombre requerido").max(100),
  apellido: z.string().min(1, "Apellido requerido").max(100),
  cedula: z.string().min(1, "Cédula requerida").max(20),
  fecha_nacimiento: z.string().optional(),
  telefono: z.string().max(20).optional(),
  notas: z.string().optional(),
  disciplinas: z
    .array(
      z.object({
        disciplina_id: z.number(),
        categoria: z.string().optional(),
      })
    )
    .optional()
    .default([]),
});

export async function POST(request: NextRequest) {
  try {
    await requireRole(PADRON_ROLES);
    const currentUser = await getCurrentUser();
    const supabase = createAdminClient();

    const body = await request.json();
    const parsed = crearPadronSchema.parse(body);

    const cedulaNormalizada = normalizeCedula(parsed.cedula);

    // Verificar que la cédula no exista ya
    const { data: existente } = await supabase
      .from("padron_socios")
      .select("id")
      .eq("cedula", cedulaNormalizada)
      .maybeSingle();

    if (existente) {
      return NextResponse.json(
        { error: "Ya existe un socio con esa cédula" },
        { status: 409 }
      );
    }

    // Crear entrada en padrón
    const { data: socioData, error: insertError } = await supabase
      .from("padron_socios")
      .insert({
        nombre: parsed.nombre,
        apellido: parsed.apellido,
        cedula: cedulaNormalizada,
        fecha_nacimiento: parsed.fecha_nacimiento || null,
        telefono: parsed.telefono || null,
        notas: parsed.notas || null,
        created_by: currentUser?.id || null,
      } as never)
      .select()
      .single();

    if (insertError || !socioData) {
      return NextResponse.json(
        { error: insertError?.message || "Error al crear socio" },
        { status: 500 }
      );
    }

    const socio = socioData as unknown as { id: number };

    // Insertar disciplinas si las hay
    if (parsed.disciplinas.length > 0) {
      const disciplinasData = parsed.disciplinas.map((d) => ({
        padron_socio_id: socio.id,
        disciplina_id: d.disciplina_id,
        categoria: d.categoria || null,
      }));

      await supabase
        .from("padron_disciplinas")
        .insert(disciplinasData as never);
    }

    return NextResponse.json({ socio }, { status: 201 });
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
