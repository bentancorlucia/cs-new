import { Metadata } from "next";
import { SportPage } from "@/components/shared/sport-page";

export const metadata: Metadata = {
  title: "Vóleibol",
  description:
    "Vóleibol en Club Seminario: Papi Volley y Mami Volley en el Polideportivo Gonzaga, Montevideo. Equipos para hombres y mujeres compitiendo en ADIC.",
  alternates: { canonical: "/deportes/voley" },
  openGraph: {
    title: "Vóleibol — Club Seminario",
    description:
      "Papi Volley y Mami Volley en el Polideportivo Gonzaga. Aprender, divertirse y competir en ADIC.",
    url: "/deportes/voley",
    images: [{ url: "/images/deportes/Papivolley.jpeg", width: 1200, height: 630 }],
  },
};

export default function VoleyPage() {
  return (
    <SportPage
      title="Vóleibol"
      description="Aprendé y divertite jugando vóleibol. Equipos para hombres y mujeres en el Polideportivo Gonzaga."
      heroImage="/images/deportes/Papivolley.jpeg"
      categories={[
        {
          name: "Papi Volley",
          description:
            "Una oportunidad de descubrir un nuevo deporte, con un gran grupo humano que busca aprender y divertirse. Un lindo proceso en el cual se comparten prácticas, juntadas y mucho más.",
          schedule: "Martes y jueves de 21:00 a 22:00",
          location: "Polideportivo Gonzaga",
          contact: { name: "Rodrigo Ripa", phone: "099 743 206" },
          image: "/images/deportes/Papivolley.jpeg",
        },
        {
          name: "Mami Volley",
          description:
            "MamiVolley se formó hace más de 20 años, como un espacio para aprender de un precioso deporte, compartiendo con un lindo grupo y cosechar amistades. Competimos en ADIC y los partidos son generalmente los sábados.",
          schedule: "Lunes y miércoles de 19:00 a 21:00",
          location: "Polideportivo Gonzaga",
          contact: { name: "Valeria del Portillo", phone: "099 503 239" },
          image: "/images/deportes/MamiVolley.jpg",
        },
      ]}
    />
  );
}
