import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { data: perfil, error } = await supabase
    .from("perfiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get disciplinas if socio
  let disciplinas: { nombre: string; categoria: string | null }[] = [];
  if (perfil.es_socio) {
    const { data } = await supabase
      .from("perfil_disciplinas")
      .select("categoria, disciplinas(nombre)")
      .eq("perfil_id", user.id)
      .eq("activa", true);

    disciplinas =
      (data as unknown as { categoria: string | null; disciplinas: { nombre: string } | null }[])?.map(
        (d) => ({
          nombre: d.disciplinas?.nombre ?? "",
          categoria: d.categoria,
        })
      ) ?? [];
  }

  // Get roles
  const { data: rolesData } = await supabase
    .from("perfil_roles")
    .select("roles(nombre)")
    .eq("perfil_id", user.id);

  const roles =
    (rolesData as unknown as { roles: { nombre: string } | null }[])
      ?.map((r) => r.roles?.nombre)
      .filter(Boolean) ?? [];

  return NextResponse.json({
    ...perfil,
    email: user.email,
    disciplinas,
    roles,
  });
}

export async function PUT(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json();

  // Only allow updating safe fields
  const allowedFields: Record<string, unknown> = {};
  const safeKeys = ["nombre", "apellido", "telefono", "avatar_url"] as const;

  for (const key of safeKeys) {
    if (key in body) {
      allowedFields[key] = body[key];
    }
  }

  if (Object.keys(allowedFields).length === 0) {
    return NextResponse.json({ error: "Sin cambios" }, { status: 400 });
  }

  allowedFields.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("perfiles")
    .update(allowedFields)
    .eq("id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
