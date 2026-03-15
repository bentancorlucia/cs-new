import { Metadata } from "next";
import { SociosClient } from "./socios-client";

export const metadata: Metadata = {
  title: "Socios — Club Seminario",
  description:
    "Hacete socio del Club Seminario. Socio Colaborador y Deportivo. Beneficios y descuentos exclusivos del 5% al 50%.",
};

export default function SociosPage() {
  return <SociosClient />;
}
