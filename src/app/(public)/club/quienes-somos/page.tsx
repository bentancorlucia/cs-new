import { Metadata } from "next";
import { QuienesSomosClient } from "./quienes-somos-client";

export const metadata: Metadata = {
  title: "Quiénes Somos — Club Seminario",
  description:
    "Conocé la historia, misión, visión y valores del Club Seminario. Club deportivo, social y cultural de la comunidad jesuita en Uruguay, fundado en 2010.",
  openGraph: {
    title: "Quiénes Somos — Club Seminario",
    description:
      "Historia, misión, visión y valores del Club Seminario. Más de 1.000 socios compitiendo en 22 categorías.",
  },
};

export default function QuienesSomosPage() {
  return <QuienesSomosClient />;
}
