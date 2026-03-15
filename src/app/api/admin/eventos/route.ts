import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { z } from "zod";

const eventoSchema = z.object({
  titulo: z.string().min(1, "El título es obligatorio").max(200),
  slug: z.string().min(1).max(200),
  descripcion: z.string().optional(),
  descripcion_corta: z.string().max(300).optional(),
  imagen_url: z.string().url().optional().or(z.literal("")),
  lugar: z.string().max(200),
  direccion: z.string().optional(),
  fecha_inicio: z.string().min(1, "La fecha es obligatoria"),
  fecha_fin: z.string().optional().or(z.literal("")),
  capacidad_total: z.number().int().positive().optional().nullable(),
  es_gratuito: z.boolean().default(false),
  requiere_registro: z.boolean().default(true),
  estado: z.enum(["borrador", "publicado", "agotado", "finalizado", "cancelado"]).optional(),
});

// GET /api/admin/eventos — Listar todos los eventos (admin)
export async function GET() {
  try {
    const supabase = await createServerClient();
    const db = supabase as any;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { data: eventos, error } = await db
      .from("eventos")
      .select("*")
      .order("fecha_inicio", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Error al obtener eventos" }, { status: 500 });
    }

    // Enrich with ticket counts and revenue
    const eventosEnriquecidos = await Promise.all(
      (eventos || []).map(async (evento: any) => {
        const { count: totalVendidas } = await db
          .from("entradas")
          .select("id", { count: "exact", head: true })
          .eq("evento_id", evento.id)
          .in("estado", ["pagada", "usada"]);

        const { data: entradasPagadas } = await db
          .from("entradas")
          .select("precio_pagado")
          .eq("evento_id", evento.id)
          .in("estado", ["pagada", "usada"]);

        const recaudacion = (entradasPagadas || []).reduce(
          (sum: number, e: any) => sum + (e.precio_pagado || 0),
          0
        );

        return {
          ...evento,
          entradas_vendidas: totalVendidas || 0,
          recaudacion,
        };
      })
    );

    return NextResponse.json(eventosEnriquecidos);
  } catch (error) {
    console.error("Error en GET /api/admin/eventos:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

// POST /api/admin/eventos — Crear evento
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const db = supabase as any;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = eventoSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { data: evento, error } = await db
      .from("eventos")
      .insert({
        ...parsed.data,
        imagen_url: parsed.data.imagen_url || null,
        fecha_fin: parsed.data.fecha_fin || null,
        estado: parsed.data.estado || "borrador",
        creado_por: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating evento:", error);
      if (error.code === "23505") {
        return NextResponse.json({ error: "Ya existe un evento con ese slug" }, { status: 400 });
      }
      return NextResponse.json({ error: "Error al crear el evento" }, { status: 500 });
    }

    return NextResponse.json(evento, { status: 201 });
  } catch (error) {
    console.error("Error en POST /api/admin/eventos:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
