import { Metadata } from "next";
import { SportPage } from "@/components/shared/sport-page";

export const metadata: Metadata = {
  title: "Hockey — Club Seminario",
  description:
    "Hockey y Mami Hockey del Club Seminario. Horarios, categorías y contacto.",
};

export default function HockeyPage() {
  return (
    <SportPage
      title="Hockey"
      description="Esfuerzo y compromiso en la cancha. Hockey competitivo y recreativo en Parque Loyola."
      heroImage="/images/deportes/Hockey.jpg"
      categories={[
        {
          name: "Hockey",
          description:
            "Espacio para ex alumnos que disfrutan del deporte y quieren seguir aprendiendo, priorizando el esfuerzo y el compromiso.",
          schedule: "Martes y jueves de 19:30 a 22:30",
          location: "Parque Loyola",
          contact: { name: "Lola Delafond", phone: "091 878 717" },
          image: "/images/deportes/Hockey.jpg",
        },
        {
          name: "Mami Hockey",
          description:
            "Práctica recreativa y competitiva con desarrollo del espíritu de equipo. Compiten en varias categorías del Torneo LID Mami Hockey.",
          schedule: "Lunes y miércoles de 20:30 a 22:00",
          location: "Parque Loyola",
          contact: { name: "Alejandra Castro", phone: "094 274 524" },
          image: "/images/deportes/MamiHockey.jpg",
        },
      ]}
    />
  );
}
