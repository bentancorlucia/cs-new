import { Metadata } from "next";
import { SportPage } from "@/components/shared/sport-page";

export const metadata: Metadata = {
  title: "Fútbol — Club Seminario",
  description:
    "Fútbol femenino, masculino y mami fútbol del Club Seminario. 10 planteles en 7 categorías.",
};

export default function FutbolPage() {
  return (
    <SportPage
      title="Fútbol"
      description="La disciplina más grande del club. 10 planteles compitiendo en la Liga Universitaria de Deportes."
      heroImage="/images/deportes/futbol-masculino.jpg"
      categories={[
        {
          name: "Fútbol Femenino",
          description:
            "Dos planteles: A (categoría C de MGC) y B (categoría F). Enfoque en juego competitivo e integración del equipo.",
          schedule: "Lunes, martes y jueves de 19:00 a 20:30",
          location: "Parque CUPRA / Polideportivo Gonzaga",
          contact: { name: "Lucía Alvariza", phone: "095 732 333" },
          image: "/images/deportes/foto-futfem.webp",
        },
        {
          name: "Fútbol Masculino",
          description:
            "Liga Universitaria de Deportes en 7 categorías: Sub-14, Sub-16, Sub-18, Sub-21, Tercera, Segunda y Pre-Senior. 10 planteles para participación inclusiva.",
          schedule: "Varía según categoría",
          location: "Parque CUPRA",
          contact: { name: "Domingo Martinelli", phone: "099 613 671" },
          image: "/images/deportes/futbol-masculino.jpg",
        },
        {
          name: "Mami Fútbol",
          description:
            "Programa recreativo para mujeres adultas que buscan comunidad, desarrollo de habilidades y disfrute.",
          schedule: "Martes y jueves de 20:30 a 22:00",
          location: "Polideportivo Gonzaga",
          contact: { name: "Cecilia Capozzoli", phone: "099 152 362" },
          image: "/images/deportes/MamiFutbol.JPG",
        },
      ]}
    />
  );
}
