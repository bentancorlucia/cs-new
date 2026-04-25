import { Metadata } from "next";
import { QuienesSomosClient } from "./quienes-somos-client";

export const metadata: Metadata = {
  title: "Quiénes Somos",
  description:
    "Historia, misión, visión y valores del Club Seminario, club deportivo, social y cultural de la comunidad jesuita en Uruguay. Fundado el 13 de mayo de 2010, con más de 1.000 socios compitiendo en 22 categorías.",
  alternates: { canonical: "/club/quienes-somos" },
  openGraph: {
    title: "Quiénes Somos — Club Seminario",
    description:
      "Historia, misión, visión y valores del Club Seminario. Más de 1.000 socios compitiendo en 22 categorías.",
    url: "/club/quienes-somos",
  },
};

export default function QuienesSomosPage() {
  return <QuienesSomosClient />;
}
