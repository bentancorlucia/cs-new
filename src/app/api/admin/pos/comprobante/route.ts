import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, getCurrentUser } from "@/lib/supabase/roles";
import { extractComprobanteData } from "@/lib/comprobante/extract";

const TIENDA_ROLES = ["super_admin", "tienda"];

// POST /api/admin/pos/comprobante — Upload comprobante from POS (vendor)
export async function POST(request: NextRequest) {
  try {
    await requireRole(TIENDA_ROLES);
    const user = await getCurrentUser();
    const db = createAdminClient();

    // 1. Parse form data
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

    // 2. Validate file type & size
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

    // 3. Validate pedido exists, is POS, and is pendiente_verificacion
    const { data: pedido } = await db
      .from("pedidos")
      .select("id, tipo, estado")
      .eq("id", pedidoIdNum)
      .single();

    if (!pedido) {
      return NextResponse.json(
        { error: "Pedido no encontrado" },
        { status: 404 }
      );
    }

    if (pedido.estado !== "pendiente_verificacion") {
      return NextResponse.json(
        { error: "Este pedido no acepta comprobantes" },
        { status: 400 }
      );
    }

    // 4. Upload to storage
    const ext = archivo.name.split(".").pop() || "jpg";
    const fileName = `pos/${pedidoIdNum}_${Date.now()}.${ext}`;

    const arrayBuffer = await archivo.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await db.storage
      .from("comprobantes")
      .upload(fileName, buffer, {
        contentType: archivo.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Error al subir comprobante POS:", uploadError);
      return NextResponse.json(
        { error: "Error al subir el archivo" },
        { status: 500 }
      );
    }

    // 5. Get signed URL (valid 1 year)
    const { data: urlData } = await db.storage
      .from("comprobantes")
      .createSignedUrl(fileName, 60 * 60 * 24 * 365);

    const url = urlData?.signedUrl || "";

    // 6. Determine tipo
    const tipo = archivo.type === "application/pdf" ? "pdf" : "imagen";

    // 7. OCR — extract data from comprobante
    let datos_extraidos = null;
    try {
      datos_extraidos = await extractComprobanteData(
        Buffer.from(arrayBuffer),
        tipo as "imagen" | "pdf"
      );
    } catch (ocrError) {
      console.error("Error en OCR del comprobante POS:", ocrError);
    }

    // 8. Insert comprobante record
    const { data: comprobante, error: compError } = await db
      .from("comprobantes")
      .insert({
        pedido_id: pedidoIdNum,
        url,
        nombre_archivo: archivo.name,
        tipo,
        tamano_bytes: archivo.size,
        datos_extraidos: datos_extraidos as any,
        estado: "pendiente",
      })
      .select("id")
      .single();

    if (compError) {
      console.error("Error al crear comprobante POS:", compError);
      return NextResponse.json(
        { error: "Error al registrar el comprobante" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      comprobante_id: comprobante.id,
      url,
    });
  } catch (error: any) {
    if (error.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    console.error("Error en upload comprobante POS:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
