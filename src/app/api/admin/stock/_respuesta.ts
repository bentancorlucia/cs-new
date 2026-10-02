import { NextResponse } from "next/server";
import { z } from "zod";
import { mensajeError } from "@/lib/contabilidad/formato";

/** Respuesta de error uniforme para las APIs de stock (los mensajes de la base ya están en español). */
export function respuestaError(error: unknown, porDefecto = "Error"): NextResponse {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "Datos inválidos", details: error.issues },
      { status: 400 }
    );
  }
  const e = error as { message?: string; code?: string } | null;
  const msg = e?.message ?? porDefecto;
  if (msg.startsWith("No autorizado") || e?.code === "42501") {
    return NextResponse.json({ error: e?.code === "42501" ? mensajeError(e) : msg }, { status: 403 });
  }
  // Errores de reglas de la base (RAISE EXCEPTION): conflicto con el estado actual
  const status = e?.code === "P0001" || e?.code === "23514" || e?.code === "23505" || e?.code === "23503" ? 409 : 500;
  return NextResponse.json({ error: mensajeError(e) }, { status });
}
