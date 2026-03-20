import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";

const TIENDA_ROLES = ["super_admin", "tienda"];
const MAX_IMAGES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

// GET /api/admin/productos/[id]/imagenes — list images for a product
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("producto_imagenes")
      .select("*")
      .eq("producto_id", parseInt(id))
      .order("orden");

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/admin/productos/[id]/imagenes — upload image
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const productoId = parseInt(id);
    const supabase = await createServerClient();

    // Check product exists
    const { data: producto } = await supabase
      .from("productos")
      .select("id")
      .eq("id", productoId)
      .single();

    if (!producto) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    // Check current image count
    const { count } = await supabase
      .from("producto_imagenes")
      .select("id", { count: "exact", head: true })
      .eq("producto_id", productoId);

    if ((count || 0) >= MAX_IMAGES) {
      return NextResponse.json(
        { error: `Máximo ${MAX_IMAGES} imágenes por producto` },
        { status: 400 }
      );
    }

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

    // Upload to Supabase Storage
    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `${productoId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("productos")
      .upload(fileName, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from("productos")
      .getPublicUrl(fileName);

    // Determine order and if it should be principal
    const isFirst = (count || 0) === 0;
    const orden = (count || 0) + 1;

    const { data: imagen, error: insertError } = await (supabase as any)
      .from("producto_imagenes")
      .insert({
        producto_id: productoId,
        url: urlData.publicUrl,
        alt_text: file.name.replace(/\.[^.]+$/, ""),
        orden,
        es_principal: isFirst,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({ data: imagen }, { status: 201 });
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

// PUT /api/admin/productos/[id]/imagenes — update image (set as cover, reorder)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const productoId = parseInt(id);
    const supabase = await createServerClient();
    const body = await request.json();

    // Set cover image
    if (body.action === "set_principal" && body.imagen_id) {
      // Remove principal from all
      await (supabase as any)
        .from("producto_imagenes")
        .update({ es_principal: false })
        .eq("producto_id", productoId);

      // Set new principal
      const { error } = await (supabase as any)
        .from("producto_imagenes")
        .update({ es_principal: true })
        .eq("id", body.imagen_id)
        .eq("producto_id", productoId);

      if (error) throw error;

      return NextResponse.json({ success: true });
    }

    // Set focal point
    if (body.action === "set_focal_point" && body.imagen_id && body.focal_point) {
      const { error } = await (supabase as any)
        .from("producto_imagenes")
        .update({ focal_point: body.focal_point })
        .eq("id", body.imagen_id)
        .eq("producto_id", productoId);

      if (error) throw error;

      return NextResponse.json({ success: true });
    }

    // Reorder images
    if (body.action === "reorder" && Array.isArray(body.orden)) {
      for (let i = 0; i < body.orden.length; i++) {
        await (supabase as any)
          .from("producto_imagenes")
          .update({ orden: i + 1 })
          .eq("id", body.orden[i])
          .eq("producto_id", productoId);
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/admin/productos/[id]/imagenes — delete image
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(TIENDA_ROLES);
    const { id } = await params;
    const productoId = parseInt(id);
    const supabase = await createServerClient();

    const { searchParams } = new URL(request.url);
    const imagenId = searchParams.get("imagen_id");

    if (!imagenId) {
      return NextResponse.json({ error: "imagen_id requerido" }, { status: 400 });
    }

    // Get image to delete from storage
    const { data: imagen } = await (supabase as any)
      .from("producto_imagenes")
      .select("*")
      .eq("id", parseInt(imagenId))
      .eq("producto_id", productoId)
      .single();

    if (!imagen) {
      return NextResponse.json({ error: "Imagen no encontrada" }, { status: 404 });
    }

    // Extract storage path from URL
    const url = new URL(imagen.url);
    const storagePath = url.pathname.split("/productos/").pop();
    if (storagePath) {
      await supabase.storage.from("productos").remove([storagePath]);
    }

    // Delete from DB
    const { error } = await supabase
      .from("producto_imagenes")
      .delete()
      .eq("id", parseInt(imagenId));

    if (error) throw error;

    // If deleted was principal, set first remaining as principal
    if (imagen.es_principal) {
      const { data: remaining } = await (supabase as any)
        .from("producto_imagenes")
        .select("id")
        .eq("producto_id", productoId)
        .order("orden")
        .limit(1);

      if (remaining && remaining.length > 0) {
        await (supabase as any)
          .from("producto_imagenes")
          .update({ es_principal: true })
          .eq("id", remaining[0].id);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
