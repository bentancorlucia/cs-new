import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { normalizeCedula } from "@/lib/utils";
import { z } from "zod";

const STAFF_ROLES = ["super_admin", "secretaria"];

// GET /api/staff — listar staff con disciplina + match con padron_socios por cédula
export async function GET() {
  try {
    await requireRole(STAFF_ROLES);
    const supabase = createAdminClient();

    const { data: staff, error } = await supabase
      .from("staff")
      .select(
        `
        *,
        disciplinas:disciplina_id (id, nombre, slug, activa)
      `
      )
      .order("apellido")
      .order("nombre");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows =
      (staff as unknown as (Record<string, unknown> & {
        cedula: string | null;
      })[]) || [];

    // Resolver vínculo con padron_socios via cédula
    const cedulas = rows
      .map((r) => r.cedula)
      .filter((c): c is string => !!c);

    let socioByCedula: Record<string, { id: number; activo: boolean }> = {};
    if (cedulas.length > 0) {
      const { data: padron } = await supabase
        .from("padron_socios")
        .select("id, cedula, activo")
        .in("cedula", cedulas);

      const padronRows = (padron as unknown as {
        id: number;
        cedula: string;
        activo: boolean;
      }[]) || [];

      socioByCedula = padronRows.reduce(
        (acc, p) => {
          acc[p.cedula] = { id: p.id, activo: p.activo };
          return acc;
        },
        {} as Record<string, { id: number; activo: boolean }>
      );
    }

    const result = rows.map((r) => {
      const match = r.cedula ? socioByCedula[r.cedula] : undefined;
      return {
        ...r,
        padron_socio_id: match?.id ?? null,
        socio_activo: match?.activo ?? null,
      };
    });

    return NextResponse.json({ staff: result });
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

// POST /api/staff — crear
// Acepta string, "", null o undefined. "" se convierte a null. undefined se preserva
// (para updates parciales que no deben sobreescribir el campo).
const optionalText = z.preprocess(
  (v) => (v === "" ? null : v),
  z.string().nullable().optional()
);
const optionalEmail = z.preprocess(
  (v) => (v === "" ? null : v),
  z.string().email("Email inválido").nullable().optional()
);

const crearStaffSchema = z.object({
  nombre: z.string().min(1, "Nombre requerido").max(100),
  apellido: z.string().min(1, "Apellido requerido").max(100),
  cedula: z.string().min(1, "Cédula requerida").max(20),
  cargo: z.string().min(1, "Cargo requerido").max(100),
  disciplina_id: z.number().nullish(),
  telefono: optionalText,
  email: optionalEmail,
  descripcion: optionalText,
  fecha_ingreso: optionalText,
  notas: optionalText,
});

export async function POST(request: NextRequest) {
  try {
    await requireRole(STAFF_ROLES);
    const currentUser = await getCurrentUser();
    const supabase = createAdminClient();

    const body = await request.json();
    const parsed = crearStaffSchema.parse(body);

    const cedulaNormalizada = normalizeCedula(parsed.cedula);
    if (!cedulaNormalizada) {
      return NextResponse.json(
        { error: "Cédula requerida" },
        { status: 400 }
      );
    }

    const { data: existente } = await supabase
      .from("staff")
      .select("id")
      .eq("cedula", cedulaNormalizada)
      .maybeSingle();
    if (existente) {
      return NextResponse.json(
        { error: "Ya existe un staff con esa cédula" },
        { status: 409 }
      );
    }

    const insertData = {
      nombre: parsed.nombre.trim(),
      apellido: parsed.apellido.trim(),
      cedula: cedulaNormalizada,
      cargo: parsed.cargo.trim(),
      disciplina_id: parsed.disciplina_id ?? null,
      telefono: parsed.telefono?.trim() || null,
      email: parsed.email?.trim() || null,
      descripcion: parsed.descripcion?.trim() || null,
      fecha_ingreso: parsed.fecha_ingreso || null,
      notas: parsed.notas?.trim() || null,
      created_by: currentUser?.id || null,
    };

    const { data, error } = await supabase
      .from("staff")
      .insert(insertData as never)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ staff: data }, { status: 201 });
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

// PUT /api/staff — actualizar (incluye toggle activo)
const updateStaffSchema = z.object({
  id: z.number(),
  nombre: z.string().min(1).max(100).optional(),
  apellido: z.string().min(1).max(100).optional(),
  cedula: z.string().min(1, "Cédula requerida").max(20).optional(),
  cargo: z.string().min(1).max(100).optional(),
  disciplina_id: z.number().nullish(),
  telefono: optionalText,
  email: optionalEmail,
  descripcion: optionalText,
  fecha_ingreso: optionalText,
  notas: optionalText,
  activo: z.boolean().optional(),
});

export async function PUT(request: NextRequest) {
  try {
    await requireRole(STAFF_ROLES);
    const supabase = createAdminClient();

    const body = await request.json();
    const parsed = updateStaffSchema.parse(body);

    const { id, ...rest } = parsed;
    // Solo incluir campos explícitamente presentes (ignorar undefined)
    const updateData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) updateData[k] = v;
    }

    if (typeof updateData.cedula === "string" && updateData.cedula.length > 0) {
      updateData.cedula = normalizeCedula(updateData.cedula);

      const { data: existente } = await supabase
        .from("staff")
        .select("id")
        .eq("cedula", updateData.cedula as string)
        .neq("id", id)
        .maybeSingle();
      if (existente) {
        return NextResponse.json(
          { error: "Ya existe un staff con esa cédula" },
          { status: 409 }
        );
      }
    }

    const { data, error } = await supabase
      .from("staff")
      .update(updateData as never)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ staff: data });
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
