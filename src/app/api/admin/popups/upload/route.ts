import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";

const POPUP_ROLES = ["super_admin", "secretaria"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

// POST /api/admin/popups/upload — subir imagen al bucket "popups"
export async function POST(request: NextRequest) {
  try {
    await requireRole(POPUP_ROLES);
    const supabase = await createServerClient();

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No se envió archivo" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Formato no permitido. Usa JPG, PNG, WebP o AVIF" },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "La imagen no puede superar 5MB" },
        { status: 400 }
      );
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `popup/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("popups")
      .upload(fileName, file, {
        contentType: file.type,
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from("popups")
      .getPublicUrl(fileName);

    return NextResponse.json({ url: urlData.publicUrl, path: fileName });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json(
      { error: error.message || "Error al subir imagen" },
      { status: 500 }
    );
  }
}
