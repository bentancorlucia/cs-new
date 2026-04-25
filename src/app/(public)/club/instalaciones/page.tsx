import { Metadata } from "next";
import { InstalacionesClient } from "./instalaciones-client";

export const metadata: Metadata = {
  title: "Instalaciones",
  description:
    "Parque CUPRA, Polideportivo Gonzaga y Parque Loyola: las instalaciones del Club Seminario en Montevideo. Canchas, vestuarios y espacios sociales.",
  alternates: { canonical: "/club/instalaciones" },
  openGraph: {
    title: "Instalaciones — Club Seminario",
    description:
      "Parque CUPRA, Polideportivo Gonzaga y Parque Loyola — los predios del Club Seminario.",
    url: "/club/instalaciones",
  },
};

export default function InstalacionesPage() {
  return <InstalacionesClient />;
}
