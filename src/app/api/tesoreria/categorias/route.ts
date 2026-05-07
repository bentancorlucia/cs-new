import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/roles";

const ROLES = ["super_admin", "tesorero"];

const categoriaSchema = z.object({
  nombre: z.string().min(1).max(100),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "Slug inválido"),
  tipo: z.enum(["ingreso", "egreso"]),
  padre_id: z.number().positive().nullable().optional(),
  color: z.string().max(7).nullable().optional(),
  icono: z.string().max(50).nullable().optional(),
  modulo: z.string().nullable().optional(),
  orden: z.number().default(0),
});

export async function GET() {
  try {
    await requireRole(ROLES);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("categorias_financieras")
    .select("*")
    .order("tipo", { ascending: true })
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categorias: data });
}

export async function POST(req: NextRequest) {
  try {
    await requireRole(ROLES);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const body = await req.json();
  const parsed = categoriaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("categorias_financieras")
    .insert({ ...parsed.data, activa: true })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ categoria: data });
}
