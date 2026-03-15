import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { z } from "zod";

const loteSchema = z.object({
  nombre: z.string().min(1),
  precio: z.number().min(0),
  cantidad: z.number().int().positive(),
  fecha_inicio: z.string().min(1),
  fecha_fin: z.string().optional().nullable(),
  estado: z.enum(["pendiente", "activo", "agotado", "cerrado"]).default("pendiente"),
  orden: z.number().int().default(0),
});

const tipoEntradaSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  descripcion: z.string().optional(),
  precio: z.number().min(0),
  capacidad: z.number().int().positive().optional().nullable(),
  solo_socios: z.boolean().default(false),
  orden: z.number().int().default(0),
  activo: z.boolean().default(true),
  lotes: z.array(loteSchema).optional(),
});

// POST /api/admin/eventos/[id]/tipos-entrada — Crear tipo de entrada con lotes
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventoId } = await params;
    const supabase = await createServerClient();
    const db = supabase as any;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const parsed = tipoEntradaSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { lotes, ...tipoData } = parsed.data;

    // Create tipo_entrada
    const { data: tipo, error: tipoError } = await db
      .from("tipo_entradas")
      .insert({ ...tipoData, evento_id: Number(eventoId) })
      .select()
      .single();

    if (tipoError || !tipo) {
      console.error("Error creating tipo_entrada:", tipoError);
      return NextResponse.json({ error: "Error al crear tipo de entrada" }, { status: 500 });
    }

    // Create lots if provided
    if (lotes && lotes.length > 0) {
      const lotesData = lotes.map((l, i) => ({
        ...l,
        tipo_entrada_id: tipo.id,
        vendidas: 0,
        orden: l.orden || i,
        fecha_fin: l.fecha_fin || null,
      }));

      const { error: lotesError } = await db
        .from("lotes_entrada")
        .insert(lotesData);

      if (lotesError) {
        console.error("Error creating lotes:", lotesError);
      }
    }

    // Fetch complete tipo with lots
    const { data: tipoCompleto } = await db
      .from("tipo_entradas")
      .select("*")
      .eq("id", tipo.id)
      .single();

    const { data: lotesCreados } = await db
      .from("lotes_entrada")
      .select("*")
      .eq("tipo_entrada_id", tipo.id)
      .order("orden");

    return NextResponse.json(
      { ...tipoCompleto, lotes: lotesCreados || [] },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error en POST tipos-entrada:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

// DELETE /api/admin/eventos/[id]/tipos-entrada — Delete all tipos for an event (used when replacing)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventoId } = await params;
    const supabase = await createServerClient();
    const db = supabase as any;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    // Get all tipos for this event
    const { data: tipos } = await db
      .from("tipo_entradas")
      .select("id")
      .eq("evento_id", Number(eventoId));

    if (tipos && tipos.length > 0) {
      const tipoIds = tipos.map((t: any) => t.id);

      // Delete lotes first (FK constraint)
      await db
        .from("lotes_entrada")
        .delete()
        .in("tipo_entrada_id", tipoIds);

      // Delete tipos
      await db
        .from("tipo_entradas")
        .delete()
        .eq("evento_id", Number(eventoId));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error en DELETE tipos-entrada:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

// PUT /api/admin/eventos/[id]/tipos-entrada — Update tipo de entrada
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params;
    const supabase = await createServerClient();
    const db = supabase as any;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const { tipo_entrada_id, lotes, ...updateData } = body;

    if (!tipo_entrada_id) {
      return NextResponse.json({ error: "tipo_entrada_id es requerido" }, { status: 400 });
    }

    // Update tipo
    const { error: updateError } = await db
      .from("tipo_entradas")
      .update(updateData)
      .eq("id", tipo_entrada_id);

    if (updateError) {
      return NextResponse.json({ error: "Error al actualizar tipo de entrada" }, { status: 500 });
    }

    // Handle lots updates
    if (lotes && Array.isArray(lotes)) {
      for (const lote of lotes) {
        if (lote.id) {
          // Update existing lot
          const { id, ...loteUpdate } = lote;
          await db.from("lotes_entrada").update(loteUpdate).eq("id", id);
        } else {
          // Create new lot
          await db.from("lotes_entrada").insert({
            ...lote,
            tipo_entrada_id,
            vendidas: 0,
          });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error en PUT tipos-entrada:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
