import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// GET /api/eventos — Listado público de eventos
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const db = supabase as any;

    const { searchParams } = new URL(request.url);
    const tab = searchParams.get("tab") || "proximos";

    const now = new Date().toISOString();

    let query = db
      .from("eventos")
      .select(`
        id, titulo, slug, descripcion_corta, imagen_url,
        lugar, fecha_inicio, fecha_fin, capacidad_total,
        estado, es_gratuito, requiere_registro, created_at
      `)
      .eq("estado", "publicado");

    if (tab === "proximos") {
      query = query.gte("fecha_inicio", now).order("fecha_inicio", { ascending: true });
    } else {
      query = query.lt("fecha_inicio", now).order("fecha_inicio", { ascending: false });
    }

    const { data: eventos, error } = await query;

    if (error) {
      console.error("Error fetching eventos:", error);
      return NextResponse.json({ error: "Error al obtener eventos" }, { status: 500 });
    }

    // Get minimum price per event from active lots
    const eventosConPrecio = await Promise.all(
      (eventos || []).map(async (evento: any) => {
        const { data: tipos } = await db
          .from("tipo_entradas")
          .select("id, precio")
          .eq("evento_id", evento.id)
          .eq("activo", true);

        let precioMinimo: number | null = null;
        if (tipos && tipos.length > 0 && !evento.es_gratuito) {
          // Check active lots for minimum price
          for (const tipo of tipos) {
            const { data: lotes } = await db
              .from("lotes_entrada")
              .select("precio")
              .eq("tipo_entrada_id", tipo.id)
              .eq("estado", "activo");

            if (lotes && lotes.length > 0) {
              const minLote = Math.min(...lotes.map((l: any) => l.precio));
              if (precioMinimo === null || minLote < precioMinimo) {
                precioMinimo = minLote;
              }
            } else {
              // Use base price from tipo_entrada
              if (precioMinimo === null || tipo.precio < precioMinimo) {
                precioMinimo = tipo.precio;
              }
            }
          }
        }

        // Count sold tickets
        const { count: entradasVendidas } = await db
          .from("entradas")
          .select("id", { count: "exact", head: true })
          .eq("evento_id", evento.id)
          .in("estado", ["pagada", "usada"]);

        return {
          ...evento,
          precio_minimo: precioMinimo,
          entradas_vendidas: entradasVendidas || 0,
        };
      })
    );

    return NextResponse.json(eventosConPrecio);
  } catch (error) {
    console.error("Error en /api/eventos:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
