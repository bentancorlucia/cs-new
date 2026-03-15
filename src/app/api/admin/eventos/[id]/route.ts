import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { z } from "zod";

const updateEventoSchema = z.object({
  titulo: z.string().min(1).max(200).optional(),
  slug: z.string().min(1).max(200).optional(),
  descripcion: z.string().optional(),
  descripcion_corta: z.string().max(300).optional(),
  imagen_url: z.string().optional().nullable(),
  lugar: z.string().max(200).optional(),
  direccion: z.string().optional(),
  fecha_inicio: z.string().optional(),
  fecha_fin: z.string().optional().nullable(),
  capacidad_total: z.number().int().positive().optional().nullable(),
  es_gratuito: z.boolean().optional(),
  requiere_registro: z.boolean().optional(),
  estado: z.enum(["borrador", "publicado", "agotado", "finalizado", "cancelado"]).optional(),
});

// GET /api/admin/eventos/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerClient();
    const db = supabase as any;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { data: evento, error } = await db
      .from("eventos")
      .select("*")
      .eq("id", Number(id))
      .single();

    if (error || !evento) {
      return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
    }

    // Fetch ticket types with lots
    const { data: tipos } = await db
      .from("tipo_entradas")
      .select("*")
      .eq("evento_id", evento.id)
      .order("orden");

    const tiposConLotes = await Promise.all(
      (tipos || []).map(async (tipo: any) => {
        const { data: lotes } = await db
          .from("lotes_entrada")
          .select("*")
          .eq("tipo_entrada_id", tipo.id)
          .order("orden");

        return { ...tipo, lotes: lotes || [] };
      })
    );

    return NextResponse.json({ ...evento, tipo_entradas: tiposConLotes });
  } catch (error) {
    console.error("Error en GET /api/admin/eventos/[id]:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

// PUT /api/admin/eventos/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerClient();
    const db = supabase as any;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const parsed = updateEventoSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { data: evento, error } = await db
      .from("eventos")
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("id", Number(id))
      .select()
      .single();

    if (error) {
      console.error("Error updating evento:", error);
      return NextResponse.json({ error: "Error al actualizar el evento" }, { status: 500 });
    }

    return NextResponse.json(evento);
  } catch (error) {
    console.error("Error en PUT /api/admin/eventos/[id]:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
