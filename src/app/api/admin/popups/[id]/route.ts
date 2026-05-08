import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/supabase/roles";
import { popupSchema } from "@/lib/popups/schema";

const POPUP_ROLES = ["super_admin", "secretaria"];

// GET /api/admin/popups/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(POPUP_ROLES);
    const { id } = await params;
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("popups" as any)
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if ((error as any).code === "PGRST116") {
        return NextResponse.json({ error: "No encontrado" }, { status: 404 });
      }
      throw error;
    }
    return NextResponse.json({ data });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT /api/admin/popups/[id] — actualizar popup
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(POPUP_ROLES);
    const { id } = await params;
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
      .update({
        title: parsed.title ?? null,
        body: parsed.body ?? null,
        image_url: parsed.image_url ?? null,
        buttons: parsed.buttons,
        pages: parsed.pages,
        starts_at: parsed.starts_at,
        ends_at: parsed.ends_at,
        priority: parsed.priority,
        status: parsed.status,
      } as any)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ data });
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
      { error: error.message || "Error al actualizar popup" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/popups/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(POPUP_ROLES);
    const { id } = await params;
    const supabase = createAdminClient();

    // Borrar imagen del bucket si existe
    const { data: existing } = await supabase
      .from("popups" as any)
      .select("image_url")
      .eq("id", id)
      .single();

    const url = (existing as any)?.image_url as string | null | undefined;
    if (url) {
      try {
        const u = new URL(url);
        const path = u.pathname.split("/popups/").pop();
        if (path) {
          await supabase.storage.from("popups").remove([path]);
        }
      } catch {
        /* ignore */
      }
    }

    const { error } = await supabase.from("popups" as any).delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
