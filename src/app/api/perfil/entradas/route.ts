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

  const { data, error } = await supabase
    .from("entradas")
    .select(
      `
      id, codigo, estado, precio_pagado, nombre_asistente,
      created_at, usado_at, qr_url,
      eventos(titulo, slug, imagen_url, fecha_inicio, lugar),
      tipo_entradas(nombre),
      lotes_entrada(nombre)
    `
    )
    .eq("perfil_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
