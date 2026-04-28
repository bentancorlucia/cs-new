import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
// POST /api/checkout/comprobante — Subir comprobante de transferencia
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const db = createAdminClient();

    // 1. Auth
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Debés iniciar sesión" },
        { status: 401 }
      );
    }

    // 2. Parse form data
    const formData = await request.formData();
    const archivo = formData.get("archivo") as File | null;
    const pedidoId = formData.get("pedido_id") as string | null;

    if (!archivo || !pedidoId) {
      return NextResponse.json(
        { error: "Archivo y pedido_id son requeridos" },
        { status: 400 }
      );
    }

    const pedidoIdNum = parseInt(pedidoId);
    if (isNaN(pedidoIdNum)) {
      return NextResponse.json(
        { error: "pedido_id inválido" },
        { status: 400 }
      );
    }

    // 3. Validate file type & size
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];
    if (!allowedTypes.includes(archivo.type)) {
      return NextResponse.json(
        { error: "Formato no permitido. Usá JPG, PNG, WebP o PDF." },
        { status: 400 }
      );
    }

    if (archivo.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "El archivo no puede superar 10MB" },
        { status: 400 }
      );
    }

    // 4. Validate pedido belongs to user and is in pendiente_verificacion
    const { data: pedido } = await db
      .from("pedidos")
      .select("id, perfil_id, estado, metodo_pago")
      .eq("id", pedidoIdNum)
      .single();

    if (!pedido) {
      return NextResponse.json(
        { error: "Pedido no encontrado" },
        { status: 404 }
      );
    }

    if (pedido.perfil_id !== user.id) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 403 }
      );
    }

    if (pedido.estado !== "pendiente_verificacion") {
      return NextResponse.json(
        { error: "Este pedido no acepta comprobantes" },
        { status: 400 }
      );
    }

    // 5. Upload to storage
    const ext = archivo.name.split(".").pop() || "jpg";
    const fileName = `${user.id}/${pedidoIdNum}_${Date.now()}.${ext}`;

    const arrayBuffer = await archivo.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await db.storage
      .from("comprobantes")
      .upload(fileName, buffer, {
        contentType: archivo.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Error al subir comprobante:", uploadError);
      return NextResponse.json(
        { error: "Error al subir el archivo" },
        { status: 500 }
      );
    }

    // 6. Get signed URL (valid 1 year)
    const { data: urlData } = await db.storage
      .from("comprobantes")
      .createSignedUrl(fileName, 60 * 60 * 24 * 365);

    const url = urlData?.signedUrl || "";

    // 7. Determine tipo
    const tipo = archivo.type === "application/pdf" ? "pdf" : "imagen";

    // 8. Insert comprobante record FIRST so it's persisted even if OCR fails or times out
    const { data: comprobante, error: compError } = await db
      .from("comprobantes")
      .insert({
        pedido_id: pedidoIdNum,
        url,
        nombre_archivo: archivo.name,
        tipo,
        tamano_bytes: archivo.size,
        datos_extraidos: null,
        estado: "pendiente",
      })
      .select("id")
      .single();

    if (compError) {
      console.error("Error al crear comprobante:", compError);
      return NextResponse.json(
        { error: "Error al registrar el comprobante" },
        { status: 500 }
      );
    }

    // 9. Run OCR best-effort and update record. OCR can be slow (tesseract.js),
    // so failures here must not break the upload.
    try {
      const { extractComprobanteData } = await import(
        "@/lib/comprobante/extract"
      );
      const datos_extraidos = await extractComprobanteData(
        Buffer.from(arrayBuffer),
        tipo
      );
      if (datos_extraidos) {
        await db
          .from("comprobantes")
          .update({ datos_extraidos: datos_extraidos as any })
          .eq("id", comprobante.id);
      }
    } catch (ocrError) {
      console.error("Error en extracción del comprobante:", ocrError);
    }

    return NextResponse.json({
      comprobante_id: comprobante.id,
      url,
    });
  } catch (error) {
    console.error("Error en upload comprobante:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
