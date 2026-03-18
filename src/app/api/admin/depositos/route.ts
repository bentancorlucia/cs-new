import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";
import { z } from "zod";

const TIENDA_ROLES = ["super_admin", "tienda"];

const depositoSchema = z.object({
  nombre: z.string().min(1, "Nombre requerido").max(200),
  descripcion: z.string().optional().nullable(),
  ubicacion: z.string().max(200).optional().nullable(),
  activo: z.boolean().default(true),
});

// GET /api/admin/depositos — listar depósitos
export async function GET() {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("depositos")
      .select("*")
      .order("created_at");

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/admin/depositos — crear depósito
export async function POST(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const supabase = await createServerClient();
    const body = await request.json();
    const parsed = depositoSchema.parse(body);

    const { data, error } = await supabase
      .from("depositos")
      .insert(parsed as any)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
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
