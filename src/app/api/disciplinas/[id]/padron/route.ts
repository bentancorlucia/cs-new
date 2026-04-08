import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/supabase/roles";

const SOCIOS_ROLES = ["super_admin", "secretaria"];

// GET /api/disciplinas/[id]/padron — socios de una disciplina
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(SOCIOS_ROLES);
    const { id } = await params;
    const disciplinaId = parseInt(id);
    if (isNaN(disciplinaId)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const activo = searchParams.get("activo");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    // Fetch discipline info
    const { data: disciplina, error: discError } = await supabase
      .from("disciplinas")
      .select("*")
      .eq("id", disciplinaId)
      .single();

    if (discError || !disciplina) {
      return NextResponse.json(
        { error: "Disciplina no encontrada" },
        { status: 404 }
      );
    }

    // Get socio IDs in this discipline
    let pdQuery = supabase
      .from("padron_disciplinas")
      .select("padron_socio_id, categoria, activa, fecha_ingreso")
      .eq("disciplina_id", disciplinaId);

    const { data: pdRows, error: pdError } = await pdQuery;

    if (pdError) {
      return NextResponse.json({ error: pdError.message }, { status: 500 });
    }

    const socioIds = pdRows?.map((r) => (r as Record<string, unknown>).padron_socio_id as number) || [];

    if (socioIds.length === 0) {
      return NextResponse.json({
        disciplina,
        socios: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      });
    }

    // Build map of padron_disciplinas info by socio_id
    const pdMap = new Map<number, { categoria: string | null; activa: boolean; fecha_ingreso: string }>();
    for (const row of pdRows || []) {
      const r = row as Record<string, unknown>;
      pdMap.set(r.padron_socio_id as number, {
        categoria: r.categoria as string | null,
        activa: r.activa as boolean,
        fecha_ingreso: r.fecha_ingreso as string,
      });
    }

    // Fetch socios with filters
    let query = supabase
      .from("padron_socios")
      .select("*", { count: "exact" })
      .in("id", socioIds);

    if (search) {
      const s = search.replace(/%/g, "\\%").replace(/_/g, "\\_");
      query = query.or(
        `nombre.ilike.%${s}%,apellido.ilike.%${s}%,cedula.ilike.%${s}%`
      );
    }

    if (activo === "true") {
      query = query.eq("activo", true);
    } else if (activo === "false") {
      query = query.eq("activo", false);
    }

    query = query.order("apellido", { ascending: true });
    query = query.range(offset, offset + limit - 1);

    const { data: socios, error: sociosError, count } = await query;

    if (sociosError) {
      return NextResponse.json({ error: sociosError.message }, { status: 500 });
    }

    // Enrich socios with discipline-specific data
    const enriched = (socios || []).map((socio) => {
      const s = socio as Record<string, unknown>;
      const pd = pdMap.get(s.id as number);
      return {
        ...s,
        pd_categoria: pd?.categoria || null,
        pd_activa: pd?.activa ?? true,
        pd_fecha_ingreso: pd?.fecha_ingreso || null,
      };
    });

    return NextResponse.json({
      disciplina,
      socios: enriched,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "No autorizado") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
