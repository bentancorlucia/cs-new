import { Metadata } from "next";
import { BeneficiosClient } from "./beneficios-client";

export const metadata: Metadata = {
  title: "Beneficios para Socios",
  description:
    "Beneficios y descuentos exclusivos para socios del Club Seminario: del 5% al 50% en gastronomía, salud, indumentaria, educación y más comercios adheridos.",
  alternates: { canonical: "/beneficios" },
  openGraph: {
    title: "Beneficios para Socios — Club Seminario",
    description:
      "Descuentos exclusivos del 5% al 50% en comercios adheridos para socios del Club.",
    url: "/beneficios",
  },
};

export default function BeneficiosPage() {
  return <BeneficiosClient />;
}
