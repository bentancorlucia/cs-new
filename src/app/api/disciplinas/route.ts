import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import { z } from "zod";

const SOCIOS_ROLES = ["super_admin", "secretaria"];

// GET /api/disciplinas — listar disciplinas con conteo de socios
export async function GET() {
  try {
    await requireRole(SOCIOS_ROLES);
    const supabase = await createServerClient();

    const { data: disciplinas, error } = await supabase
      .from("disciplinas")
      .select(
        `
        *,
        perfil_disciplinas (id)
      `
      )
      .order("nombre");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Add socios count
    const typed = disciplinas as unknown as (Record<string, unknown> & { perfil_disciplinas?: unknown[] })[];
    const result = typed?.map(({ perfil_disciplinas, ...rest }) => ({
      ...rest,
      socios_count: perfil_disciplinas?.length || 0,
    }));

    return NextResponse.json({ disciplinas: result });
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

// POST /api/disciplinas — crear disciplina
const crearDisciplinaSchema = z.object({
  nombre: z.string().min(1, "Nombre requerido").max(100),
  slug: z.string().min(1).max(100),
  descripcion: z.string().optional(),
  imagen_url: z.string().url().optional(),
  contacto_nombre: z.string().max(100).optional(),
  contacto_telefono: z.string().max(20).optional(),
  contacto_email: z.string().email().optional(),
  activa: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    await requireRole(SOCIOS_ROLES);
    const supabase = await createServerClient();

    const body = await request.json();
    const parsed = crearDisciplinaSchema.parse(body);

    const insertData = {
      nombre: parsed.nombre,
      slug: parsed.slug,
      descripcion: parsed.descripcion || null,
      imagen_url: parsed.imagen_url || null,
      contacto_nombre: parsed.contacto_nombre || null,
      contacto_telefono: parsed.contacto_telefono || null,
      contacto_email: parsed.contacto_email || null,
      activa: parsed.activa ?? true,
    };
    const { data, error } = await (supabase
      .from("disciplinas") as ReturnType<typeof supabase.from>)
      .insert(insertData as never)
      .select()
      .single();

    if (error) {
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

// PUT /api/disciplinas — actualizar disciplina
const updateDisciplinaSchema = z.object({
  id: z.number(),
  nombre: z.string().min(1).max(100).optional(),
  slug: z.string().min(1).max(100).optional(),
  descripcion: z.string().nullable().optional(),
  imagen_url: z.string().nullable().optional(),
  contacto_nombre: z.string().max(100).nullable().optional(),
  contacto_telefono: z.string().max(20).nullable().optional(),
  contacto_email: z.string().nullable().optional(),
  activa: z.boolean().optional(),
});

export async function PUT(request: NextRequest) {
  try {
    await requireRole(SOCIOS_ROLES);
    const supabase = await createServerClient();

    const body = await request.json();
    const parsed = updateDisciplinaSchema.parse(body);

    const { id, ...updateData } = parsed;

    const { data, error } = await (supabase
      .from("disciplinas") as ReturnType<typeof supabase.from>)
      .update(updateData as never)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ disciplina: data });
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
