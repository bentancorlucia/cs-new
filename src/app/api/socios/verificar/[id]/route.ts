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

  // Look up the profile to get avatar and basic info
  const { data: perfil, error: perfilError } = await supabase
    .from("perfiles")
    .select("nombre, apellido, cedula, es_socio, avatar_url, padron_socio_id")
    .eq("id", id)
    .eq("es_socio", true)
    .single();

  if (perfilError || !perfil) {
    return NextResponse.json(
      { error: "Socio no encontrado" },
      { status: 404 }
    );
  }

  // Get padron info if linked
  let estado: "activo" | "inactivo" = "inactivo";
  if (perfil.padron_socio_id) {
    const { data: padron } = await supabase
      .from("padron_socios")
      .select("activo")
      .eq("id", perfil.padron_socio_id)
      .single();

    if (padron?.activo) {
      estado = "activo";
    }
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

  // Fetch active disciplines from padron_disciplinas
  let disciplinaNames: string[] = [];
  if (perfil.padron_socio_id) {
    const { data: disciplinas } = await supabase
      .from("padron_disciplinas")
      .select("disciplinas(nombre)")
      .eq("padron_socio_id", perfil.padron_socio_id)
      .eq("activa", true);

    disciplinaNames = disciplinas
      ?.map((d: Record<string, unknown>) => {
        const disc = d.disciplinas as { nombre: string } | null;
        return disc?.nombre;
      })
      .filter((n): n is string => !!n) ?? [];
  }

  return NextResponse.json({
    nombre: perfil.nombre,
    apellido: perfil.apellido,
    cedula_masked: cedulaMasked,
    numero_socio: null,
    estado,
    avatar_url: perfil.avatar_url,
    disciplinas: disciplinaNames,
  });
}
