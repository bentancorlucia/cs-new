import { Metadata } from "next";
import { InstalacionesClient } from "./instalaciones-client";

export const metadata: Metadata = {
  title: "Instalaciones",
  description:
    "Parque CUPRA — el predio deportivo del Club Seminario en Cochabamba 2882, Montevideo.",
};

export default function InstalacionesPage() {
  return <InstalacionesClient />;
}
