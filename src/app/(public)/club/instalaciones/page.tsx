import { Metadata } from "next";
import { InstalacionesClient } from "./instalaciones-client";

export const metadata: Metadata = {
  title: "Instalaciones — Club Seminario",
  description:
    "Instalaciones deportivas del Club Seminario. Parque CUPRA, Polideportivo Gonzaga y Parque Loyola.",
};

export default function InstalacionesPage() {
  return <InstalacionesClient />;
}
