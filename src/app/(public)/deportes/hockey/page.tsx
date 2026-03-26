import { Metadata } from "next";
import { SportPage } from "@/components/shared/sport-page";

export const metadata: Metadata = {
  title: "Hockey",
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
            "Buscamos hacer propio el Ut Serviam poniendo nuestras mejores cualidades al servicio del equipo. Nuestro objetivo es que haya un lugar para todas las exalumnas que les gusta el deporte y quieran seguir aprendiendo, formando parte de un equipo donde se prioriza el esfuerzo y el compromiso.",
          schedule: "Martes y jueves de 19:30 a 22:30",
          location: "Parque Loyola",
          contact: { name: "Lola Delafond", phone: "091 878 717" },
          image: "/images/deportes/Hockey.jpg",
        },
        {
          name: "Mami Hockey",
          description:
            "Lo que buscamos es practicar hockey en forma recreativa y competitiva, promover un espíritu de grupo y representar los valores del Club Seminario en todas las canchas. Competimos con diferentes equipos, en distintas categorías del Torneo de Mami Hockey de LID.",
          schedule: "Lunes y miércoles de 20:30 a 22:00",
          location: "Parque Loyola",
          contact: { name: "Alejandra Castro", phone: "094 274 524" },
          image: "/images/deportes/MamiHockey.jpg",
        },
      ]}
    />
  );
}
