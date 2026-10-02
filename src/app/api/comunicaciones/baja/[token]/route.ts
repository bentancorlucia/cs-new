import { NextRequest, NextResponse } from "next/server";
import { verificarTokenBaja } from "@/lib/comunicaciones/baja";
import { createComunicacionesAdminClient } from "@/lib/comunicaciones/server";

// Baja en un clic (RFC 8058): los clientes de correo hacen POST a la URL
// del header List-Unsubscribe con "List-Unsubscribe=One-Click".
export async function POST(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const mensajeId = verificarTokenBaja(token);
  if (!mensajeId) {
    return NextResponse.json({ error: "Enlace inválido" }, { status: 400 });
  }
  const db = createComunicacionesAdminClient();
  const { error } = await db.rpc("registrar_baja", { p_mensaje: mensajeId, p_origen: "un_clic" });
  if (error) {
    return NextResponse.json({ error: "Enlace inválido" }, { status: 400 });
  }
  return new NextResponse(null, { status: 200 });
}

// Un GET (antivirus que abren los enlaces, o alguien que lo copia) no da
// de baja: lleva a la página de confirmación.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return NextResponse.redirect(new URL(`/baja/${encodeURIComponent(token)}`, request.url));
}
