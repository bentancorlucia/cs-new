import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use service role to bypass RLS — only exposes limited public fields
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Validate UUID format
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const { data: perfil, error } = await supabase
    .from("perfiles")
    .select("nombre, apellido, cedula, es_socio, numero_socio, estado_socio, avatar_url")
    .eq("id", id)
    .eq("es_socio", true)
    .single();

  if (error || !perfil) {
    return NextResponse.json(
      { error: "Socio no encontrado" },
      { status: 404 }
    );
  }

  // Mask cedula: show first 2 and last 1 digit
  let cedulaMasked: string | null = null;
  if (perfil.cedula) {
    const digits = perfil.cedula.replace(/\D/g, "");
    if (digits.length >= 4) {
      cedulaMasked =
        digits.slice(0, 2) + "•".repeat(digits.length - 3) + digits.slice(-1);
    }
  }

  // Fetch active disciplines
  const { data: disciplinas } = await supabase
    .from("perfil_disciplinas")
    .select("disciplinas(nombre)")
    .eq("perfil_id", id)
    .eq("activa", true);

  const disciplinaNames = disciplinas
    ?.map((d: Record<string, unknown>) => {
      const disc = d.disciplinas as { nombre: string } | null;
      return disc?.nombre;
    })
    .filter(Boolean) ?? [];

  return NextResponse.json({
    nombre: perfil.nombre,
    apellido: perfil.apellido,
    cedula_masked: cedulaMasked,
    numero_socio: perfil.numero_socio,
    estado: perfil.estado_socio,
    avatar_url: perfil.avatar_url,
    disciplinas: disciplinaNames,
  });
}
