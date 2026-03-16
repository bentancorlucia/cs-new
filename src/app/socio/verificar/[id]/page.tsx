import type { Metadata } from "next";
import VerificarSocioPage from "./verificar-client";

export const metadata: Metadata = {
  title: "Verificación de Socio — Club Seminario",
  description:
    "Verificación de membresía de socio del Club Seminario de Montevideo.",
};

export default function Page() {
  return <VerificarSocioPage />;
}
