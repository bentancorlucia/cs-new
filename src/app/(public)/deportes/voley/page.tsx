import { Metadata } from "next";
import { SportPage } from "@/components/shared/sport-page";

export const metadata: Metadata = {
  title: "Vóleibol — Club Seminario",
  description:
    "Papi Volley y Mami Volley del Club Seminario. Horarios y contacto en el Polideportivo Gonzaga.",
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
            "Una oportunidad de descubrir un nuevo deporte, con un gran grupo humano que busca aprender y divertirse.",
          schedule: "Martes y jueves de 21:00 a 22:00",
          location: "Polideportivo Gonzaga",
          contact: { name: "Rodrigo Ripa", phone: "099 743 206" },
          image: "/images/deportes/Papivolley.jpeg",
        },
        {
          name: "Mami Volley",
          description:
            "Fundado hace más de 20 años como un espacio para aprender vóleibol mientras se construyen amistades. Compiten en ADIC con partidos los sábados.",
          schedule: "Lunes y miércoles de 19:00 a 21:00",
          location: "Polideportivo Gonzaga",
          contact: { name: "Valeria del Portillo", phone: "099 503 239" },
          image: "/images/deportes/MamiVolley.jpg",
        },
      ]}
    />
  );
}
