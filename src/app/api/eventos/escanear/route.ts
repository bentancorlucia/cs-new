import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/roles";
import { z } from "zod";

const escanearSchema = z.object({
  codigo: z.string().uuid(),
  evento_id: z.number().int().positive(),
});

// POST /api/eventos/escanear — Procesar escaneo de QR
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const db = supabase as any;

    // 1. Auth — requiere usuario logueado
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // 2. Validate body
    const body = await request.json();
    const parsed = escanearSchema.safeParse(body);

    if (!parsed.success) {
      // Si el código no es UUID, es un QR no válido
      await db.from("escaneos_entrada").insert({
        entrada_id: null,
        codigo_escaneado: body?.codigo || "invalid",
        evento_id: body?.evento_id || 0,
        resultado: "no_encontrado",
        escaneado_por: user.id,
        ip_address: request.headers.get("x-forwarded-for") || null,
      });

      return NextResponse.json({
        resultado: "no_encontrado",
        mensaje: "QR NO VÁLIDO",
        entrada: null,
      });
    }

    const { codigo, evento_id } = parsed.data;

    // 3. Buscar entrada por código UUID
    const { data: entrada } = await db
      .from("entradas")
      .select("id, codigo, evento_id, estado, usado_at, nombre_asistente, cedula_asistente, tipo_entrada_id, tipo_entradas(nombre), eventos(titulo)")
      .eq("codigo", codigo)
      .single();

    let resultado: "valido" | "ya_usado" | "no_encontrado" | "evento_incorrecto" | "cancelada";
    let mensaje: string;

    if (!entrada) {
      resultado = "no_encontrado";
      mensaje = "QR NO VÁLIDO";
    } else if (entrada.evento_id !== evento_id) {
      resultado = "evento_incorrecto";
      mensaje = "ENTRADA DE OTRO EVENTO";
    } else if (entrada.estado === "usada") {
      resultado = "ya_usado";
      const usadoAt = entrada.usado_at
        ? new Date(entrada.usado_at).toLocaleTimeString("es-UY", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";
      mensaje = `YA INGRESÓ${usadoAt ? ` a las ${usadoAt}` : ""}`;
    } else if (entrada.estado === "cancelada" || entrada.estado === "reembolsada") {
      resultado = "cancelada";
      mensaje = "ENTRADA CANCELADA";
    } else if (entrada.estado === "pagada") {
      // Válida — marcar como usada
      await db
        .from("entradas")
        .update({
          estado: "usada",
          usado_at: new Date().toISOString(),
          usado_por: user.id,
        })
        .eq("id", entrada.id);

      resultado = "valido";
      mensaje = "VÁLIDO";
    } else {
      // Estado pendiente u otro
      resultado = "no_encontrado";
      mensaje = "ENTRADA NO PAGADA";
    }

    // 4. Registrar escaneo (siempre, incluso fallidos)
    await db.from("escaneos_entrada").insert({
      entrada_id: entrada?.id || null,
      codigo_escaneado: codigo,
      evento_id,
      resultado,
      escaneado_por: user.id,
      ip_address: request.headers.get("x-forwarded-for") || null,
    });

    return NextResponse.json({
      resultado,
      mensaje,
      entrada: entrada
        ? {
            id: entrada.id,
            nombre_asistente: entrada.nombre_asistente,
            cedula_asistente: entrada.cedula_asistente,
            tipo_entrada: entrada.tipo_entradas?.nombre || null,
            codigo: entrada.codigo,
          }
        : null,
    });
  } catch (error) {
    console.error("Error en /api/eventos/escanear:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
