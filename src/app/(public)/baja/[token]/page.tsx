import type { Metadata } from "next";
import { verificarTokenBaja } from "@/lib/comunicaciones/baja";
import { createComunicacionesAdminClient } from "@/lib/comunicaciones/server";
import { BajaConfirmacion } from "./baja-confirmacion";

export const metadata: Metadata = {
  title: "Dejar de recibir correos | Club Seminario",
  robots: { index: false, follow: false },
};

function enmascarar(email: string) {
  const [usuario, dominio] = email.split("@");
  if (!dominio) return email;
  return `${usuario.slice(0, 2)}${"•".repeat(Math.max(1, usuario.length - 2))}@${dominio}`;
}

// La página solo muestra; la baja se registra al confirmar (POST).
export default async function BajaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const mensajeId = verificarTokenBaja(token);
  let email: string | null = null;
  let yaDadaDeBaja = false;
  let personal = false;
  if (mensajeId) {
    const db = createComunicacionesAdminClient();
    const { data } = await db.from("mensajes").select("email, categoria").eq("id", mensajeId).maybeSingle();
    email = data?.email ?? null;
    personal = data?.categoria === "personal";
    if (email) {
      const { data: s } = await db.rpc("suprimido", { p_email: email, p_categoria: personal ? "personal" : "difusion" });
      yaDadaDeBaja = Boolean(s);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16 sm:py-24">
      <BajaConfirmacion
        token={token}
        valido={Boolean(email)}
        email={email ? enmascarar(email) : null}
        yaDadaDeBaja={yaDadaDeBaja}
        personal={personal}
      />
    </div>
  );
}
