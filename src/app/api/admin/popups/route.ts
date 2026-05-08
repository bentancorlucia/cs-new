import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { popupSchema } from "@/lib/popups/schema";

const POPUP_ROLES = ["super_admin", "secretaria"];

// GET /api/admin/popups — listar todos los popups
export async function GET(_request: NextRequest) {
  try {
    await requireRole(POPUP_ROLES);
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("popups" as any)
      .select("*")
      .order("priority", { ascending: false })
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ data });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/admin/popups — crear popup
export async function POST(request: NextRequest) {
  try {
    await requireRole(POPUP_ROLES);
    const user = await getCurrentUser();
    const supabase = createAdminClient();

    const body = await request.json();
    const parsed = popupSchema.parse(body);

    if (new Date(parsed.ends_at) < new Date(parsed.starts_at)) {
      return NextResponse.json(
        { error: "La fecha de fin debe ser posterior al inicio" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("popups" as any)
      .insert({
        title: parsed.title ?? null,
        body: parsed.body ?? null,
        image_url: parsed.image_url ?? null,
        buttons: parsed.buttons,
        pages: parsed.pages,
        starts_at: parsed.starts_at,
        ends_at: parsed.ends_at,
        priority: parsed.priority,
        status: parsed.status,
        created_by: user?.id ?? null,
      } as any)
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
    return NextResponse.json(
      { error: error.message || "Error al crear popup" },
      { status: 500 }
    );
  }
}
