import { Metadata } from "next";
import { MemoriasClient } from "./memorias-client";

export const metadata: Metadata = {
  title: "Memorias Anuales",
  description:
    "Memorias anuales del Club Seminario (2014–2024). Informes anuales de gestión, actividades deportivas y avances institucionales del club.",
  alternates: { canonical: "/club/memorias" },
  openGraph: {
    title: "Memorias Anuales — Club Seminario",
    description:
      "Informes anuales del Club Seminario desde 2014 hasta hoy.",
    url: "/club/memorias",
  },
};

export default function MemoriasPage() {
  return <MemoriasClient />;
}
