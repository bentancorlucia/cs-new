import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// GET /api/eventos/[slug] — Detalle de evento con entradas disponibles
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const supabase = await createServerClient();
    const db = supabase as any;

    // Fetch event
    const { data: evento, error } = await db
      .from("eventos")
      .select("*")
      .eq("slug", slug)
      .eq("estado", "publicado")
      .single();

    if (error || !evento) {
      return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
    }

    // Fetch ticket types with active lots
    const { data: tiposEntrada } = await db
      .from("tipo_entradas")
      .select("*")
      .eq("evento_id", evento.id)
      .eq("activo", true)
      .order("orden");

    const now = new Date().toISOString();
    const tiposConLotes = await Promise.all(
      (tiposEntrada || []).map(async (tipo: any) => {
        // Get all lots for this type
        const { data: lotes } = await db
          .from("lotes_entrada")
          .select("*")
          .eq("tipo_entrada_id", tipo.id)
          .order("orden");

        // Find the active lot (date-based + status)
        const loteActivo = (lotes || []).find(
          (l: any) =>
            l.estado === "activo" &&
            l.fecha_inicio <= now &&
            (!l.fecha_fin || l.fecha_fin >= now)
        );

        // Count sold tickets for this type
        const { count: vendidas } = await db
          .from("entradas")
          .select("id", { count: "exact", head: true })
          .eq("tipo_entrada_id", tipo.id)
          .in("estado", ["pagada", "usada", "pendiente"]);

        return {
          ...tipo,
          lotes: lotes || [],
          lote_activo: loteActivo || null,
          vendidas: vendidas || 0,
          disponibles: loteActivo
            ? loteActivo.cantidad - loteActivo.vendidas
            : 0,
        };
      })
    );

    // Count total sold
    const { count: totalVendidas } = await db
      .from("entradas")
      .select("id", { count: "exact", head: true })
      .eq("evento_id", evento.id)
      .in("estado", ["pagada", "usada"]);

    return NextResponse.json({
      ...evento,
      tipo_entradas: tiposConLotes,
      total_vendidas: totalVendidas || 0,
    });
  } catch (error) {
    console.error("Error en /api/eventos/[slug]:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
