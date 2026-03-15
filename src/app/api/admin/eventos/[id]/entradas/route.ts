import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { z } from "zod";

// GET /api/admin/eventos/[id]/entradas — Listado de entradas de un evento
export async function GET(
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

    const { searchParams } = new URL(request.url);
    const estado = searchParams.get("estado");
    const tipoId = searchParams.get("tipo_entrada_id");
    const loteId = searchParams.get("lote_id");

    let query = db
      .from("entradas")
      .select(`
        *,
        tipo_entradas(nombre),
        lotes_entrada(nombre)
      `)
      .eq("evento_id", Number(eventoId))
      .order("created_at", { ascending: false });

    if (estado) query = query.eq("estado", estado);
    if (tipoId) query = query.eq("tipo_entrada_id", Number(tipoId));
    if (loteId) query = query.eq("lote_id", Number(loteId));

    const { data: entradas, error } = await query;

    if (error) {
      return NextResponse.json({ error: "Error al obtener entradas" }, { status: 500 });
    }

    // Stats
    const total = (entradas || []).length;
    const pagadas = (entradas || []).filter((e: any) => e.estado === "pagada").length;
    const usadas = (entradas || []).filter((e: any) => e.estado === "usada").length;
    const canceladas = (entradas || []).filter((e: any) => e.estado === "cancelada" || e.estado === "reembolsada").length;
    const recaudacion = (entradas || []).reduce(
      (sum: number, e: any) =>
        ["pagada", "usada"].includes(e.estado) ? sum + (e.precio_pagado || 0) : sum,
      0
    );

    return NextResponse.json({
      entradas: entradas || [],
      stats: { total, pagadas, usadas, canceladas, recaudacion },
    });
  } catch (error) {
    console.error("Error en GET entradas:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}

const ventaManualSchema = z.object({
  tipo_entrada_id: z.number().int().positive(),
  lote_id: z.number().int().positive().optional(),
  nombre_asistente: z.string().min(1),
  cedula_asistente: z.string().optional(),
  email_asistente: z.string().email().optional(),
  metodo_pago: z.enum(["efectivo", "cortesia"]),
  precio_pagado: z.number().min(0),
  cantidad: z.number().int().min(1).max(10).default(1),
});

// POST /api/admin/eventos/[id]/entradas — Venta manual de entradas
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
    const parsed = ventaManualSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const {
      tipo_entrada_id, lote_id, nombre_asistente,
      cedula_asistente, email_asistente, metodo_pago,
      precio_pagado, cantidad,
    } = parsed.data;

    const entradasData = Array.from({ length: cantidad }, () => ({
      evento_id: Number(eventoId),
      tipo_entrada_id,
      lote_id: lote_id || null,
      nombre_asistente,
      cedula_asistente: cedula_asistente || null,
      email_asistente: email_asistente || null,
      precio_pagado,
      estado: "pagada",
      metodo_pago,
    }));

    const { data: entradas, error } = await db
      .from("entradas")
      .insert(entradasData)
      .select("id, codigo");

    if (error) {
      console.error("Error creating manual entries:", error);
      return NextResponse.json({ error: "Error al crear entradas" }, { status: 500 });
    }

    // Update lot sold count if lote_id provided
    if (lote_id) {
      const { data: lote } = await db
        .from("lotes_entrada")
        .select("vendidas, cantidad")
        .eq("id", lote_id)
        .single();

      if (lote) {
        const newVendidas = (lote.vendidas || 0) + cantidad;
        await db
          .from("lotes_entrada")
          .update({
            vendidas: newVendidas,
            estado: newVendidas >= lote.cantidad ? "agotado" : undefined,
          })
          .eq("id", lote_id);
      }
    }

    return NextResponse.json({ entradas }, { status: 201 });
  } catch (error) {
    console.error("Error en POST entradas:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
