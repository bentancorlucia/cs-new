import { Metadata } from "next";
import { DirectivaClient } from "./directiva-client";

export const metadata: Metadata = {
  title: "Comisión Directiva",
  description:
    "Conocé a la Comisión Directiva y Comisión Fiscal del Club Seminario. Las personas que lideran y supervisan la gestión del club.",
  alternates: { canonical: "/club/directiva" },
  openGraph: {
    title: "Comisión Directiva — Club Seminario",
    description: "Comisión Directiva y Comisión Fiscal del Club Seminario.",
    url: "/club/directiva",
  },
};

export default function DirectivaPage() {
  return <DirectivaClient />;
}
