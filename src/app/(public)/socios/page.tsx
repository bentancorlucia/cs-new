import { Metadata } from "next";
import { SociosClient } from "./socios-client";

export const metadata: Metadata = {
  title: "Hacete Socio",
  description:
    "Hacete socio del Club Seminario en Montevideo. Categorías Socio Colaborador y Socio Deportivo. Beneficios, descuentos exclusivos del 5% al 50% y acceso a las disciplinas del club.",
  alternates: { canonical: "/socios" },
  openGraph: {
    title: "Hacete Socio — Club Seminario",
    description:
      "Categorías Socio Colaborador y Deportivo. Sumate a la comunidad del Club Seminario.",
    url: "/socios",
  },
};

export default function SociosPage() {
  return <SociosClient />;
}
