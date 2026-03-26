import { Metadata } from "next";
import { HomeClient } from "./home-client";

export const metadata: Metadata = {
  title: "Inicio",
  description:
    "Club Seminario es una institución deportiva, social y cultural que une a la comunidad jesuita en Uruguay. Más de 1.000 socios compitiendo en 22 categorías.",
  openGraph: {
    title: "Inicio",
    description:
      "Club deportivo, social y cultural de la comunidad jesuita en Uruguay. Rugby, hockey, fútbol, handball, básquetbol, vóleibol y corredores.",
  },
};

export default function Home() {
  return <HomeClient />;
}
