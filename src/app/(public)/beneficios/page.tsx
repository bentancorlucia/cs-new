import { Metadata } from "next";
import { BeneficiosClient } from "./beneficios-client";

export const metadata: Metadata = {
  title: "Beneficios — Club Seminario",
  description:
    "Beneficios exclusivos para socios del Club Seminario. Descuentos del 5% al 50% en múltiples categorías.",
};

export default function BeneficiosPage() {
  return <BeneficiosClient />;
}
