import { Metadata } from "next";
import { HomeClient } from "./home-client";

export const metadata: Metadata = {
  title: {
    absolute: "Club Seminario — Club deportivo, social y cultural en Montevideo",
  },
  description:
    "Club Seminario: institución deportiva, social y cultural que une a la comunidad jesuita en Uruguay. Rugby, hockey, fútbol, handball, básquetbol, vóleibol y corredores. Más de 1.000 socios compitiendo en 22 categorías en Montevideo.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Club Seminario — Club deportivo, social y cultural en Montevideo",
    description:
      "Club deportivo, social y cultural de la comunidad jesuita en Uruguay. Rugby, hockey, fútbol, handball, básquetbol, vóleibol y corredores.",
    url: "/",
  },
};

export default function Home() {
  return <HomeClient />;
}
